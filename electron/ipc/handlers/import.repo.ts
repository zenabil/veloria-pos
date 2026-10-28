// Veloria PoS — Main-process repository: import CSV validé-avant-commit.
// Le renderer parse/valide déjà via le domaine ; le main re-valide ligne par
// ligne puis insère en UNE transaction (tout-ou-rien). Doublons barcode rejetés.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";
import { createLayer } from "./fifo";
import { normalizeBarcodeText } from "./barcode-text";
import { assertPhoneAvailable, digitsOnly, normCustomerSearch } from "./customers.repo";

/** Miroir main de la règle domaine : chiffres + séparateurs usuels, ≥ 6 chiffres.
 * (EMP-1) Sans elle, « pas-un-numero » passait le contrôle et créait une fiche. */
const IMPORT_PHONE_CHARS = /^[0-9 +().\-/\u00A0]+$/;

export interface ProductImportRow {
  name: string;
  sellingPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
  barcode: string;
}

/** Ligne client importée (format `prénom;nom;téléphone`). */
export interface CustomerImportRow {
  firstName: string;
  lastName: string;
  phone: string;
}

/**
 * Import CSV clients — TOUT-OU-RIEN (une transaction).
 *
 * Règles appliquées (le renderer a déjà validé via le domaine, le main
 * re-valide : la base reste l'autorité) :
 * - prénom et nom obligatoires ;
 * - téléphone : format borné, unicité E-28 (le contrôle applicatif
 *   `assertPhoneAvailable` AVANT l'écriture ⇒ message FR clair au lieu du
 *   rollback du trigger 0049) ;
 * - deux lignes du MÊME fichier avec le même téléphone ⇒ refus (sinon le
 *   trigger avorterait avec un message technique brut) ;
 * - `search_name` / `search_norm` recalculés comme à la création (migration
 *   0047) ⇒ le client importé est trouvable par la recherche ;
 * - sans solde, sans plafond, sans jour de règlement : l'import ne crée
 *   que des fiches, jamais de dette.
 */
export function importCustomersAtomic(
  rows: CustomerImportRow[],
  now: string,
  operationId: string,
): { imported: number; skipped: number } {
  const db = getDb();
  if (rows.length === 0) throw new Error("Fichier vide.");
  if (rows.length > 5000) throw new Error("Maximum 5 000 lignes par import.");
  // Idempotence de LOT : le même fichier rejoué rejoue le compte stocké
  // (aucune fiche en double).
  const fast = peekIdempotency<{ imported: number; skipped: number }>(
    operationId,
    "customers.import",
  );
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "customers.import", now);
    // 1. Validation TOTALE avant toute écriture (tout-ou-rien).
    const seenPhones = new Set<string>();
    for (const [i, r] of rows.entries()) {
      const line = i + 1;
      const first = r.firstName.trim();
      const last = r.lastName.trim();
      if (first.length < 1 || last.length < 1) {
        throw new Error(`Ligne ${line} : prénom et nom requis.`);
      }
      if (first.length > 100 || last.length > 100) {
        throw new Error(`Ligne ${line} : prénom ou nom trop long (100 caractères maximum).`);
      }
      const phone = r.phone.trim();
      if (phone.length > 30) {
        throw new Error(`Ligne ${line} : téléphone trop long (30 caractères maximum).`);
      }
      if (phone) {
        const digits = digitsOnly(phone);
        if (digits.length < 6 || !IMPORT_PHONE_CHARS.test(phone)) {
          throw new Error(`Ligne ${line} : téléphone invalide.`);
        }
        if (seenPhones.has(digits)) {
          throw new Error(`Ligne ${line} : téléphone en double dans le fichier.`);
        }
        seenPhones.add(digits);
        // E-28 : unicité en base (message FR clair avant l'écriture).
        assertPhoneAvailable(phone, null);
      }
    }
    // 2. Insertion (statements préparés une fois, hors boucle).
    const insertCustomerStmt = db.prepare(
      `INSERT INTO customers (uuid, operation_id, first_name, last_name, search_name, search_norm, phone, address, credit_limit_minor, initial_balance_minor, outstanding_balance_minor, debt_status, is_over_limit, settlement_day, is_bread_client, credit_allowed, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, 0, 'none', 0, NULL, 0, 0, NULL, ?, ?)`,
    );
    let imported = 0;
    for (const r of rows) {
      const first = r.firstName.trim();
      const last = r.lastName.trim();
      const search = `${first} ${last}`.trim().toLowerCase();
      insertCustomerStmt.run(
        randomUUID(),
        randomUUID(),
        first,
        last,
        search,
        normCustomerSearch(search),
        r.phone.trim() === "" ? null : r.phone.trim(),
        now,
        now,
      );
      imported++;
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'customers.imported', 'customer', 'bulk', ?, ?, ?)`,
    ).run(randomUUID(), operationId, JSON.stringify({ imported }), now);
    const result = { imported, skipped: 0 };
    storeIdempotencyResult(operationId, result);
    return result;
  });
  try {
    return tx();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ imported: number; skipped: number }>(
        operationId,
        "customers.import",
      );
      if (retry) return retry;
    }
    throw err;
  }
}

export function importProductsAtomic(
  rows: ProductImportRow[],
  now: string,
  operationId: string,
): { imported: number; skipped: number } {
  const db = getDb();
  if (rows.length === 0) throw new Error("Fichier vide.");
  if (rows.length > 5000) throw new Error("Maximum 5 000 lignes par import.");
  // M-2 batch idempotency: same file retried replays stored count (no dup rows).
  const fast = peekIdempotency<{ imported: number; skipped: number }>(
    operationId,
    "products.import",
  );
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "products.import", now);
    const seen = new Set<string>();
    // W8 : statements préparés UNE SEULE FOIS (hors boucle) — la
    // compilation du SQL était refaite pour chaque ligne importée.
    const barcodeExistsStmt = db.prepare(
      `SELECT id FROM product_barcodes WHERE barcode = ? COLLATE NOCASE`,
    );
    for (const [i, r] of rows.entries()) {
      const line = i + 1;
      if (r.name.trim().length < 2) throw new Error(`Ligne ${line} : nom requis.`);
      if (!Number.isInteger(r.sellingPriceMinor) || r.sellingPriceMinor < 0) {
        throw new Error(`Ligne ${line} : prix de vente invalide.`);
      }
      // DB-37: prix d'achat validé tôt (pas d'abort global sur CHECK après 5000 lignes).
      if (!Number.isInteger(r.purchasePriceMinor) || r.purchasePriceMinor < 0) {
        throw new Error(`Ligne ${line} : prix d'achat invalide.`);
      }
      if (!Number.isFinite(r.quantity) || r.quantity < 0) {
        throw new Error(`Ligne ${line} : quantité invalide.`);
      }
      const code = normalizeBarcodeText(r.barcode);
      if (code) {
        if (seen.has(code)) throw new Error(`Ligne ${line} : code-barres dupliqué.`);
        seen.add(code);
        const exists = barcodeExistsStmt.get(code);
        if (exists) throw new Error(`Ligne ${line} : code-barres déjà utilisé.`);
      }
    }
    let imported = 0;
    // W8 : statements d'insertion préparés une fois (hors boucle).
    const insertProductStmt = db.prepare(
      `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at)
       VALUES (?, ?, 'PIECE', ?, ?, ?, 0, ?, 1, ?, ?)`,
    );
    const insertBarcodeStmt = db.prepare(
      `INSERT INTO product_barcodes (product_id, barcode, is_primary, created_at) VALUES (?, ?, 1, ?)`,
    );
    for (const r of rows) {
      // Statut initial : min_stock_level = 0 à l'import, donc quantité > 0
      // implique toujours 'in_stock' (pas de seuil 'low_stock' ici).
      const status = r.quantity <= 0 ? "out_of_stock" : "in_stock";
      const ins = insertProductStmt.run(
        randomUUID(),
        r.name.trim(),
        r.purchasePriceMinor,
        r.sellingPriceMinor,
        r.quantity,
        status,
        now,
        now,
      );
      const pid = Number(ins.lastInsertRowid);
      const codeIns = normalizeBarcodeText(r.barcode);
      if (codeIns) {
        insertBarcodeStmt.run(pid, codeIns, now);
      }
      // FIFO : le stock initial importé devient une couche d'ouverture.
      if (r.quantity > 0) {
        createLayer({
          productId: pid,
          qty: r.quantity,
          unitCostMinor: r.purchasePriceMinor,
          reason: "import",
          now,
        });
      }
      imported++;
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'products.imported', 'products', 'bulk', ?, ?, ?)`,
    ).run(randomUUID(), operationId, JSON.stringify({ imported }), now);
    const result = { imported, skipped: 0 };
    storeIdempotencyResult(operationId, result);
    return result;
  });
  try {
    return tx();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ imported: number; skipped: number }>(
        operationId,
        "products.import",
      );
      if (retry) return retry;
    }
    throw err;
  }
}
