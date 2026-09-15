// Veloria PoS — Main-process repository: stock & inventaire (Phase 6).
// Transactions atomiques + prepared statements uniquement.
// Réception : entrée + lignes + mouvements + quantités + solde fournisseur + audit = 1 tx.
// Ajustement : produit + mouvement + audit = 1 tx.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";

export interface IntakeLineInput {
  productId: number | null;
  productName: string;
  quantityReceived: number;
  quantityDamaged: number;
  purchasePriceMinor: number;
}

export function stockStatusFor(qty: number, minLevel: number): string {
  if (qty <= 0) return "out_of_stock";
  if (qty <= minLevel) return "low_stock";
  return "in_stock";
}

export function getStockOverview(): {
  skuActive: number;
  inventoryValueMinor: number;
  lowStock: number;
  outOfStock: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS sku,
        COALESCE(SUM(quantity * purchase_price_minor), 0) AS val,
        COALESCE(SUM(CASE WHEN quantity > 0 AND quantity <= min_stock_level THEN 1 ELSE 0 END), 0) AS low,
        COALESCE(SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END), 0) AS out
       FROM products WHERE is_active = 1`,
    )
    .get() as { sku: number; val: number; low: number; out: number };
  return {
    skuActive: row.sku,
    inventoryValueMinor: Math.round(row.val),
    lowStock: row.low,
    outOfStock: row.out,
  };
}

export function listLowStock(limit: number): unknown[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, quantity, min_stock_level, stock_status, selling_price_minor
       FROM products WHERE is_active = 1 AND quantity <= min_stock_level
       ORDER BY quantity ASC LIMIT ?`,
    )
    .all(limit);
}

export function getLedger(productId: number, limit: number): unknown[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT ?`)
    .all(productId, limit);
}

export function adjustStockAtomic(args: {
  productId: number;
  newQuantity: number;
  reason: string;
  operationId: string;
  now: string;
}): { quantityAfter: number } {
  const db = getDb();
  const tx = db.transaction(() => {
    const prod = db
      .prepare(`SELECT quantity, min_stock_level FROM products WHERE id = ?`)
      .get(args.productId) as { quantity: number; min_stock_level: number } | undefined;
    if (!prod) throw new Error("Produit introuvable.");
    if (!Number.isFinite(args.newQuantity) || args.newQuantity < 0) {
      throw new Error("Quantité d'ajustement invalide.");
    }
    if (args.reason.trim().length < 2) throw new Error("Motif d'ajustement requis.");
    const delta = args.newQuantity - Number(prod.quantity);
    if (delta === 0) throw new Error("Aucune variation à enregistrer.");
    const movement: "adjust_in" | "adjust_out" = delta > 0 ? "adjust_in" : "adjust_out";
    db.prepare(
      `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
    ).run(args.newQuantity, args.newQuantity, args.newQuantity, args.now, args.productId);
    db.prepare(
      `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, related_entity_type, reason, created_at)
       VALUES (?, ?, ?, ?, ?, 'adjustment', ?, ?)`,
    ).run(randomUUID(), args.productId, movement, delta, args.newQuantity, args.reason, args.now);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'stock.adjusted', 'product', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.productId),
      args.operationId,
      JSON.stringify({ delta, after: args.newQuantity, reason: args.reason }),
      args.now,
    );
    return { quantityAfter: args.newQuantity };
  });
  return (tx as unknown as () => { quantityAfter: number })();
}

export function receiveStockAtomic(args: {
  supplierId: number | null;
  invoiceNumber: string | null;
  invoiceDate: string;
  shippingMinor: number;
  notes: string | null;
  lines: IntakeLineInput[];
  operationId: string;
  now: string;
}): { intakeId: number; totalMinor: number } {
  const db = getDb();
  const tx = db.transaction(() => {
    if (args.lines.length === 0) throw new Error("L'entrée doit contenir au moins une ligne.");
    let subtotal = 0;
    const prepared: {
      productId: number | null;
      name: string;
      net: number;
      damaged: number;
      received: number;
      cost: number;
      lineTotal: number;
    }[] = [];
    for (const l of args.lines) {
      if (l.productName.trim().length === 0) throw new Error("Ligne sans nom de produit.");
      if (!(l.quantityReceived > 0)) throw new Error("Quantité reçue invalide.");
      if (l.quantityDamaged < 0 || l.quantityDamaged > l.quantityReceived) {
        throw new Error("Quantité abîmée invalide.");
      }
      if (!Number.isInteger(l.purchasePriceMinor) || l.purchasePriceMinor < 0) {
        throw new Error("Coût d'achat invalide.");
      }
      const net = l.quantityReceived - l.quantityDamaged;
      const lineTotal = Math.round(l.purchasePriceMinor * net);
      subtotal += lineTotal;
      prepared.push({
        productId: l.productId,
        name: l.productName.trim(),
        net,
        damaged: l.quantityDamaged,
        received: l.quantityReceived,
        cost: l.purchasePriceMinor,
        lineTotal,
      });
    }
    const total = subtotal + args.shippingMinor;
    const r = db
      .prepare(
        `INSERT INTO stock_intakes (uuid, supplier_id, invoice_number, invoice_date, subtotal_minor, shipping_cost_minor, total_minor, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'committed', ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        args.supplierId,
        args.invoiceNumber?.trim() || null,
        args.invoiceDate,
        subtotal,
        args.shippingMinor,
        total,
        args.notes?.trim() || null,
        args.now,
        args.now,
      );
    const intakeId = Number(r.lastInsertRowid);
    for (const p of prepared) {
      db.prepare(
        `INSERT INTO stock_intake_items (stock_intake_id, product_id, product_name_snapshot, quantity_received, quantity_damaged, purchase_price_minor, landing_cost_minor)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(intakeId, p.productId, p.name, p.received, p.damaged, p.cost, p.cost);
      if (p.productId != null && p.net > 0) {
        const prod = db
          .prepare(`SELECT quantity, min_stock_level FROM products WHERE id = ?`)
          .get(p.productId) as { quantity: number; min_stock_level: number };
        const after = Number(prod.quantity) + p.net;
        db.prepare(
          `UPDATE products SET quantity = ?, purchase_price_minor = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
        ).run(after, p.cost, after, after, args.now, p.productId);
        db.prepare(
          `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, created_at)
           VALUES (?, ?, 'intake_in', ?, ?, ?, 'intake', ?, 'Entrée fournisseur', ?)`,
        ).run(randomUUID(), p.productId, p.net, after, p.cost, String(intakeId), args.now);
      }
    }
    if (args.supplierId != null) {
      db.prepare(
        `UPDATE suppliers SET outstanding_balance_minor = outstanding_balance_minor + ?, updated_at = ? WHERE id = ?`,
      ).run(total, args.now, args.supplierId);
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'stock.intake', 'intake', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(intakeId),
      args.operationId,
      JSON.stringify({ total, lines: prepared.length, supplier: args.supplierId }),
      args.now,
    );
    return { intakeId, totalMinor: total };
  });
  return (tx as unknown as () => { intakeId: number; totalMinor: number })();
}

export function listIntakes(page: number, pageSize: number): { rows: unknown[]; total: number } {
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM stock_intakes`).get() as { c: number }).c;
  const rows = db
    .prepare(
      `SELECT si.*, s.name AS supplier_name FROM stock_intakes si LEFT JOIN suppliers s ON s.id = si.supplier_id ORDER BY si.id DESC LIMIT ? OFFSET ?`,
    )
    .all(pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function getInventoryValuation(): {
  valueMinor: number;
  skuActive: number;
  lines: unknown[];
} {
  const db = getDb();
  const head = db
    .prepare(
      `SELECT COUNT(*) AS sku, COALESCE(SUM(quantity * purchase_price_minor),0) AS val FROM products WHERE is_active = 1`,
    )
    .get() as { sku: number; val: number };
  const lines = db
    .prepare(
      `SELECT id, name, quantity, purchase_price_minor, quantity * purchase_price_minor AS line_value FROM products WHERE is_active = 1 ORDER BY line_value DESC LIMIT 50`,
    )
    .all();
  return { valueMinor: Math.round(head.val), skuActive: head.sku, lines };
}
