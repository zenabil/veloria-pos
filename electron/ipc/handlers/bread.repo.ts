// Veloria PoS — Main-process repository: pain (Phase 9).
// Commandes + paiements + retraits + transfert en compte client = tx atomiques.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";

function allocateBreadNumber(now: string): string {
  const db = getDb();
  const row = db
    .prepare(`SELECT prefix, next_value FROM number_sequences WHERE sequence_key = 'bread_order'`)
    .get() as { prefix: string; next_value: number };
  const num = `${row.prefix}-${new Date().getFullYear()}-${String(row.next_value).padStart(5, "0")}`;
  db.prepare(
    `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'bread_order'`,
  ).run(now);
  return num;
}

export function createBreadOrderAtomic(args: {
  customerId: number | null;
  customName: string | null;
  pickupDate: string;
  pickupTime: string | null;
  quantity: number;
  unitPriceMinor: number;
  amountPaidMinor: number;
  notes: string | null;
  operationId: string;
  now: string;
}): { id: number; number: string } {
  const db = getDb();
  const tx = db.transaction(() => {
    if (!(args.quantity > 0)) throw new Error("Quantité de pain invalide.");
    if (!Number.isInteger(args.unitPriceMinor) || args.unitPriceMinor < 0) {
      throw new Error("Prix unitaire invalide.");
    }
    const total = Math.round(args.unitPriceMinor * args.quantity);
    if (args.amountPaidMinor > total) throw new Error("Le montant payé dépasse le total.");
    const remaining = total - args.amountPaidMinor;
    const payment = remaining === 0 ? "paid" : args.amountPaidMinor === 0 ? "unpaid" : "partial";
    const number = allocateBreadNumber(args.now);
    const r = db
      .prepare(
        `INSERT INTO bread_orders (uuid, order_number, customer_id, custom_name, order_date, pickup_date, pickup_time, quantity, unit_price_minor, total_amount_minor, amount_paid_minor, remaining_amount_minor, payment_status, pickup_status, is_delivered, is_paid, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        number,
        args.customerId,
        args.customName?.trim() || null,
        args.now.slice(0, 10),
        args.pickupDate,
        args.pickupTime?.trim() || null,
        args.quantity,
        args.unitPriceMinor,
        total,
        args.amountPaidMinor,
        remaining,
        payment,
        remaining === 0 ? 1 : 0,
        args.notes?.trim() || null,
        args.now,
        args.now,
      );
    const id = Number(r.lastInsertRowid);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'bread.created', 'bread', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), args.operationId, JSON.stringify({ number, total }), args.now);
    return { id, number };
  });
  return (tx as unknown as () => { id: number; number: string })();
}

export function listBreadOrders(
  pickupDate: string | null,
  page: number,
  pageSize: number,
): {
  rows: unknown[];
  total: number;
} {
  const db = getDb();
  const where = pickupDate ? `WHERE b.pickup_date = ?` : "";
  const params: unknown[] = pickupDate ? [pickupDate] : [];
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM bread_orders b ${where}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT b.*, c.search_name AS customer_name FROM bread_orders b LEFT JOIN customers c ON c.id = b.customer_id ${where} ORDER BY b.pickup_date ASC, b.id ASC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function recordBreadPayment(id: number, amountMinor: number, now: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
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
      `UPDATE bread_orders SET amount_paid_minor = ?, remaining_amount_minor = ?, payment_status = ?, is_paid = ?, updated_at = ? WHERE id = ?`,
    ).run(paid, left, left === 0 ? "paid" : "partial", left === 0 ? 1 : 0, now, id);
  });
  (tx as unknown as () => void)();
}

export function setBreadPickup(id: number, to: string, now: string): void {
  const db = getDb();
  const allowed: Record<string, string[]> = {
    pending: ["ready", "cancelled"],
    ready: ["delivered", "cancelled"],
    delivered: [],
    cancelled: [],
  };
  const o = db.prepare(`SELECT pickup_status FROM bread_orders WHERE id = ?`).get(id) as
    | { pickup_status: string }
    | undefined;
  if (!o) throw new Error("Commande introuvable.");
  if (!(allowed[o.pickup_status] ?? []).includes(to)) {
    throw new Error(`Retrait interdit : ${o.pickup_status} → ${to}.`);
  }
  db.prepare(
    `UPDATE bread_orders SET pickup_status = ?, is_delivered = ?, updated_at = ? WHERE id = ?`,
  ).run(to, to === "delivered" ? 1 : 0, now, id);
}

export function transferBreadToCustomerAccount(id: number, now: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    const o = db.prepare(`SELECT * FROM bread_orders WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!o) throw new Error("Commande introuvable.");
    const customerId = o["customer_id"] as number | null;
    if (customerId == null) throw new Error("Commande sans client : transfert impossible.");
    if (o["transferred_to_customer_account"] === 1) throw new Error("Solde déjà transféré.");
    const remaining = Number(o["remaining_amount_minor"]);
    if (remaining > 0) {
      db.prepare(
        `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor + ?, debt_status = 'due', updated_at = ? WHERE id = ?`,
      ).run(remaining, now, customerId);
    }
    db.prepare(
      `UPDATE bread_orders SET transferred_to_customer_account = 1, transferred_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, id);
  });
  (tx as unknown as () => void)();
}
