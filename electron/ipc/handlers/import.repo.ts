// Veloria PoS — Main-process repository: import CSV validé-avant-commit.
// Le renderer parse/valide déjà via le domaine ; le main re-valide ligne par
// ligne puis insère en UNE transaction (tout-ou-rien). Doublons barcode rejetés.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";

export interface ProductImportRow {
  name: string;
  sellingPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
  barcode: string;
}

export function importProductsAtomic(
  rows: ProductImportRow[],
  now: string,
): { imported: number; skipped: number } {
  const db = getDb();
  if (rows.length === 0) throw new Error("Fichier vide.");
  if (rows.length > 5000) throw new Error("Maximum 5 000 lignes par import.");
  const tx = db.transaction(() => {
    const seen = new Set<string>();
    for (const [i, r] of rows.entries()) {
      const line = i + 1;
      if (r.name.trim().length < 2) throw new Error(`Ligne ${line} : nom requis.`);
      if (!Number.isInteger(r.sellingPriceMinor) || r.sellingPriceMinor < 0) {
        throw new Error(`Ligne ${line} : prix de vente invalide.`);
      }
      if (!Number.isFinite(r.quantity) || r.quantity < 0) {
        throw new Error(`Ligne ${line} : quantité invalide.`);
      }
      if (r.barcode) {
        if (seen.has(r.barcode)) throw new Error(`Ligne ${line} : code-barres dupliqué.`);
        seen.add(r.barcode);
        const exists = db
          .prepare(`SELECT id FROM product_barcodes WHERE barcode = ?`)
          .get(r.barcode);
        if (exists) throw new Error(`Ligne ${line} : code-barres déjà utilisé.`);
      }
    }
    let imported = 0;
    for (const r of rows) {
      const status =
        r.quantity <= 0 ? "out_of_stock" : r.quantity <= 0 ? "out_of_stock" : "in_stock";
      const ins = db
        .prepare(
          `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at)
           VALUES (?, ?, 'PIECE', ?, ?, ?, 0, ?, 1, ?, ?)`,
        )
        .run(
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
      if (r.barcode) {
        db.prepare(
          `INSERT INTO product_barcodes (product_id, barcode, is_primary, created_at) VALUES (?, ?, 1, ?)`,
        ).run(pid, r.barcode.trim(), now);
      }
      imported++;
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'products.imported', 'products', 'bulk', ?, ?, ?)`,
    ).run(randomUUID(), randomUUID(), JSON.stringify({ imported }), now);
    return { imported, skipped: 0 };
  });
  return (tx as unknown as () => { imported: number; skipped: number })();
}

export interface CustomerImportRow {
  firstName: string;
  lastName: string;
  phone: string;
}

export function importCustomersAtomic(
  rows: CustomerImportRow[],
  now: string,
): { imported: number } {
  const db = getDb();
  if (rows.length === 0) throw new Error("Fichier vide.");
  if (rows.length > 5000) throw new Error("Maximum 5 000 lignes par import.");
  const tx = db.transaction(() => {
    for (const [i, r] of rows.entries()) {
      const line = i + 1;
      if (r.firstName.trim().length < 1 || r.lastName.trim().length < 1) {
        throw new Error(`Ligne ${line} : prénom et nom requis.`);
      }
    }
    let imported = 0;
    for (const r of rows) {
      const search = `${r.firstName} ${r.lastName}`.trim().toLowerCase();
      db.prepare(
        `INSERT INTO customers (uuid, first_name, last_name, search_name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        r.firstName.trim(),
        r.lastName.trim(),
        search,
        r.phone.trim() || null,
        now,
        now,
      );
      imported++;
    }
    return { imported };
  });
  return (tx as unknown as () => { imported: number })();
}
