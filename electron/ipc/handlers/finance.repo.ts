// Veloria PoS — Main-process repository: finance (Phase 8).
// Dettes + rapports période + clôtures Z + sources zakat. Agrégats SQL bornés.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";

export function listDebts(
  filter: string,
  page: number,
  pageSize: number,
): {
  rows: unknown[];
  total: number;
} {
  const db = getDb();
  const where =
    filter === "over_limit"
      ? `WHERE outstanding_balance_minor > 0 AND credit_limit_minor > 0 AND outstanding_balance_minor > credit_limit_minor`
      : filter === "due"
        ? `WHERE outstanding_balance_minor > 0`
        : `WHERE outstanding_balance_minor > 0`;
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM customers ${where}`).get() as { c: number })
    .c;
  const rows = db
    .prepare(
      `SELECT id, first_name, last_name, phone, outstanding_balance_minor, credit_limit_minor, debt_status, is_over_limit, updated_at
       FROM customers ${where} ORDER BY outstanding_balance_minor DESC LIMIT ? OFFSET ?`,
    )
    .all(pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function getPeriodReport(from: string, to: string): Record<string, unknown> {
  const db = getDb();
  const sales = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_minor),0) AS t, COALESCE(SUM(amount_paid_minor),0) AS p, COALESCE(SUM(remaining_balance_minor),0) AS c
       FROM sales WHERE substr(created_at,1,10) BETWEEN ? AND ? AND is_cancelled = 0`,
    )
    .get(from, to);
  const collections = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor),0) AS standalone FROM sale_payments WHERE substr(payment_date,1,10) BETWEEN ? AND ? AND sale_id IS NULL`,
    )
    .get(from, to);
  const expenses = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor),0) AS e, COUNT(*) AS n FROM expenses WHERE expense_date BETWEEN ? AND ?`,
    )
    .get(from, to);
  const refunds = db
    .prepare(
      `SELECT COALESCE(SUM(amount_refunded_minor),0) AS r, COALESCE(SUM(total_return_value_minor),0) AS v, COUNT(*) AS n FROM returns WHERE substr(created_at,1,10) BETWEEN ? AND ?`,
    )
    .get(from, to);
  const top = db
    .prepare(
      `SELECT si.product_name_snapshot AS name, SUM(si.quantity) AS qty, SUM(si.line_total_minor) AS revenue
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE substr(s.created_at,1,10) BETWEEN ? AND ? AND s.is_cancelled = 0
       GROUP BY si.product_name_snapshot ORDER BY revenue DESC LIMIT 10`,
    )
    .all(from, to);
  const debt = db
    .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor),0) AS d FROM customers`)
    .get();
  const supplierDebt = db
    .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor),0) AS d FROM suppliers`)
    .get();
  const inventory = db
    .prepare(
      `SELECT COALESCE(SUM(quantity * purchase_price_minor),0) AS v FROM products WHERE is_active = 1`,
    )
    .get();
  return { sales, collections, expenses, refunds, top, debt, supplierDebt, inventory, from, to };
}

export function getDailyClosing(businessDate: string): unknown {
  const db = getDb();
  return db.prepare(`SELECT * FROM daily_closings WHERE business_date = ?`).get(businessDate);
}

export function createDailyClosingAtomic(args: {
  businessDate: string;
  openingMinor: number;
  operationId: string;
  now: string;
}): Record<string, unknown> {
  const db = getDb();
  const tx = db.transaction(() => {
    const exists = db
      .prepare(`SELECT id FROM daily_closings WHERE business_date = ?`)
      .get(args.businessDate);
    if (exists) throw new Error("Clôture déjà effectuée pour cette date.");
    const cash = db
      .prepare(
        `SELECT COALESCE(SUM(amount_paid_minor),0) AS p FROM sales WHERE substr(created_at,1,10) = ? AND is_cancelled = 0`,
      )
      .get(args.businessDate) as { p: number };
    const collections = db
      .prepare(
        `SELECT COALESCE(SUM(amount_minor),0) AS c FROM sale_payments WHERE substr(payment_date,1,10) = ? AND sale_id IS NULL`,
      )
      .get(args.businessDate) as { c: number };
    const expenses = db
      .prepare(`SELECT COALESCE(SUM(amount_minor),0) AS e FROM expenses WHERE expense_date = ?`)
      .get(args.businessDate) as { e: number };
    const refunds = db
      .prepare(
        `SELECT COALESCE(SUM(amount_refunded_minor),0) AS r FROM returns WHERE substr(created_at,1,10) = ?`,
      )
      .get(args.businessDate) as { r: number };
    const closing = args.openingMinor + cash.p + collections.c - expenses.e - refunds.r;
    const r = db
      .prepare(
        `INSERT INTO daily_closings (uuid, business_date, opening_balance_minor, cash_sales_minor, cash_payments_minor, customer_collections_minor, expenses_minor, refunds_minor, closing_balance_minor, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        args.businessDate,
        args.openingMinor,
        cash.p,
        cash.p,
        collections.c,
        expenses.e,
        refunds.r,
        closing,
        args.now,
      );
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'closing.created', 'closing', ?, ?, ?, ?)`,
    ).run(randomUUID(), args.businessDate, args.operationId, JSON.stringify({ closing }), args.now);
    return {
      id: Number(r.lastInsertRowid),
      businessDate: args.businessDate,
      openingMinor: args.openingMinor,
      cashSalesMinor: cash.p,
      collectionsMinor: collections.c,
      expensesMinor: expenses.e,
      refundsMinor: refunds.r,
      closingMinor: closing,
    };
  });
  return (tx as unknown as () => Record<string, unknown>)();
}

export function getZakatSources(): Record<string, unknown> {
  const db = getDb();
  const cash = db
    .prepare(
      `SELECT COALESCE(SUM(amount_paid_minor),0) AS paid, COALESCE(SUM(total_minor),0) AS total FROM sales WHERE is_cancelled = 0`,
    )
    .get();
  const inventory = db
    .prepare(
      `SELECT COALESCE(SUM(quantity * purchase_price_minor),0) AS v FROM products WHERE is_active = 1`,
    )
    .get();
  const customerDebts = db
    .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor),0) AS d FROM customers`)
    .get();
  const supplierDebts = db
    .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor),0) AS d FROM suppliers`)
    .get();
  const settings = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'zakat'`).get() as
    | { value_json: string }
    | undefined;
  let params: { ratePercent: number; nisabMinor: number } = {
    ratePercent: 2.5,
    nisabMinor: 0,
  };
  try {
    if (settings) {
      const parsed = JSON.parse(settings.value_json) as {
        ratePercent?: number;
        nisabMinor?: number;
      };
      params = { ...params, ...parsed };
    }
  } catch {
    /* défauts */
  }
  return { cash, inventory, customerDebts, supplierDebts, params };
}
