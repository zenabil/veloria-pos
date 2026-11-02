// Veloria PoS — Main-process: FIFO layer helpers (shared by repositories).
// Boundary note: electron must not import src/ (rootDir), so the tiny
// allocator below IS the executed FIFO rule — the unbranchable domain copy
// was removed (ADR-153, lot B). Same thousandths/rounding conventions as the
// APK.
// Rule: FIFO drives inventory COST, never the selling price.
// Every function below MUST be called inside the caller's db.transaction().
// Enforced at runtime for mutating entries (fail-closed, FR message) :
// a forgotten transaction on a COGS path would write half-consumed layers.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { businessDayOf } from "../../shared/business-day";

const TH = 1000;

/** Garde d'appel : les écritures FIFO exigent la transaction de l'appelant. */
function assertCallerTransaction(): void {
  const db = getDb();
  if (!db.inTransaction) {
    throw new Error("Opération FIFO impossible : transaction appelante requise.");
  }
}

export interface FifoLayerRow {
  id: number;
  remainingQty: number;
  unitCostMinor: number;
}

export interface FifoConsumption {
  layerId: number | null;
  quantity: number;
  unitCostMinor: number;
  costMinor: number;
}

/** Layers with stock left, oldest-first (FIFO order). */
export function listLayersAsc(productId: number): FifoLayerRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, remaining_quantity AS remainingQty, unit_cost_minor AS unitCostMinor FROM inventory_layers WHERE product_id = ? AND remaining_quantity > 0 ORDER BY id ASC`,
    )
    .all(productId) as FifoLayerRow[];
}

/** Most recent layer unit cost (oversell fallback), null when no layer exists. */
export function latestUnitCost(productId: number): number | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT unit_cost_minor AS c FROM inventory_layers WHERE product_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(productId) as { c: number } | undefined;
  return row ? Number(row.c) : null;
}

export type LayerReason =
  | "opening"
  | "intake"
  | "product_create"
  | "import"
  | "adjust"
  | "inventory"
  | "return_restore"
  | "legacy"
  | "oversell";

export function createLayer(args: {
  productId: number;
  intakeId?: number | null;
  intakeItemId?: number | null;
  qty: number;
  unitCostMinor: number;
  purchaseDate?: string | null;
  reason: LayerReason;
  now: string;
}): number {
  assertCallerTransaction();
  if (!(args.qty > 0)) throw new Error("Quantité de couche FIFO invalide.");
  if (!Number.isInteger(args.unitCostMinor) || args.unitCostMinor < 0) {
    throw new Error("Coût de couche FIFO invalide.");
  }
  const db = getDb();
  const r = db
    .prepare(
      `INSERT INTO inventory_layers (uuid, product_id, stock_intake_id, stock_intake_item_id, original_quantity, remaining_quantity, unit_cost_minor, purchase_date, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      args.productId,
      args.intakeId ?? null,
      args.intakeItemId ?? null,
      args.qty,
      args.qty,
      args.unitCostMinor,
      args.purchaseDate ?? businessDayOf(args.now),
      args.reason,
      args.now,
    );
  return Number(r.lastInsertRowid);
}

function setRemaining(layerId: number, remainingTh: number): void {
  const db = getDb();
  // Tripwire FIFO (garde 0037) : une couche cassée échoue FORT — jamais de
  // correction silencieuse (clamp à 0). La transaction appelante rollback.
  // L'invariant global SUM(remaining)=quantity ne tient qu'aux frontières de
  // transaction (consommations multi-couches puis UPDATE products en séquence) :
  // il est vérifié par les repos + CHECK 0018 + trigger 0037, pas ici.
  if (!Number.isFinite(remainingTh) || remainingTh < 0) {
    throw new Error("Couche FIFO corrompue : quantité restante invalide.");
  }
  const r = db
    .prepare(`UPDATE inventory_layers SET remaining_quantity = ? WHERE id = ?`)
    .run(Math.round(remainingTh) / TH, layerId);
  if (Number(r.changes) !== 1) {
    throw new Error("Couche FIFO introuvable.");
  }
}

/**
 * Consume `qty` oldest-first. Persists layer updates and, when `record` is set,
 * one sale_fifo_consumption row per layer slice (plus a NULL-layer row for the
 * oversold remainder). With `oversell: false` a shortfall throws (caller tx
 * rolls back, nothing is partially applied). Returns total FIFO cost.
 */
export function consumeLayers(args: {
  productId: number;
  qty: number;
  now: string;
  oversell: boolean;
  fallbackUnitCostMinor: number;
  record?: { saleId: number; saleItemId: number };
}): { cogsMinor: number; consumptions: FifoConsumption[] } {
  assertCallerTransaction();
  if (!(args.qty > 0)) throw new Error("Quantité à consommer invalide.");
  if (
    args.oversell &&
    (!Number.isInteger(args.fallbackUnitCostMinor) || args.fallbackUnitCostMinor < 0)
  ) {
    throw new Error("Coût de substitution invalide.");
  }
  const db = getDb();
  const layers = listLayersAsc(args.productId);
  let needTh = Math.round(args.qty * TH);
  let cogs = 0;
  const consumptions: FifoConsumption[] = [];
  for (const layer of layers) {
    if (needTh <= 0) break;
    const availTh = Math.round(Number(layer.remainingQty) * TH);
    if (availTh <= 0) continue;
    const takeTh = Math.min(availTh, needTh);
    const qty = takeTh / TH;
    const cost = Math.round((Number(layer.unitCostMinor) * takeTh) / TH);
    setRemaining(layer.id, availTh - takeTh);
    consumptions.push({
      layerId: layer.id,
      quantity: qty,
      unitCostMinor: Number(layer.unitCostMinor),
      costMinor: cost,
    });
    cogs += cost;
    needTh -= takeTh;
  }
  if (needTh > 0) {
    if (!args.oversell) throw new Error("Stock FIFO insuffisant.");
    const qty = needTh / TH;
    const cost = Math.round((args.fallbackUnitCostMinor * needTh) / TH);
    consumptions.push({
      layerId: null,
      quantity: qty,
      unitCostMinor: args.fallbackUnitCostMinor,
      costMinor: cost,
    });
    cogs += cost;
  }
  if (args.record) {
    for (const c of consumptions) {
      db.prepare(
        `INSERT INTO sale_fifo_consumption (sale_id, sale_item_id, product_id, layer_id, quantity, unit_cost_minor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        args.record.saleId,
        args.record.saleItemId,
        args.productId,
        c.layerId,
        c.quantity,
        c.unitCostMinor,
        args.now,
      );
    }
  }
  return { cogsMinor: cogs, consumptions };
}

/** Put quantities back into their original layers (sale cancel / customer return). */
export function restoreToLayers(items: { layerId: number; quantity: number }[]): void {
  assertCallerTransaction();
  if (items.length === 0) return;
  const db = getDb();
  for (const it of items) {
    if (!(it.quantity > 0)) throw new Error("Quantité à restaurer invalide.");
    const row = db
      .prepare(
        `SELECT remaining_quantity AS q, original_quantity AS orig FROM inventory_layers WHERE id = ?`,
      )
      .get(it.layerId) as { q: number; orig: number } | undefined;
    if (!row) throw new Error("Couche FIFO introuvable.");
    // RADICAL-FIX P2: garde proactive anti-dépassement (avant le trigger 0023)
    // — message domaine FR au lieu d'ABORT SQL brut, pas de corruption silencieuse.
    const next = Math.round((Number(row.q) + it.quantity) * TH) / TH;
    if (next - Number(row.orig) > 1e-9) {
      throw new Error("Restauration FIFO impossible : quantité supérieure à l'origine.");
    }
    db.prepare(`UPDATE inventory_layers SET remaining_quantity = ? WHERE id = ?`).run(
      next,
      it.layerId,
    );
  }
}

export function consumptionsOfSale(saleId: number): {
  saleItemId: number;
  productId: number;
  layerId: number | null;
  quantity: number;
  unitCostMinor: number;
}[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT sale_item_id AS saleItemId, product_id AS productId, layer_id AS layerId, quantity, unit_cost_minor AS unitCostMinor FROM sale_fifo_consumption WHERE sale_id = ? ORDER BY id ASC`,
    )
    .all(saleId) as {
    saleItemId: number;
    productId: number;
    layerId: number | null;
    quantity: number;
    unitCostMinor: number;
  }[];
}

/**
 * Remove `qty` from the layers of a given purchase (supplier return), newest
 * first. Throws when the linked layers no longer cover the quantity (already
 * sold): returning goods that left the stock is refused instead of corrupting
 * another layer. Returns the deductions (for exact reversal on cancel).
 */
export function deductIntakeLayers(args: {
  productId: number;
  intakeId: number;
  qty: number;
}): { layerId: number; quantity: number }[] {
  assertCallerTransaction();
  if (!(args.qty > 0)) throw new Error("Quantité à déduire invalide.");
  const db = getDb();
  const layers = db
    .prepare(
      `SELECT id, remaining_quantity AS q FROM inventory_layers WHERE product_id = ? AND stock_intake_id = ? AND remaining_quantity > 0 ORDER BY id DESC`,
    )
    .all(args.productId, args.intakeId) as { id: number; q: number }[];
  let needTh = Math.round(args.qty * TH);
  const out: { layerId: number; quantity: number }[] = [];
  for (const layer of layers) {
    if (needTh <= 0) break;
    const availTh = Math.round(Number(layer.q) * TH);
    if (availTh <= 0) continue;
    const takeTh = Math.min(availTh, needTh);
    setRemaining(layer.id, availTh - takeTh);
    out.push({ layerId: layer.id, quantity: takeTh / TH });
    needTh -= takeTh;
  }
  if (needTh > 0) {
    throw new Error("Retour impossible : cette quantité a déjà été vendue ou ajustée.");
  }
  return out;
}

/** FIFO stock value of active products (remaining layers only — never the selling price). */
export function fifoValuation(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(l.remaining_quantity * l.unit_cost_minor), 0) AS v FROM inventory_layers l JOIN products p ON p.id = l.product_id WHERE p.is_active = 1`,
    )
    .get() as { v: number };
  return Math.round(Number(row.v));
}
