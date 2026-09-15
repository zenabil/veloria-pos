// Veloria PoS — Main-process repository: products (prepared statements only).

import { getDb } from "../../database/sqlite.service";

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
  page: number;
  pageSize: number;
}): { rows: ProductRow[]; total: number } {
  const db = getDb();
  const q = args.query.trim();
  const where: string[] = ["p.is_active = 1"];
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

export function getProduct(id: number): ProductRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT p.*, c.name AS category_name, NULL AS primary_barcode FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ? LIMIT 1`,
    )
    .get(id) as ProductRow | undefined;
  return row ?? null;
}

export function createProduct(input: {
  uuid: string;
  name: string;
  categoryId: number | null;
  unitCode: string;
  purchasePriceMinor: number;
  sellingPriceMinor: number;
  quantity: number;
  minStockLevel: number;
  expirationDate: string | null;
  supplierId: number | null;
  barcodes: string[];
  now: string;
}): number {
  const db = getDb();
  const stockStatus =
    input.quantity <= 0
      ? "out_of_stock"
      : input.quantity <= input.minStockLevel
        ? "low_stock"
        : "in_stock";
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO products (uuid, name, category_id, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, expiration_date, supplier_id, stock_status, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        input.uuid,
        input.name.trim(),
        input.categoryId,
        input.unitCode,
        input.purchasePriceMinor,
        input.sellingPriceMinor,
        input.quantity,
        input.minStockLevel,
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
    if (input.quantity > 0) {
      db.prepare(
        `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, reason, created_at)
         VALUES (?, ?, 'intake_in', ?, ?, ?, 'product_create', 'Création produit', ?)`,
      ).run(
        cryptoUuid(),
        productId,
        input.quantity,
        input.quantity,
        input.purchasePriceMinor,
        input.now,
      );
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'product.created', 'product', ?, ?, ?, ?)`,
    ).run(
      cryptoUuid(),
      String(productId),
      cryptoUuid(),
      JSON.stringify({ name: input.name }),
      input.now,
    );
    return productId;
  });
  return (tx as unknown as () => number)();
}

function cryptoUuid(): string {
  // main-process uuid (node crypto)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
  return randomUUID();
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
    db.prepare(
      `UPDATE products SET name=?, category_id=?, unit_code=?, purchase_price_minor=?, selling_price_minor=?, quantity=?, min_stock_level=?, expiration_date=?, supplier_id=?, stock_status=?, updated_at=? WHERE id=?`,
    ).run(
      input.name.trim(),
      input.categoryId,
      input.unitCode,
      input.purchasePriceMinor,
      input.sellingPriceMinor,
      input.quantity,
      input.minStockLevel,
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
  });
  (tx as unknown as () => void)();
}

export function archiveProduct(id: number, now: string): void {
  const db = getDb();
  db.prepare(`UPDATE products SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?`).run(
    now,
    now,
    id,
  );
}
