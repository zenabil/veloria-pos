// Veloria PoS — Main-process repository: stock & inventaire (Phase 6).
// Transactions atomiques + prepared statements uniquement.
// Réception : entrée + lignes + mouvements + quantités + solde fournisseur + audit = 1 tx.
// Ajustement : produit + mouvement + audit = 1 tx.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { consumeLayers, createLayer, fifoValuation } from "./fifo";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";

export interface IntakeLineInput {
  productId: number | null;
  productName: string;
  quantityReceived: number;
  quantityDamaged: number;
  purchasePriceMinor: number;
  /**
   * Prix de vente par ligne (centimes) : null = champ laissé vide → conserver
   * le prix actuel du produit existant (0 par défaut à la création).
   */
  sellingPriceMinor: number | null;
}

export function getStockOverview(): {
  skuActive: number;
  inventoryValueMinor: number;
  totalQty: number;
  lowStock: number;
  outOfStock: number;
} {
  const db = getDb();
  // Valeur = couches FIFO restantes (produits actifs) ; quantité = stock physique.
  const row = db
    .prepare(
      `SELECT COUNT(*) AS sku,
        COALESCE(SUM(quantity), 0) AS qty,
        COALESCE(SUM(CASE WHEN quantity > 0 AND quantity <= min_stock_level THEN 1 ELSE 0 END), 0) AS low,
        COALESCE(SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END), 0) AS out
       FROM products WHERE is_active = 1`,
    )
    .get() as { sku: number; qty: number; low: number; out: number };
  return {
    skuActive: row.sku,
    inventoryValueMinor: fifoValuation(),
    totalQty: Math.round(row.qty * 1000) / 1000,
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
  reference: string | null;
  operationId: string;
  now: string;
}): { quantityAfter: number } {
  const db = getDb();
  const fast = peekIdempotency<{ quantityAfter: number }>(args.operationId, "stock.adjust");
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "stock.adjust", args.now);
    const prod = db
      .prepare(`SELECT quantity, min_stock_level, purchase_price_minor FROM products WHERE id = ?`)
      .get(args.productId) as
      { quantity: number; min_stock_level: number; purchase_price_minor: number } | undefined;
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
    // FIFO : apport → nouvelle couche (au dernier coût connu) ; retrait →
    // consommation des couches les plus anciennes (même transaction).
    if (delta > 0) {
      createLayer({
        productId: args.productId,
        qty: delta,
        unitCostMinor: Number(prod.purchase_price_minor),
        reason: "adjust",
        now: args.now,
      });
    } else {
      consumeLayers({
        productId: args.productId,
        qty: -delta,
        now: args.now,
        oversell: false,
        fallbackUnitCostMinor: 0,
      });
    }
    db.prepare(
      `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, related_entity_type, reason, reference, created_at)
       VALUES (?, ?, ?, ?, ?, 'adjustment', ?, ?, ?)`,
    ).run(
      randomUUID(),
      args.productId,
      movement,
      delta,
      args.newQuantity,
      args.reason,
      args.reference?.trim() || null,
      args.now,
    );
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'stock.adjusted', 'product', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.productId),
      args.operationId,
      JSON.stringify({ delta, after: args.newQuantity, reason: args.reason }),
      args.now,
    );
    const result = { quantityAfter: args.newQuantity };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return (tx as unknown as () => { quantityAfter: number })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ quantityAfter: number }>(args.operationId);
      if (retry) return retry;
    }
    throw err;
  }
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
  // Idempotence : rejouer le même operationId (double-clic, retry IPC) retourne
  // la réception existante sans toucher stock / fournisseur (cf. sales).
  // Les lignes antérieures à 0017 ont operation_id NULL et ne correspondent jamais.
  // Garde anti-course : en cas d'insertion concurrente, l'UNIQUE(operation_id)
  // tranche et le perdant relit la réception existante (voir catch ci-dessous).
  const findExisting = (): { intakeId: number; totalMinor: number } | undefined => {
    try {
      const found = db
        .prepare(`SELECT id, total_minor FROM stock_intakes WHERE operation_id = ?`)
        .get(args.operationId) as { id: number; total_minor: number } | undefined;
      if (found) return { intakeId: found.id, totalMinor: found.total_minor };
      return undefined;
    } catch {
      // #36 : fast-path illisible — la transaction (claim UNIQUE) tranche ;
      // on trace au lieu d'avaler.
      console.warn("[Veloria][WARN] intake.fast_lookup_failed", {
        operationId: args.operationId,
      });
      return undefined;
    }
  };
  const fast = findExisting();
  if (fast) return fast;
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
      selling: number | null;
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
      if (
        l.sellingPriceMinor !== null &&
        (!Number.isInteger(l.sellingPriceMinor) || l.sellingPriceMinor < 0)
      ) {
        throw new Error("Prix de vente invalide.");
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
        selling: l.sellingPriceMinor,
        lineTotal,
      });
    }
    const total = subtotal + args.shippingMinor;
    const r = db
      .prepare(
        `INSERT INTO stock_intakes (uuid, supplier_id, invoice_number, invoice_date, subtotal_minor, shipping_cost_minor, total_minor, status, notes, operation_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'committed', ?, ?, ?, ?)`,
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
        args.operationId,
        args.now,
        args.now,
      );
    const intakeId = Number(r.lastInsertRowid);
    for (const p of prepared) {
      // Ligne libre (nouveau produit par son nom) : création catalogue dans la
      // même transaction (quantité initiale = net, prix d'achat saisi, prix de
      // vente saisi ou 0 — le projet autorise 0, jamais de marge automatique).
      let pid = p.productId;
      if (pid == null) {
        const status = p.net <= 0 ? "out_of_stock" : "in_stock";
        const ins = db
          .prepare(
            `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, max_stock_level, supplier_id, stock_status, is_active, created_at, updated_at)
             VALUES (?, ?, 'PIECE', ?, ?, ?, 0, 0, ?, ?, 1, ?, ?)`,
          )
          .run(
            randomUUID(),
            p.name,
            p.cost,
            p.selling ?? 0,
            p.net,
            args.supplierId,
            status,
            args.now,
            args.now,
          );
        pid = Number(ins.lastInsertRowid);
        if (args.supplierId != null) {
          db.prepare(
            `INSERT OR IGNORE INTO product_suppliers (product_id, supplier_id, created_at) VALUES (?, ?, ?)`,
          ).run(pid, args.supplierId, args.now);
        }
        db.prepare(
          `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'product.created', 'product', ?, ?, ?, ?)`,
        ).run(
          randomUUID(),
          String(pid),
          randomUUID(),
          JSON.stringify({ name: p.name, fromIntake: intakeId }),
          args.now,
        );
      }
      const itemIns = db
        .prepare(
          `INSERT INTO stock_intake_items (stock_intake_id, product_id, product_name_snapshot, quantity_received, quantity_damaged, purchase_price_minor, landing_cost_minor)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(intakeId, pid, p.name, p.received, p.damaged, p.cost, p.cost);
      const intakeItemId = Number(itemIns.lastInsertRowid);
      if (p.net > 0) {
        // FIFO : chaque apport net crée sa propre couche (jamais de fusion).
        createLayer({
          productId: pid,
          intakeId,
          intakeItemId,
          qty: p.net,
          unitCostMinor: p.cost,
          purchaseDate: args.invoiceDate,
          reason: "intake",
          now: args.now,
        });
        if (p.productId != null) {
          // Produit existant : stock += net, coût = dernier coût, vente = saisie
          // ou conservation de l'actuel (jamais d'écrasement par vide).
          const prod = db
            .prepare(
              `SELECT quantity, min_stock_level, selling_price_minor FROM products WHERE id = ?`,
            )
            .get(pid) as
            | {
                quantity: number;
                min_stock_level: number;
                selling_price_minor: number;
              }
            | undefined;
          if (!prod) throw new Error("Produit introuvable.");
          const after = Number(prod.quantity) + p.net;
          const nextSelling = p.selling ?? Number(prod.selling_price_minor);
          db.prepare(
            `UPDATE products SET quantity = ?, purchase_price_minor = ?, selling_price_minor = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
          ).run(after, p.cost, nextSelling, after, after, args.now, pid);
          if (args.supplierId != null) {
            db.prepare(
              `INSERT OR IGNORE INTO product_suppliers (product_id, supplier_id, created_at) VALUES (?, ?, ?)`,
            ).run(pid, args.supplierId, args.now);
          }
          db.prepare(
            `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, created_at)
             VALUES (?, ?, 'intake_in', ?, ?, ?, 'intake', ?, 'Entrée fournisseur', ?)`,
          ).run(randomUUID(), pid, p.net, after, p.cost, String(intakeId), args.now);
        } else {
          // Produit créé ci-dessus (quantité déjà = net) : seul le mouvement manque.
          db.prepare(
            `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, created_at)
             VALUES (?, ?, 'intake_in', ?, ?, ?, 'intake', ?, 'Entrée fournisseur', ?)`,
          ).run(randomUUID(), pid, p.net, p.net, p.cost, String(intakeId), args.now);
        }
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
  try {
    return (tx as unknown as () => { intakeId: number; totalMinor: number })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: stock_intakes\.operation_id/i.test(err.message)
    ) {
      const retry = findExisting();
      if (retry) return retry;
    }
    throw err;
  }
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
  const head = db.prepare(`SELECT COUNT(*) AS sku FROM products WHERE is_active = 1`).get() as {
    sku: number;
  };
  // Lignes : valeur FIFO par produit (couches restantes), tri décroissant.
  const lines = db
    .prepare(
      `SELECT id, name, quantity, purchase_price_minor,
        (SELECT COALESCE(SUM(remaining_quantity * unit_cost_minor), 0) FROM inventory_layers WHERE product_id = products.id) AS line_value
       FROM products WHERE is_active = 1 ORDER BY line_value DESC LIMIT 50`,
    )
    .all();
  return { valueMinor: fifoValuation(), skuActive: head.sku, lines };
}

export type StockStatus = "all" | "in_stock" | "low_stock" | "out_of_stock";
export type StockMovementKind =
  | "all"
  | "sale_out"
  | "sale_cancel_in"
  | "intake_in"
  | "adjust_in"
  | "adjust_out"
  | "return_in"
  | "damage_out";
export type StockSort =
  "name_asc" | "name_desc" | "qty_asc" | "qty_desc" | "value_desc" | "recent_desc";

export interface StockProductsOptions {
  categoryId?: number | null;
  stockStatus?: StockStatus;
  movementType?: StockMovementKind;
  sort?: StockSort;
}

/** Table Stock : produits actifs + catégorie + code-barres + valeur, filtres serveur. */
export function listStockProducts(
  query: string,
  page: number,
  pageSize: number,
  opts: StockProductsOptions = {},
): { rows: unknown[]; total: number } {
  const db = getDb();
  const q = query.trim();
  const status = opts.stockStatus ?? "all";
  const movement = opts.movementType ?? "all";
  const sort = opts.sort ?? "name_asc";
  const conds = [`p.is_active = 1`];
  const params: unknown[] = [];
  if (q) {
    conds.push(
      `(p.name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM product_barcodes b WHERE b.product_id = p.id AND b.barcode LIKE ? ESCAPE '\\'))`,
    );
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    params.push(like, like);
  }
  if (opts.categoryId != null) {
    conds.push(`p.category_id = ?`);
    params.push(opts.categoryId);
  }
  if (status !== "all") {
    conds.push(`p.stock_status = ?`);
    params.push(status);
  }
  if (movement !== "all") {
    conds.push(
      `EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id = p.id AND m.movement_type = ?)`,
    );
    params.push(movement);
  }
  const where = `WHERE ${conds.join(" AND ")}`;
  const select = `SELECT p.*,
    c.name AS category_name,
    (SELECT barcode FROM product_barcodes b WHERE b.product_id = p.id ORDER BY b.is_primary DESC, b.id ASC LIMIT 1) AS primary_barcode,
    (SELECT COALESCE(SUM(remaining_quantity * unit_cost_minor), 0) FROM inventory_layers WHERE product_id = p.id) AS stock_value_minor,
    (SELECT MAX(created_at) FROM stock_movements m WHERE m.product_id = p.id) AS last_movement_at
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;
  const order =
    sort === "name_desc"
      ? `p.name COLLATE NOCASE DESC`
      : sort === "qty_asc"
        ? `p.quantity ASC, p.name COLLATE NOCASE ASC`
        : sort === "qty_desc"
          ? `p.quantity DESC, p.name COLLATE NOCASE ASC`
          : sort === "value_desc"
            ? `stock_value_minor DESC, p.name COLLATE NOCASE ASC`
            : sort === "recent_desc"
              ? `last_movement_at DESC, p.name COLLATE NOCASE ASC`
              : `p.name COLLATE NOCASE ASC`;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM products p ${where}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(`${select} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export interface MovementsOptions {
  from?: string | null;
  to?: string | null;
  types?: StockMovementKind[];
}

/** Historique des mouvements d'un produit (stock avant calculé, paginé). */
export function listMovements(
  productId: number,
  page: number,
  pageSize: number,
  opts: MovementsOptions = {},
): { rows: unknown[]; total: number } {
  const db = getDb();
  const exists = db.prepare(`SELECT id FROM products WHERE id = ?`).get(productId) as
    { id: number } | undefined;
  if (!exists) throw new Error("Produit introuvable.");
  const conds = [`product_id = ?`];
  const params: unknown[] = [productId];
  if (opts.from) {
    conds.push(`substr(created_at, 1, 10) >= ?`);
    params.push(opts.from);
  }
  if (opts.to) {
    conds.push(`substr(created_at, 1, 10) <= ?`);
    params.push(opts.to);
  }
  const types = (opts.types ?? []).filter((t) => t !== "all");
  if (types.length > 0) {
    conds.push(`movement_type IN (${types.map(() => "?").join(",")})`);
    params.push(...types);
  }
  const where = `WHERE ${conds.join(" AND ")}`;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM stock_movements ${where}`).get(...params) as {
      c: number;
    }
  ).c;
  const rows = db
    .prepare(
      `SELECT *, (quantity_after - quantity_delta) AS quantity_before FROM stock_movements ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export interface InventoryLineInput {
  productId: number;
  actualQty: number;
}

/** Inventaire (juge de paix) : écarts comptés → ajustements, 1 transaction + audit. */
export function applyInventoryAtomic(args: {
  items: InventoryLineInput[];
  reason: string;
  reference: string | null;
  operationId: string;
  now: string;
}): { applied: number; skipped: number } {
  const db = getDb();
  const fastInv = peekIdempotency<{ applied: number; skipped: number }>(
    args.operationId,
    "stock.inventory",
  );
  if (fastInv) return fastInv;
  if (args.reason.trim().length < 2) throw new Error("Motif d'inventaire requis.");
  const seen = new Set<number>();
  for (const it of args.items) {
    if (!Number.isInteger(it.productId) || it.productId <= 0) {
      throw new Error("Produit d'inventaire invalide.");
    }
    if (seen.has(it.productId)) throw new Error("Produit en double dans l'inventaire.");
    seen.add(it.productId);
    if (!Number.isFinite(it.actualQty) || it.actualQty < 0) {
      throw new Error("Quantité comptée invalide.");
    }
  }
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "stock.inventory", args.now);
    let applied = 0;
    let skipped = 0;
    for (const it of args.items) {
      const prod = db
        .prepare(
          `SELECT quantity, min_stock_level, purchase_price_minor FROM products WHERE id = ?`,
        )
        .get(it.productId) as
        { quantity: number; min_stock_level: number; purchase_price_minor: number } | undefined;
      if (!prod) throw new Error("Produit introuvable.");
      const delta = it.actualQty - Number(prod.quantity);
      if (delta === 0) {
        skipped += 1;
        continue;
      }
      // FIFO : écart positif → nouvelle couche ; écart négatif → consommation
      // des couches les plus anciennes (même transaction).
      if (delta > 0) {
        createLayer({
          productId: it.productId,
          qty: delta,
          unitCostMinor: Number(prod.purchase_price_minor),
          reason: "inventory",
          now: args.now,
        });
      } else {
        consumeLayers({
          productId: it.productId,
          qty: -delta,
          now: args.now,
          oversell: false,
          fallbackUnitCostMinor: 0,
        });
      }
      const movement: "adjust_in" | "adjust_out" = delta > 0 ? "adjust_in" : "adjust_out";
      db.prepare(
        `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
      ).run(it.actualQty, it.actualQty, it.actualQty, args.now, it.productId);
      db.prepare(
        `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, related_entity_type, reason, reference, created_at)
         VALUES (?, ?, ?, ?, ?, 'inventory', ?, ?, ?)`,
      ).run(
        randomUUID(),
        it.productId,
        movement,
        delta,
        it.actualQty,
        `Inventaire : ${args.reason.trim()}`,
        args.reference?.trim() || null,
        args.now,
      );
      applied += 1;
    }
    if (applied === 0) throw new Error("Aucun écart à valider.");
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'stock.inventory', 'inventory', 'all', ?, ?, ?)`,
    ).run(
      randomUUID(),
      args.operationId,
      JSON.stringify({ applied, skipped, reason: args.reason.trim() }),
      args.now,
    );
    const result = { applied, skipped };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return (tx as unknown as () => { applied: number; skipped: number })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ applied: number; skipped: number }>(args.operationId);
      if (retry) return retry;
    }
    throw err;
  }
}
