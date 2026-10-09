// Veloria PoS — Main-process repository: import CSV validé-avant-commit.
// Le renderer parse/valide déjà via le domaine ; le main re-valide ligne par
// ligne puis insère en UNE transaction (tout-ou-rien). Doublons barcode rejetés.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";
import { createLayer } from "./fifo";

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
      const code = r.barcode.trim();
      if (code) {
        if (seen.has(code)) throw new Error(`Ligne ${line} : code-barres dupliqué.`);
        seen.add(code);
        const exists = db.prepare(`SELECT id FROM product_barcodes WHERE barcode = ?`).get(code);
        if (exists) throw new Error(`Ligne ${line} : code-barres déjà utilisé.`);
      }
    }
    let imported = 0;
    for (const r of rows) {
      // Statut initial : min_stock_level = 0 à l'import, donc quantité > 0
      // implique toujours 'in_stock' (pas de seuil 'low_stock' ici).
      const status = r.quantity <= 0 ? "out_of_stock" : "in_stock";
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
      const codeIns = r.barcode.trim();
      if (codeIns) {
        db.prepare(
          `INSERT INTO product_barcodes (product_id, barcode, is_primary, created_at) VALUES (?, ?, 1, ?)`,
        ).run(pid, codeIns, now);
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
    return (tx as unknown as () => { imported: number; skipped: number })();
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
