// Veloria PoS — Main-process repository: pain (Phase 9).
// Commandes + paiements + retraits + transfert en compte client = tx atomiques.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { assertOrderClause } from "./sql-guard";
import { createSaleAtomic } from "./sales.repo";
import { formatBreadOrderNumber } from "./numbers";
import {
  auditOperationId,
  claimIdempotency,
  peekIdempotency,
  storeIdempotencyResult,
} from "./idempotency";

function allocateBreadNumber(now: string): string {
  const db = getDb();
  const seq = db
    .prepare(`SELECT next_value FROM number_sequences WHERE sequence_key = 'bread_order'`)
    .get() as { next_value: number };
  const year = Number(String(now).slice(0, 4)) || new Date().getFullYear();
  const num = formatBreadOrderNumber(year, seq.next_value);
  db.prepare(
    `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'bread_order'`,
  ).run(now);
  return num;
}

export type BreadOrderStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";
export type BreadListSort = "pickup_asc" | "pickup_desc" | "date_desc" | "amount_desc";

const ORDER_TRANSITIONS: Record<BreadOrderStatus, BreadOrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

function hasBreadColumn(name: string): boolean {
  const db = getDb();
  const rows = db.prepare(`PRAGMA table_info(bread_orders)`).all() as { name: string }[];
  return rows.some((r) => r.name === name);
}

function syncPickupStatus(order: BreadOrderStatus): string {
  if (order === "ready") return "ready";
  if (order === "delivered") return "delivered";
  if (order === "cancelled") return "cancelled";
  return "pending";
}

export function createBreadOrderAtomic(args: {
  customerId: number | null;
  customName: string | null;
  customPhone: string | null;
  breadType: string;
  orderName?: string | null;
  isRecurring?: boolean;
  pickupDate: string;
  pickupTime: string | null;
  quantity: number;
  unitPriceMinor: number;
  amountPaidMinor: number;
  paymentMethod: string | null;
  notes: string | null;
  operationId: string;
  now: string;
}): { id: number; number: string } {
  const db = getDb();
  const fast = peekIdempotency<{ id: number; number: string }>(args.operationId, "bread.create");
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "bread.create", args.now);
    if (!(args.quantity > 0)) throw new Error("Quantité de pain invalide.");
    if (!Number.isInteger(args.unitPriceMinor) || args.unitPriceMinor < 0) {
      throw new Error("Prix unitaire invalide.");
    }
    if (args.breadType.trim().length < 2) throw new Error("Type de pain requis.");
    const total = Math.round(args.unitPriceMinor * args.quantity);
    if (args.amountPaidMinor > total) throw new Error("Le montant payé dépasse le total.");
    const remaining = total - args.amountPaidMinor;
    const payment = remaining === 0 ? "paid" : args.amountPaidMinor === 0 ? "unpaid" : "partial";
    const number = allocateBreadNumber(args.now);
    const orderLabel = (args.orderName?.trim() || args.breadType.trim()).slice(0, 200);
    const recurring = args.isRecurring === true ? 1 : 0;
    const hasOrderName = hasBreadColumn("order_name");
    const hasRecurring = hasBreadColumn("is_recurring");
    const cols = [
      "uuid",
      "order_number",
      "customer_id",
      "custom_name",
      "custom_phone",
      "bread_type",
    ];
    const vals: unknown[] = [
      randomUUID(),
      number,
      args.customerId,
      args.customName?.trim() || null,
      args.customPhone?.trim() || null,
      args.breadType.trim(),
    ];
    if (hasOrderName) {
      cols.push("order_name");
      vals.push(orderLabel);
    }
    if (hasRecurring) {
      cols.push("is_recurring");
      vals.push(recurring);
    }
    cols.push(
      "order_date",
      "pickup_date",
      "pickup_time",
      "quantity",
      "unit_price_minor",
      "total_amount_minor",
      "amount_paid_minor",
      "remaining_amount_minor",
      "payment_status",
      "payment_method",
      "pickup_status",
      "order_status",
      "is_delivered",
      "is_paid",
      "notes",
      "created_at",
      "updated_at",
    );
    vals.push(
      args.now.slice(0, 10),
      args.pickupDate,
      args.pickupTime?.trim() || null,
      args.quantity,
      args.unitPriceMinor,
      total,
      args.amountPaidMinor,
      remaining,
      payment,
      args.paymentMethod,
      "pending",
      "new",
      0,
      remaining === 0 ? 1 : 0,
      args.notes?.trim() || null,
      args.now,
      args.now,
    );
    const placeholders = cols.map(() => "?").join(", ");
    const r = db
      .prepare(`INSERT INTO bread_orders (${cols.join(", ")}) VALUES (${placeholders})`)
      .run(...vals);
    const id = Number(r.lastInsertRowid);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'bread.created', 'bread', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), args.operationId, JSON.stringify({ number, total }), args.now);
    const result = { id, number };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return (tx as unknown as () => { id: number; number: string })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ id: number; number: string }>(args.operationId);
      if (retry) return retry;
    }
    // Course sur le numéro de commande : avance la séquence puis rejoue une fois.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: bread_orders\.order_number/i.test(err.message)
    ) {
      try {
        db.prepare(
          `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'bread_order'`,
        ).run(args.now);
      } catch {
        /* best-effort */
      }
      return (tx as unknown as () => { id: number; number: string })();
    }
    throw err;
  }
}

export function updateBreadOrder(args: {
  id: number;
  customerId: number | null;
  customName: string | null;
  customPhone: string | null;
  breadType: string;
  orderName?: string | null;
  isRecurring?: boolean;
  pickupDate: string;
  pickupTime: string | null;
  notes: string | null;
  operationId: string;
  now: string;
}): void {
  const db = getDb();
  // P0-1 : idempotence + atomicité (contrôle + UPDATE + audit en UNE tx).
  const fast = peekIdempotency<{ updated: boolean }>(args.operationId, "bread.update");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "bread.update", args.now);
    const o = db
      .prepare(`SELECT order_status, sale_id FROM bread_orders WHERE id = ?`)
      .get(args.id) as { order_status: string; sale_id: number | null } | undefined;
    if (!o) throw new Error("Commande introuvable.");
    if (o.sale_id != null) throw new Error("Commande convertie en vente : figée.");
    if (o.order_status === "delivered" || o.order_status === "cancelled") {
      throw new Error("Commande clôturée : non modifiable.");
    }
    if (args.breadType.trim().length < 2) throw new Error("Type de pain requis.");
    const sets = [
      "customer_id = ?",
      "custom_name = ?",
      "custom_phone = ?",
      "bread_type = ?",
      "pickup_date = ?",
      "pickup_time = ?",
      "notes = ?",
      "updated_at = ?",
    ];
    const vals: unknown[] = [
      args.customerId,
      args.customName?.trim() || null,
      args.customPhone?.trim() || null,
      args.breadType.trim(),
      args.pickupDate,
      args.pickupTime?.trim() || null,
      args.notes?.trim() || null,
      args.now,
    ];
    if (hasBreadColumn("order_name")) {
      sets.splice(4, 0, "order_name = ?");
      vals.splice(4, 0, (args.orderName?.trim() || args.breadType.trim()).slice(0, 200));
    }
    if (hasBreadColumn("is_recurring")) {
      sets.splice(4, 0, "is_recurring = ?");
      vals.splice(4, 0, args.isRecurring === true ? 1 : 0);
    }
    const r = db
      .prepare(`UPDATE bread_orders SET ${sets.join(", ")} WHERE id = ?`)
      .run(...vals, args.id);
    if (r.changes === 0) throw new Error("Commande introuvable.");
    // P8: modification tracée.
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'bread.updated', 'bread', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(args.id), args.operationId, JSON.stringify({}), args.now);
    storeIdempotencyResult(args.operationId, { updated: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ updated: boolean }>(args.operationId, "bread.update");
      if (retry) return;
    }
    throw err;
  }
}

export function setBreadOrderStatus(
  id: number,
  to: BreadOrderStatus,
  now: string,
  operationId: string,
): void {
  const db = getDb();
  // P0-1 : contrôle de transition + UPDATE + audit en UNE tx (fini le
  // check-then-act hors transaction : deux transitions concurrentes ne
  // peuvent plus s'écraser silencieusement).
  const fast = peekIdempotency<{ updated: boolean }>(operationId, "bread.status");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "bread.status", now);
    const o = db.prepare(`SELECT order_status FROM bread_orders WHERE id = ?`).get(id) as
      | { order_status: string }
      | undefined;
    if (!o) throw new Error("Commande introuvable.");
    const allowed: BreadOrderStatus[] =
      (ORDER_TRANSITIONS as Record<string, BreadOrderStatus[]>)[o.order_status] ?? [];
    if (!allowed.includes(to)) {
      throw new Error(`Transition interdite : ${o.order_status} → ${to}.`);
    }
    db.prepare(
      `UPDATE bread_orders SET order_status = ?, pickup_status = ?, is_delivered = ?, updated_at = ? WHERE id = ?`,
    ).run(to, syncPickupStatus(to), to === "delivered" ? 1 : 0, now, id);
    // P8: transition tracée.
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'bread.status', 'bread', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), operationId, JSON.stringify({ from: o.order_status, to }), now);
    storeIdempotencyResult(operationId, { updated: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ updated: boolean }>(operationId, "bread.status");
      if (retry) return;
    }
    throw err;
  }
}

export function listBreadOrders(
  pickupDate: string | null,
  page: number,
  pageSize: number,
  opts: {
    query?: string;
    status?: string | null;
    customer?: string | null;
    recurring?: string | null;
    orderFrom?: string | null;
    orderTo?: string | null;
    pickupFrom?: string | null;
    pickupTo?: string | null;
    sort?: BreadListSort;
  } = {},
): {
  rows: unknown[];
  total: number;
} {
  const db = getDb();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (pickupDate) {
    conds.push(`b.pickup_date = ?`);
    params.push(pickupDate);
  }
  const q = (opts.query ?? "").trim();
  const recurringCol = hasBreadColumn("is_recurring");
  const orderNameCol = hasBreadColumn("order_name");
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    if (orderNameCol) {
      conds.push(
        `(b.order_number LIKE ? ESCAPE '\\' OR c.search_name LIKE ? ESCAPE '\\' OR b.custom_name LIKE ? OR b.order_name LIKE ? ESCAPE '\\' OR b.bread_type LIKE ? ESCAPE '\\')`,
      );
      params.push(like, like, like, like, like);
    } else {
      conds.push(
        `(b.order_number LIKE ? ESCAPE '\\' OR c.search_name LIKE ? ESCAPE '\\' OR b.custom_name LIKE ?)`,
      );
      params.push(like, like, like);
    }
  }
  if (opts.status) {
    conds.push(`b.order_status = ?`);
    params.push(opts.status);
  }
  if (recurringCol && opts.recurring === "recurring") {
    conds.push(`b.is_recurring = 1`);
  } else if (recurringCol && opts.recurring === "once") {
    conds.push(`b.is_recurring = 0`);
  }
  const cq = (opts.customer ?? "").trim();
  if (cq) {
    conds.push(`(c.search_name LIKE ? ESCAPE '\\' OR b.custom_name LIKE ?)`);
    const like = `%${cq.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    params.push(like, like);
  }
  if (opts.orderFrom) {
    conds.push(`substr(b.order_date, 1, 10) >= ?`);
    params.push(opts.orderFrom);
  }
  if (opts.orderTo) {
    conds.push(`substr(b.order_date, 1, 10) <= ?`);
    params.push(opts.orderTo);
  }
  if (opts.pickupFrom) {
    conds.push(`substr(b.pickup_date, 1, 10) >= ?`);
    params.push(opts.pickupFrom);
  }
  if (opts.pickupTo) {
    conds.push(`substr(b.pickup_date, 1, 10) <= ?`);
    params.push(opts.pickupTo);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const sort = opts.sort ?? "pickup_asc";
  const order =
    sort === "pickup_desc"
      ? `b.pickup_date DESC, b.id DESC`
      : sort === "date_desc"
        ? `b.id DESC`
        : sort === "amount_desc"
          ? `b.total_amount_minor DESC, b.id DESC`
          : `b.pickup_date ASC, b.id ASC`;
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM bread_orders b LEFT JOIN customers c ON c.id = b.customer_id ${where}`,
      )
      .get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT b.*, c.search_name AS customer_name, c.phone AS customer_phone, c.address AS customer_address FROM bread_orders b LEFT JOIN customers c ON c.id = b.customer_id ${where} ORDER BY ${assertOrderClause(order)} LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function getBreadStats(): {
  total: number;
  pending: number;
  ready: number;
  delivered: number;
  recurring: number;
  types: string[];
} {
  const db = getDb();
  const recurringCol = hasBreadColumn("is_recurring");
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN order_status IN ('new','confirmed','preparing') THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN order_status = 'ready' THEN 1 ELSE 0 END), 0) AS ready,
        COALESCE(SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered
        ${recurringCol ? `, COALESCE(SUM(CASE WHEN is_recurring = 1 THEN 1 ELSE 0 END), 0) AS recurring` : `, 0 AS recurring`}
       FROM bread_orders`,
    )
    .get() as {
    total: number;
    pending: number;
    ready: number;
    delivered: number;
    recurring: number;
  };
  const types = db
    .prepare(`SELECT DISTINCT bread_type AS t FROM bread_orders ORDER BY t COLLATE NOCASE`)
    .all() as { t: string }[];
  return {
    total: row.total,
    pending: row.pending,
    ready: row.ready,
    delivered: row.delivered,
    recurring: Number(row.recurring),
    types: types.map((t) => t.t),
  };
}

export function getBreadOrder(id: number): { order: unknown; customer: unknown } {
  const db = getDb();
  const order = db.prepare(`SELECT * FROM bread_orders WHERE id = ?`).get(id);
  if (!order) throw new Error("Commande introuvable.");
  const o = order as Record<string, unknown>;
  const customer =
    o["customer_id"] != null
      ? db.prepare(`SELECT * FROM customers WHERE id = ?`).get(o["customer_id"])
      : null;
  return { order, customer };
}

export function recordBreadPayment(
  id: number,
  amountMinor: number,
  method: string | null,
  now: string,
  operationId: string,
): void {
  const db = getDb();
  if (!operationId || operationId.trim().length === 0) {
    throw new Error("Opération non identifiée : veuillez réessayer l'action.");
  }
  if (peekIdempotency<{ paid: boolean }>(operationId, "bread.pay")) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "bread.pay", now);
    const o = db.prepare(`SELECT * FROM bread_orders WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!o) throw new Error("Commande introuvable.");
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new Error("Montant invalide.");
    }
    const remaining = Number(o["remaining_amount_minor"]);
    if (amountMinor > remaining) throw new Error("Le paiement dépasse le reste dû.");
    const paid = Number(o["amount_paid_minor"]) + amountMinor;
    const left = remaining - amountMinor;
    db.prepare(
      `UPDATE bread_orders SET amount_paid_minor = ?, remaining_amount_minor = ?, payment_status = ?, payment_method = COALESCE(?, payment_method), is_paid = ?, updated_at = ? WHERE id = ?`,
    ).run(paid, left, left === 0 ? "paid" : "partial", method, left === 0 ? 1 : 0, now, id);
    // P8: encaissement tracé — operationId caller (jamais de random fallback).
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'bread.paid', 'bread', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(id),
      auditOperationId(operationId, "bread.paid", id, { amount: amountMinor }),
      JSON.stringify({ amount: amountMinor }),
      now,
    );
    storeIdempotencyResult(operationId, { paid: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      operationId &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      return;
    }
    throw err;
  }
}

export function updateBreadQuantity(
  id: number,
  quantity: number,
  now: string,
  operationId: string,
): void {
  const db = getDb();
  if (!operationId || operationId.trim().length === 0) {
    throw new Error("Opération non identifiée : veuillez réessayer l'action.");
  }
  if (peekIdempotency<{ updated: boolean }>(operationId, "bread.updateQty")) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "bread.updateQty", now);
    const o = db.prepare(`SELECT * FROM bread_orders WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!o) throw new Error("Commande introuvable.");
    if (o["sale_id"] != null) throw new Error("Commande convertie en vente : figée.");
    if (!(quantity > 0)) throw new Error("Quantité de pain invalide.");
    const unit = Number(o["unit_price_minor"]);
    const paid = Number(o["amount_paid_minor"]);
    const total = Math.round(unit * quantity);
    if (paid > total) {
      throw new Error(
        "Le montant déjà payé dépasse le nouveau total : encaissez d'abord un remboursement ou augmentez la quantité.",
      );
    }
    const remaining = total - paid;
    db.prepare(
      `UPDATE bread_orders SET quantity = ?, total_amount_minor = ?, remaining_amount_minor = ?, payment_status = ?, is_paid = ?, updated_at = ? WHERE id = ?`,
    ).run(
      quantity,
      total,
      remaining,
      remaining === 0 ? "paid" : paid === 0 ? "unpaid" : "partial",
      remaining === 0 ? 1 : 0,
      now,
      id,
    );
    // P8: quantité tracée — operationId caller.
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'bread.quantity', 'bread', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(id),
      auditOperationId(operationId, "bread.quantity", id, { quantity, total }),
      JSON.stringify({ quantity, total }),
      now,
    );
    storeIdempotencyResult(operationId, { updated: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      operationId &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      return;
    }
    throw err;
  }
}

export function convertBreadToSaleAtomic(args: {
  breadId: number;
  operationId: string;
  now: string;
}): { saleId: number; invoiceNumber: string } {
  const db = getDb();
  const fast = peekIdempotency<{ saleId: number; invoiceNumber: string }>(
    args.operationId,
    "bread.convert",
  );
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "bread.convert", args.now);
    const o = db.prepare(`SELECT * FROM bread_orders WHERE id = ?`).get(args.breadId) as
      | Record<string, unknown>
      | undefined;
    if (!o) throw new Error("Commande introuvable.");
    if (o["sale_id"] != null) throw new Error("Commande déjà convertie en vente.");
    if (o["transferred_to_customer_account"] === 1) {
      throw new Error("Solde déjà transféré au compte client : conversion impossible.");
    }
    const customerId = o["customer_id"] as number | null;
    const qty = Number(o["quantity"]);
    const unit = Number(o["unit_price_minor"]);
    const paid = Number(o["amount_paid_minor"]);
    const total = Math.round(unit * qty);
    if (!(qty > 0) || paid > total) throw new Error("Commande invalide pour conversion.");
    const remaining = total - paid;
    const status = remaining === 0 ? "paid" : paid === 0 ? "unpaid" : "partial";
    const res = createSaleAtomic({
      operationId: args.operationId,
      uuid: randomUUID(),
      invoiceNumber: "",
      customerId,
      subtotalMinor: total,
      discountType: "none",
      discountValueMinor: 0,
      discountAmountMinor: 0,
      deliveryFeeMinor: 0,
      totalMinor: total,
      amountPaidMinor: paid,
      remainingMinor: remaining,
      paymentStatus: status,
      // Méthode inconnue (le pain ne trace pas le moyen de paiement) : null,
      // jamais "cash" par défaut pour ne pas fausser les rapports.
      paymentMethod: null,
      dueDate: null,
      lines: [
        {
          productId: null,
          productName:
            `Pain — commande ${typeof o["order_number"] === "string" ? o["order_number"] : ""}`.trim(),
          unitCode: "PIECE",
          // Pas de remise sur conversion pain : origine = facturé.
          originalUnitPriceMinor: unit,
          unitPriceMinor: unit,
          purchasePriceMinor: 0,
          quantity: qty,
        },
      ],
      lineTotals: [total],
      now: args.now,
      // Lignes pain : productId null → aucun mouvement de stock de toute façon.
      allowNegativeStock: false,
    });
    db.prepare(
      `UPDATE bread_orders SET sale_id = ?, payment_status = ?, is_paid = ?, updated_at = ? WHERE id = ?`,
    ).run(res.saleId, status, remaining === 0 ? 1 : 0, args.now, args.breadId);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'bread.converted', 'bread', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.breadId),
      args.operationId,
      JSON.stringify({ sale: res.saleId, total }),
      args.now,
    );
    storeIdempotencyResult(args.operationId, res);
    return res;
  });
  try {
    return (tx as unknown as () => { saleId: number; invoiceNumber: string })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ saleId: number; invoiceNumber: string }>(
        args.operationId,
        "bread.convert",
      );
      if (retry) return retry;
    }
    throw err;
  }
}

export function transferBreadToCustomerAccount(id: number, now: string, operationId: string): void {
  const db = getDb();
  // P0-1 : mutation financière idempotente (retry après succès rejoue au lieu
  // de « Solde déjà transféré »).
  const fast = peekIdempotency<{ transferred: boolean }>(operationId, "bread.transfer");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "bread.transfer", now);
    const o = db.prepare(`SELECT * FROM bread_orders WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!o) throw new Error("Commande introuvable.");
    if (o["sale_id"] != null) {
      throw new Error("Commande convertie en vente : transfert impossible.");
    }
    const customerId = o["customer_id"] as number | null;
    if (customerId == null) throw new Error("Commande sans client : transfert impossible.");
    if (o["transferred_to_customer_account"] === 1) throw new Error("Solde déjà transféré.");
    const remaining = Number(o["remaining_amount_minor"]);
    if (remaining > 0) {
      db.prepare(
        `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor + ?,
          debt_status = CASE WHEN outstanding_balance_minor + ? <= 0 THEN 'none' WHEN credit_limit_minor > 0 AND outstanding_balance_minor + ? > credit_limit_minor THEN 'over_limit' ELSE 'due' END,
          is_over_limit = CASE WHEN credit_limit_minor > 0 AND outstanding_balance_minor + ? > credit_limit_minor THEN 1 ELSE 0 END,
          updated_at = ? WHERE id = ?`,
      ).run(remaining, remaining, remaining, remaining, now, customerId);
    }
    db.prepare(
      `UPDATE bread_orders SET transferred_to_customer_account = 1, transferred_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, id);
    // P8: transfert de dette tracé (mutation financière client).
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'bread.transferred', 'bread', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), operationId, JSON.stringify({ customerId, remaining }), now);
    storeIdempotencyResult(operationId, { transferred: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ transferred: boolean }>(operationId, "bread.transfer");
      if (retry) return;
    }
    throw err;
  }
}
