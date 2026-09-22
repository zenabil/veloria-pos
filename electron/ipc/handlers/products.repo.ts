// Veloria PoS — Main-process repository: products (prepared statements only).

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { consumeLayers, createLayer } from "./fifo";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";

export interface ProductRow {
  id: number;
  uuid: string;
  name: string;
  category_id: number | null;
  category_name: string | null;
  unit_code: string;
  purchase_price_minor: number;
  selling_price_minor: number;
  quantity: number;
  min_stock_level: number;
  expiration_date: string | null;
  supplier_id: number | null;
  stock_status: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  primary_barcode: string | null;
}

export function searchProducts(args: {
  query: string;
  categoryId?: number | null;
  stockFilter?: string;
  includeArchived?: boolean;
  page: number;
  pageSize: number;
}): { rows: ProductRow[]; total: number } {
  const db = getDb();
  const q = args.query.trim();
  const where: string[] = args.includeArchived ? ["1 = 1"] : ["p.is_active = 1"];
  const params: unknown[] = [];
  if (q) {
    where.push(
      `(p.name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM product_barcodes b WHERE b.product_id = p.id AND b.barcode = ?))`,
    );
    params.push(`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`, q);
  }
  if (args.categoryId != null) {
    where.push(`p.category_id = ?`);
    params.push(args.categoryId);
  }
  if (args.stockFilter === "low_stock") where.push(`p.stock_status = 'low_stock'`);
  if (args.stockFilter === "out_of_stock") where.push(`p.stock_status = 'out_of_stock'`);
  if (args.stockFilter === "in_stock") where.push(`p.stock_status = 'in_stock'`);
  const whereSql = where.join(" AND ");
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM products p WHERE ${whereSql}`)
    .get(...params) as { c: number };
  const offset = (args.page - 1) * args.pageSize;
  const rows = db
    .prepare(
      `SELECT p.*, c.name AS category_name,
        (SELECT b.barcode FROM product_barcodes b WHERE b.product_id = p.id ORDER BY b.is_primary DESC, b.id LIMIT 1) AS primary_barcode
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${whereSql} ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?`,
    )
    .all(...params, args.pageSize, offset) as ProductRow[];
  return { rows, total: totalRow.c };
}

export function getProductByBarcode(barcode: string): ProductRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT p.*, c.name AS category_name,
        (SELECT b.barcode FROM product_barcodes b WHERE b.product_id = p.id ORDER BY b.is_primary DESC, b.id LIMIT 1) AS primary_barcode
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = (SELECT product_id FROM product_barcodes WHERE barcode = ?)
       AND p.is_active = 1 LIMIT 1`,
    )
    .get(barcode) as ProductRow | undefined;
  return row ?? null;
}

export interface ProductMatchBatchItem {
  barcode: string | null;
  name: string;
}

export interface ProductMatchBatchResult {
  /** Correspondance exacte par code-barres (prioritaire), sinon null. */
  barcodeHit: ProductRow | null;
  /** Candidats par nom (top 5, recherche LIKE bornée) pour le flou local. */
  candidates: ProductRow[];
}

/**
 * Appariement par lot (import OCR) : UNE traversée IPC pour ≤ 150 lignes.
 * Le main boucle en local (même connexion) ; le renderer applique la logique
 * floue (`matchByName`) sur les candidats — aucun aller-retour par ligne.
 */
export function matchProductsBatch(items: ProductMatchBatchItem[]): ProductMatchBatchResult[] {
  return items.map((item) => {
    if (item.barcode) {
      const hit = getProductByBarcode(item.barcode);
      if (hit) return { barcodeHit: hit, candidates: [] };
    }
    const q = item.name.slice(0, 60);
    if (q.trim().length < 2) return { barcodeHit: null, candidates: [] };
    return {
      barcodeHit: null,
      candidates: searchProducts({ query: q, page: 1, pageSize: 5 }).rows,
    };
  });
}

export function getProduct(id: number): ProductRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT p.*, c.name AS category_name, NULL AS primary_barcode FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ? LIMIT 1`,
    )
    .get(id) as ProductRow | undefined;
  return row ?? null;
}

/** Tous les codes-barres (principal d'abord) pour l'éditeur multi-barcodes. */
export function getProductBarcodes(id: number): { barcode: string; is_primary: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT barcode, is_primary FROM product_barcodes WHERE product_id = ? ORDER BY is_primary DESC, id`,
    )
    .all(id) as { barcode: string; is_primary: number }[];
}

export function createProduct(input: {
  uuid: string;
  operationId: string;
  name: string;
  categoryId: number | null;
  unitCode: string;
  purchasePriceMinor: number;
  sellingPriceMinor: number;
  quantity: number;
  minStockLevel: number;
  maxStockLevel: number;
  expirationDate: string | null;
  supplierId: number | null;
  barcodes: string[];
  now: string;
}): number {
  const db = getDb();
  // Idempotence (migration 0022) : rejouer le même operationId (retry IPC,
  // double-clic avant le verrou `busy`) retrouve le produit au lieu de le
  // dupliquer. L'UNIQUE(operation_id) tranche les courses.
  const findExisting = (): number | undefined => {
    const existing = db
      .prepare(`SELECT id FROM products WHERE operation_id = ?`)
      .get(input.operationId) as { id: number } | undefined;
    return existing ? Number(existing.id) : undefined;
  };
  const fast = findExisting();
  if (fast != null) return fast;
  const stockStatus =
    input.quantity <= 0
      ? "out_of_stock"
      : input.quantity <= input.minStockLevel
        ? "low_stock"
        : "in_stock";
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO products (uuid, operation_id, name, category_id, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, max_stock_level, expiration_date, supplier_id, stock_status, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        input.uuid,
        input.operationId,
        input.name.trim(),
        input.categoryId,
        input.unitCode,
        input.purchasePriceMinor,
        input.sellingPriceMinor,
        input.quantity,
        input.minStockLevel,
        input.maxStockLevel,
        input.expirationDate,
        input.supplierId,
        stockStatus,
        input.now,
        input.now,
      );
    const productId = Number(r.lastInsertRowid);
    input.barcodes.forEach((b, i) => {
      db.prepare(
        `INSERT INTO product_barcodes (product_id, barcode, is_primary, created_at) VALUES (?, ?, ?, ?)`,
      ).run(productId, b.trim(), i === 0 ? 1 : 0, input.now);
    });
    // Jonction N-N : le principal doit exister aussi dans product_suppliers
    // (sinon la fiche fournisseur ne liste pas ce produit).
    if (input.supplierId != null) {
      db.prepare(
        `INSERT OR IGNORE INTO product_suppliers (product_id, supplier_id, created_at) VALUES (?, ?, ?)`,
      ).run(productId, input.supplierId, input.now);
    }
    if (input.quantity > 0) {
      db.prepare(
        `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, reason, created_at)
         VALUES (?, ?, 'intake_in', ?, ?, ?, 'product_create', 'Création produit', ?)`,
      ).run(
        randomUUID(),
        productId,
        input.quantity,
        input.quantity,
        input.purchasePriceMinor,
        input.now,
      );
      // FIFO : le stock initial devient la première couche (au coût saisi).
      createLayer({
        productId,
        qty: input.quantity,
        unitCostMinor: input.purchasePriceMinor,
        reason: "product_create",
        now: input.now,
      });
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'product.created', 'product', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(productId),
      // P20: identité de l'opération (rejouement = même audit, pas de doublon).
      input.operationId,
      // P3 : marge tracée (vente à perte confirmée explicitement côté caisse).
      JSON.stringify({
        name: input.name,
        negativeMargin:
          input.purchasePriceMinor > 0 && input.sellingPriceMinor < input.purchasePriceMinor,
      }),
      input.now,
    );
    return productId;
  });
  try {
    return (tx as unknown as () => number)();
  } catch (err) {
    // Course rejouée : l'autre transaction a inséré le même operationId.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: products\.operation_id/i.test(err.message)
    ) {
      const retry = findExisting();
      if (retry != null) return retry;
    }
    throw err;
  }
}

export function updateProduct(input: {
  id: number;
  name: string;
  categoryId: number | null;
  unitCode: string;
  purchasePriceMinor: number;
  sellingPriceMinor: number;
  quantity: number;
  minStockLevel: number;
  maxStockLevel: number;
  expirationDate: string | null;
  supplierId: number | null;
  barcodes: string[];
  now: string;
}): void {
  const db = getDb();
  const stockStatus =
    input.quantity <= 0
      ? "out_of_stock"
      : input.quantity <= input.minStockLevel
        ? "low_stock"
        : "in_stock";
  const tx = db.transaction(() => {
    const old = db.prepare(`SELECT quantity FROM products WHERE id = ?`).get(input.id) as
      | { quantity: number }
      | undefined;
    if (!old) throw new Error("Produit introuvable.");
    db.prepare(
      `UPDATE products SET name=?, category_id=?, unit_code=?, purchase_price_minor=?, selling_price_minor=?, quantity=?, min_stock_level=?, max_stock_level=?, expiration_date=?, supplier_id=?, stock_status=?, updated_at=? WHERE id=?`,
    ).run(
      input.name.trim(),
      input.categoryId,
      input.unitCode,
      input.purchasePriceMinor,
      input.sellingPriceMinor,
      input.quantity,
      input.minStockLevel,
      input.maxStockLevel,
      input.expirationDate,
      input.supplierId,
      stockStatus,
      input.now,
      input.id,
    );
    db.prepare(`DELETE FROM product_barcodes WHERE product_id = ?`).run(input.id);
    input.barcodes.forEach((b, i) => {
      db.prepare(
        `INSERT INTO product_barcodes (product_id, barcode, is_primary, created_at) VALUES (?, ?, ?, ?)`,
      ).run(input.id, b.trim(), i === 0 ? 1 : 0, input.now);
    });
    // Jonction N-N : garde le principal synchronisé avec la jonction.
    // (setProductSuppliers reste la voie complète multi-fournisseurs.)
    if (input.supplierId != null) {
      db.prepare(
        `INSERT OR IGNORE INTO product_suppliers (product_id, supplier_id, created_at) VALUES (?, ?, ?)`,
      ).run(input.id, input.supplierId, input.now);
    }
    // FIFO : une correction manuelle de quantité reste traçable — apport →
    // nouvelle couche (au nouveau coût), retrait → consommation des plus
    // anciennes couches. Un simple changement de prix ne crée aucune couche.
    const qtyDelta = input.quantity - Number(old.quantity);
    if (qtyDelta > 0) {
      createLayer({
        productId: input.id,
        qty: qtyDelta,
        unitCostMinor: input.purchasePriceMinor,
        reason: "adjust",
        now: input.now,
      });
    } else if (qtyDelta < 0) {
      consumeLayers({
        productId: input.id,
        qty: -qtyDelta,
        now: input.now,
        oversell: false,
        fallbackUnitCostMinor: 0,
      });
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'product.updated', 'product', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(input.id),
      randomUUID(),
      JSON.stringify({ name: input.name.trim() }),
      input.now,
    );
  });
  (tx as unknown as () => void)();
}

export function restoreProduct(id: number, now: string, operationId: string): void {
  const db = getDb();
  // P1-6 : rejouabilité — retry après succès rejoue au lieu d'écrire un
  // second audit (ou de lever « introuvable » sur suppression rejouée).
  const fast = peekIdempotency<{ restored: boolean }>(operationId, "products.restore");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "products.restore", now);
    const r = db
      .prepare(`UPDATE products SET is_active = 1, deleted_at = NULL, updated_at = ? WHERE id = ?`)
      .run(now, id);
    if (r.changes === 0) throw new Error("Produit introuvable.");
    // P8: restauration tracée.
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'product.restored', 'product', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), operationId, JSON.stringify({}), now);
    storeIdempotencyResult(operationId, { restored: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ restored: boolean }>(operationId, "products.restore");
      if (retry) return;
    }
    throw err;
  }
}

export function archiveProduct(id: number, now: string, operationId: string): void {
  const db = getDb();
  const fast = peekIdempotency<{ archived: boolean }>(operationId, "products.archive");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "products.archive", now);
    db.prepare(
      `UPDATE products SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, id);
    // P8: archivage tracé.
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'product.archived', 'product', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), operationId, JSON.stringify({}), now);
    storeIdempotencyResult(operationId, { archived: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ archived: boolean }>(operationId, "products.archive");
      if (retry) return;
    }
    throw err;
  }
}

// Tables historisant un produit : toute présence bloque la suppression
// définitive (les clés étrangères sont actives : ON DELETE RESTRICT implicite).
// Les couches FIFO et leur consommation sont de l'historique de valorisation :
// elles bloquent aussi (sinon violation FK brute au lieu d'un message FR).
const PRODUCT_USAGE_TABLES = [
  "sale_items",
  "stock_movements",
  "stock_intake_items",
  "return_items",
  "supplier_return_items",
  "proforma_items",
  "inventory_layers",
  "sale_fifo_consumption",
] as const;

/**
 * Suppression DÉFINITIVE (irréversible) : réservée aux produits archivés et
 * jamais utilisés. Les codes-barres partent en cascade ; l'historique des
 * ventes/mouvements/devis reste intact car leur présence bloque ici.
 */
export function deleteProductAtomic(id: number, now: string, operationId: string): void {
  const db = getDb();
  const fast = peekIdempotency<{ deleted: boolean }>(operationId, "products.delete");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "products.delete", now);
    const row = db.prepare(`SELECT id, name, is_active FROM products WHERE id = ?`).get(id) as
      | { id: number; name: string; is_active: number }
      | undefined;
    if (!row) throw new Error("Produit introuvable.");
    if (row.is_active === 1) {
      throw new Error("Archivez le produit avant sa suppression définitive.");
    }
    for (const table of PRODUCT_USAGE_TABLES) {
      const c = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE product_id = ?`).get(id) as {
        c: number;
      };
      if (c.c > 0) {
        throw new Error(
          "Produit présent dans l'historique : suppression définitive impossible (archivage uniquement).",
        );
      }
    }
    // Liaison N-N : suppression explicite (plutôt que CASCADE silencieux) —
    // traçée dans l'audit ci-dessous, dans la même transaction.
    db.prepare(`DELETE FROM product_suppliers WHERE product_id = ?`).run(id);
    db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'product.deleted', 'product', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), operationId, JSON.stringify({ name: row.name }), now);
    storeIdempotencyResult(operationId, { deleted: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ deleted: boolean }>(operationId, "products.delete");
      if (retry) return;
    }
    throw err;
  }
}

export function listCategories(): { id: number; name: string }[] {
  const db = getDb();
  return db
    .prepare(`SELECT id, name FROM categories WHERE is_active = 1 ORDER BY name COLLATE NOCASE`)
    .all() as { id: number; name: string }[];
}

export function createCategory(name: string, now: string): number {
  const db = getDb();
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("Nom de catégorie requis.");
  // P8: création tracée (référentiel catalogue).
  const tx = db.transaction(() => {
    const r = db
      .prepare(`INSERT INTO categories (uuid, name, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run(randomUUID(), trimmed, now, now);
    const id = Number(r.lastInsertRowid);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'category.created', 'category', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), randomUUID(), JSON.stringify({ name: trimmed }), now);
    return id;
  });
  return (tx as unknown as () => number)();
}

// ---------------------------------------------------------------------------
// Liaison produits ↔ fournisseurs (jonction 0015).
// `supplier_id` reste le principal (= premier lié) pour compatibilité.
// ---------------------------------------------------------------------------

export function getProductSuppliers(productId: number): { id: number; name: string }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.id, s.name FROM product_suppliers ps JOIN suppliers s ON s.id = ps.supplier_id WHERE ps.product_id = ? ORDER BY s.name COLLATE NOCASE`,
    )
    .all(productId) as { id: number; name: string }[];
}

export function setProductSuppliersAtomic(
  productId: number,
  supplierIds: number[],
  now: string,
): { linked: number } {
  const db = getDb();
  const unique = [...new Set(supplierIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (unique.length > 100) throw new Error("Trop de fournisseurs liés (100 max).");
  const tx = db.transaction(() => {
    const prod = db.prepare(`SELECT id FROM products WHERE id = ?`).get(productId) as
      | { id: number }
      | undefined;
    if (!prod) throw new Error("Produit introuvable.");
    for (const sid of unique) {
      const sup = db.prepare(`SELECT id FROM suppliers WHERE id = ?`).get(sid) as
        | { id: number }
        | undefined;
      if (!sup) throw new Error("Fournisseur introuvable.");
    }
    db.prepare(`DELETE FROM product_suppliers WHERE product_id = ?`).run(productId);
    for (const sid of unique) {
      db.prepare(
        `INSERT INTO product_suppliers (product_id, supplier_id, created_at) VALUES (?, ?, ?)`,
      ).run(productId, sid, now);
    }
    // Principal synchronisé (premier lié, sinon aucun).
    db.prepare(`UPDATE products SET supplier_id = ?, updated_at = ? WHERE id = ?`).run(
      unique[0] ?? null,
      now,
      productId,
    );
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'product.suppliers', 'product', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(productId),
      randomUUID(),
      JSON.stringify({ count: unique.length }),
      now,
    );
  });
  (tx as unknown as () => void)();
  return { linked: unique.length };
}
