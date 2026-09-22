// Veloria PoS — Main-process repository: finance (Phase 8).
// Dettes + rapports période + clôtures Z + sources zakat. Agrégats SQL bornés.

import { randomUUID } from "node:crypto";
import { getDb, integrityCheck } from "../../database/sqlite.service";
import { backupStatus } from "../../backup/backup.service";
import { getBreadStats } from "./bread.repo";
import { fifoValuation } from "./fifo";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";

export type DebtTypeFilter = "all" | "customer" | "supplier";
export type DebtStatusFilter = "all" | "overdue" | "due";
export type DebtDueFilter = "all" | "today" | "overdue" | "upcoming";
export type DebtSettleFilter = "all" | "watch" | "overdue" | "soon";
export type DebtSort = "due_asc" | "remaining_desc" | "date_desc";

export interface DebtListOptions {
  typeFilter?: DebtTypeFilter;
  statusFilter?: DebtStatusFilter;
  dueFilter?: DebtDueFilter;
  settleFilter?: DebtSettleFilter;
  sort?: DebtSort;
}

/**
 * Échéance mensuelle client (jour 1-31) : jour effectif du mois courant
 * (plafonné au dernier jour), bande 'overdue' (jour passé, dette restante),
 * 'soon' (≤ 7 j avant), 'ok', 'none' (sans jour fixé).
 */
const SETTLE_DATE = `date(min(date('now','start of month','+' || (c.settlement_day - 1) || ' days'), date('now','start of month','+1 month','-1 day')))`;
const SETTLE_BAND = `(CASE WHEN c.settlement_day IS NULL THEN 'none' WHEN date('now') > (${SETTLE_DATE}) THEN 'overdue' WHEN date((${SETTLE_DATE}), '-7 days') <= date('now') THEN 'soon' ELSE 'ok' END)`;

/**
 * Dettes unifiées (lecture seule) : créances clients au grain document
 * (chaque vente impayée porte son reste + échéance), dettes fournisseurs
 * au grain compte (les paiements fournisseurs ne sont pas ventilés par
 * bon — aucun prorata fabriqué, voir ADR-015).
 */
export function listDebtsUnified(
  query: string,
  page: number,
  pageSize: number,
  opts: DebtListOptions = {},
): { rows: unknown[]; total: number } {
  const db = getDb();
  const type = opts.typeFilter ?? "all";
  const status = opts.statusFilter ?? "all";
  const due = opts.dueFilter ?? "all";
  const settle = opts.settleFilter ?? "all";
  const sort = opts.sort ?? "due_asc";
  const branches: string[] = [];
  if (type === "all" || type === "customer") {
    branches.push(`SELECT 'customer' AS debt_type, s.id AS entity_id,
      s.invoice_number AS ref, c.search_name AS party_name, c.phone AS party_phone,
      s.total_minor AS original_minor, s.amount_paid_minor AS paid_minor,
      s.remaining_balance_minor AS remaining_minor,
      s.due_date AS due_date, s.created_at AS created_at,
      CASE WHEN s.due_date IS NOT NULL AND substr(s.due_date, 1, 10) < date('now') THEN 'overdue' ELSE 'due' END AS status,
      c.settlement_day AS settlement_day, (${SETTLE_DATE}) AS next_settle, ${SETTLE_BAND} AS settle_band
    FROM sales s JOIN customers c ON c.id = s.customer_id
    WHERE s.is_cancelled = 0 AND s.remaining_balance_minor > 0`);
  }
  if (type === "all" || type === "supplier") {
    branches.push(`SELECT 'supplier' AS debt_type, s.id AS entity_id,
      'Compte' AS ref, s.name AS party_name, s.phone AS party_phone,
      (COALESCE((SELECT SUM(total_minor) FROM stock_intakes WHERE supplier_id = s.id AND status != 'cancelled'), 0) + s.initial_balance_minor) AS original_minor,
      COALESCE((SELECT SUM(amount_minor) FROM supplier_payments WHERE supplier_id = s.id), 0) AS paid_minor,
      s.outstanding_balance_minor AS remaining_minor,
      NULL AS due_date, s.updated_at AS created_at, 'due' AS status,
      NULL AS settlement_day, NULL AS next_settle, 'none' AS settle_band
    FROM suppliers s WHERE s.outstanding_balance_minor > 0`);
  }
  const union = branches.join("\nUNION ALL\n");
  const conds: string[] = [];
  const params: unknown[] = [];
  if (status !== "all") {
    conds.push(`status = ?`);
    params.push(status);
  }
  if (due === "today") conds.push(`substr(due_date, 1, 10) = date('now')`);
  else if (due === "overdue")
    conds.push(`due_date IS NOT NULL AND substr(due_date, 1, 10) < date('now')`);
  else if (due === "upcoming")
    conds.push(`due_date IS NOT NULL AND substr(due_date, 1, 10) > date('now')`);
  if (settle === "watch") conds.push(`settle_band IN ('overdue','soon')`);
  else if (settle === "overdue") conds.push(`settle_band = 'overdue'`);
  else if (settle === "soon") conds.push(`settle_band = 'soon'`);
  const q = query.trim();
  if (q) {
    conds.push(`(ref LIKE ? ESCAPE '\\' OR party_name LIKE ? ESCAPE '\\' OR party_phone LIKE ?)`);
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    params.push(like, like, like);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const order =
    sort === "remaining_desc"
      ? `remaining_minor DESC, created_at DESC`
      : sort === "date_desc"
        ? `created_at DESC`
        : `due_date IS NULL, due_date ASC, created_at DESC`;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM (\n${union}\n) ${where}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(`SELECT * FROM (\n${union}\n) ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function getDebtStats(): {
  debtors: number;
  customerDebtMinor: number;
  supplierDebtMinor: number;
  dueToday: number;
  settleOverdue: number;
  settleSoon: number;
} {
  const db = getDb();
  const cust = db
    .prepare(
      `SELECT COUNT(DISTINCT s.customer_id) AS debtors, COALESCE(SUM(s.remaining_balance_minor), 0) AS debt
       FROM sales s WHERE s.is_cancelled = 0 AND s.remaining_balance_minor > 0 AND s.customer_id IS NOT NULL`,
    )
    .get() as { debtors: number; debt: number };
  const sup = db
    .prepare(
      `SELECT COUNT(*) AS debtors, COALESCE(SUM(outstanding_balance_minor), 0) AS debt
       FROM suppliers WHERE outstanding_balance_minor > 0`,
    )
    .get() as { debtors: number; debt: number };
  const today = db
    .prepare(
      `SELECT COUNT(*) AS c FROM sales
       WHERE is_cancelled = 0 AND remaining_balance_minor > 0
       AND due_date IS NOT NULL AND substr(due_date, 1, 10) = date('now')`,
    )
    .get() as { c: number };
  // Clients au jour de règlement mensuel dépassé / proche (solde restant).
  const settleDate = `date(min(date('now','start of month','+' || (settlement_day - 1) || ' days'), date('now','start of month','+1 month','-1 day')))`;
  const settle = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN date('now') > (${settleDate}) THEN 1 ELSE 0 END), 0) AS overdue,
        COALESCE(SUM(CASE WHEN date('now') <= (${settleDate}) AND date((${settleDate}), '-7 days') <= date('now') THEN 1 ELSE 0 END), 0) AS soon
       FROM customers WHERE deleted_at IS NULL AND outstanding_balance_minor > 0 AND settlement_day IS NOT NULL`,
    )
    .get() as { overdue: number; soon: number };
  return {
    debtors: cust.debtors + sup.debtors,
    customerDebtMinor: cust.debt,
    supplierDebtMinor: sup.debt,
    dueToday: today.c,
    settleOverdue: settle.overdue,
    settleSoon: settle.soon,
  };
}

export function getDebtDetail(
  debtType: "customer" | "supplier",
  id: number,
): {
  header: unknown;
  party: unknown;
  payments: unknown[];
} {
  const db = getDb();
  if (debtType === "customer") {
    const header = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(id);
    if (!header) throw new Error("Créance introuvable.");
    const h = header as Record<string, unknown>;
    const party =
      h["customer_id"] != null
        ? db.prepare(`SELECT * FROM customers WHERE id = ?`).get(h["customer_id"])
        : null;
    const payments = db
      .prepare(`SELECT * FROM sale_payments WHERE sale_id = ? ORDER BY id DESC LIMIT 50`)
      .all(id);
    return { header, party, payments };
  }
  const header = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(id);
  if (!header) throw new Error("Dette introuvable.");
  const payments = db
    .prepare(`SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY id DESC LIMIT 50`)
    .all(id);
  return { header, party: header, payments };
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
  const inventory = { v: fifoValuation() };
  return { sales, collections, expenses, refunds, top, debt, supplierDebt, inventory, from, to };
}

export function listClosings(from: string, to: string): { rows: unknown[] } {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM daily_closings WHERE business_date BETWEEN ? AND ? ORDER BY business_date DESC`,
    )
    .all(from, to);
  return { rows };
}

export function createDailyClosingAtomic(args: {
  businessDate: string;
  openingMinor: number;
  operationId: string;
  now: string;
}): Record<string, unknown> {
  const db = getDb();
  const fast = peekIdempotency<Record<string, unknown>>(args.operationId, "closings.create");
  if (fast && Object.keys(fast).length > 0) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "closings.create", args.now);
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
    // Paiements fournisseurs du jour (informatif : la formule de clôture du
    // domaine ne les soustrait pas — colonne conservée pour compatibilité).
    const supplierPayouts = db
      .prepare(
        `SELECT COALESCE(SUM(amount_minor),0) AS s FROM supplier_payments WHERE substr(payment_date,1,10) = ?`,
      )
      .get(args.businessDate) as { s: number };
    // Formule canonique (miroir de src/domain/closings/closing-rules.ts
    // computeClosingBalance — electron/ ne peut pas importer src/ :
    // garder synchronisé, couvert par tests/unit/documents.test.ts).
    for (const [k, v] of Object.entries({
      openingMinor: args.openingMinor,
      cashSalesMinor: cash.p,
      customerCollectionsMinor: collections.c,
      expensesMinor: expenses.e,
      refundsMinor: refunds.r,
    })) {
      if (!Number.isInteger(v) || v < 0) {
        throw new Error(`Montant de clôture invalide : ${k}.`);
      }
    }
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
        supplierPayouts.s,
        collections.c,
        expenses.e,
        refunds.r,
        closing,
        args.now,
      );
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'closing.created', 'closing', ?, ?, ?, ?)`,
    ).run(randomUUID(), args.businessDate, args.operationId, JSON.stringify({ closing }), args.now);
    const result = {
      id: Number(r.lastInsertRowid),
      businessDate: args.businessDate,
      openingMinor: args.openingMinor,
      cashSalesMinor: cash.p,
      collectionsMinor: collections.c,
      expensesMinor: expenses.e,
      refundsMinor: refunds.r,
      closingMinor: closing,
    };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return (tx as unknown as () => Record<string, unknown>)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<Record<string, unknown>>(args.operationId);
      if (retry && Object.keys(retry).length > 0) return retry;
    }
    throw err;
  }
}

export function getZakatSources(): Record<string, unknown> {
  const db = getDb();
  const cash = db
    .prepare(
      `SELECT COALESCE(SUM(amount_paid_minor),0) AS paid, COALESCE(SUM(total_minor),0) AS total FROM sales WHERE is_cancelled = 0`,
    )
    .get();
  const inventory = { v: fifoValuation() };
  const customerDebts = db
    .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor),0) AS d FROM customers`)
    .get();
  const supplierDebts = db
    .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor),0) AS d FROM suppliers`)
    .get();
  const settings = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'zakat'`).get() as
    | { value_json: string }
    | undefined;
  let params: {
    ratePercent: number;
    nisabMinor: number;
    hawlDate: string | null;
    nisabMethod: string;
  } = {
    ratePercent: 2.5,
    nisabMinor: 0,
    hawlDate: null,
    nisabMethod: "gold",
  };
  try {
    if (settings) {
      const parsed = JSON.parse(settings.value_json) as {
        ratePercent?: number;
        nisabMinor?: number;
        hawlDate?: string | null;
        nisabMethod?: string;
      };
      params = { ...params, ...parsed };
    }
  } catch {
    /* défauts */
  }
  return { cash, inventory, customerDebts, supplierDebts, params };
}

export interface ZakatCalculationInput {
  hijriYear: string;
  calcDate: string;
  cashMinor: number;
  bankMinor: number;
  stockMinor: number;
  receivablesMinor: number;
  otherMinor: number;
  liabilitiesMinor: number;
  nisabMinor: number;
  ratePercent: number;
  notes: string | null;
  operationId: string;
  now: string;
}

export function saveZakatCalculation(args: ZakatCalculationInput): { id: number } {
  const db = getDb();
  // P1-6 : double-clic = UNE seule ligne (retry rejoue le résultat stocké).
  const fast = peekIdempotency<{ id: number }>(args.operationId, "zakat.save");
  if (fast) return fast;
  for (const [k, v] of [
    ["cash", args.cashMinor],
    ["bank", args.bankMinor],
    ["stock", args.stockMinor],
    ["receivables", args.receivablesMinor],
    ["other", args.otherMinor],
    ["liabilities", args.liabilitiesMinor],
    ["nisab", args.nisabMinor],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`Montant zakat invalide : ${k}.`);
  }
  if (!(args.ratePercent > 0) || args.ratePercent > 100) throw new Error("Taux invalide.");
  if (args.hijriYear.trim().length < 4) throw new Error("Année hégirienne requise.");
  const net = Math.max(
    0,
    args.cashMinor +
      args.bankMinor +
      args.stockMinor +
      args.receivablesMinor +
      args.otherMinor -
      args.liabilitiesMinor,
  );
  const zakat =
    net >= args.nisabMinor && args.nisabMinor > 0 ? Math.round((net * args.ratePercent) / 100) : 0;
  // P8: calcul tracé (reporting financier).
  const txz = db.transaction(() => {
    claimIdempotency(args.operationId, "zakat.save", args.now);
    const r = db
      .prepare(
        `INSERT INTO zakat_calculations (uuid, hijri_year, calc_date, cash_minor, bank_minor, stock_minor, receivables_minor, other_minor, liabilities_minor, net_minor, nisab_minor, rate_percent, zakat_minor, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        args.hijriYear.trim(),
        args.calcDate,
        args.cashMinor,
        args.bankMinor,
        args.stockMinor,
        args.receivablesMinor,
        args.otherMinor,
        args.liabilitiesMinor,
        net,
        args.nisabMinor,
        args.ratePercent,
        zakat,
        args.notes?.trim() || null,
        args.now,
      );
    const id = Number(r.lastInsertRowid);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'zakat.calculated', 'zakat', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(id),
      args.operationId,
      JSON.stringify({ hijriYear: args.hijriYear.trim(), zakat }),
      args.now,
    );
    const out = { id };
    storeIdempotencyResult(args.operationId, out);
    return out;
  });
  try {
    return (txz as unknown as () => { id: number })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ id: number }>(args.operationId, "zakat.save");
      if (retry) return retry;
    }
    throw err;
  }
}

export function listZakatCalculations(
  page: number,
  pageSize: number,
): {
  rows: unknown[];
  total: number;
} {
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM zakat_calculations`).get() as { c: number })
    .c;
  const rows = db
    .prepare(`SELECT * FROM zakat_calculations ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export interface ReportsSummaryInput {
  from: string;
  to: string;
  customerId: number | null;
  supplierId: number | null;
  categoryId: number | null;
}

/**
 * Synthèse rapports sur période (lecture seule, bornée).
 * Marge brute = Σ(ventes nettes) − Σ(coût d'achat des lignes vendues),
 * remises/livraison incluses via les totaux nets. Granularité jour
 * (≤ 62 j) sinon semaine ISO.
 */
export function getReportsSummary(args: ReportsSummaryInput): Record<string, unknown> {
  const db = getDb();
  if (args.from > args.to) throw new Error("Période invalide.");
  const spanDays =
    Math.round(
      (new Date(`${args.to}T00:00:00Z`).getTime() - new Date(`${args.from}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;
  if (spanDays < 1 || spanDays > 366) throw new Error("Période hors bornes (1-366 jours).");
  const weekly = spanDays > 62;
  const saleCust = args.customerId != null ? `AND s.customer_id = ?` : "";
  const saleCustP: unknown[] = args.customerId != null ? [args.customerId] : [];
  const saleCat = args.categoryId != null;
  const intakeSup = args.supplierId != null ? `AND si.supplier_id = ?` : "";
  const intakeSupP: unknown[] = args.supplierId != null ? [args.supplierId] : [];
  const intakeCat = args.categoryId != null;

  // Ventes (avec jointure catégorie optionnelle via les lignes).
  const saleFrom = saleCat
    ? `sales s JOIN sale_items li ON li.sale_id = s.id JOIN products p ON p.id = li.product_id AND p.category_id = ?`
    : `sales s`;
  const saleFromP: unknown[] = saleCat ? [args.categoryId] : [];
  const salesClean = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(t.total_minor), 0) AS revenue FROM (
         SELECT DISTINCT s.id AS id, s.total_minor AS total_minor FROM ${saleFrom}
         WHERE s.is_cancelled = 0 AND substr(s.created_at, 1, 10) BETWEEN ? AND ? ${saleCust}
       ) t`,
    )
    .get(...saleFromP, args.from, args.to, ...saleCustP) as { n: number; revenue: number };
  // COGS = somme des coûts FIFO figés à la vente (cogs_minor), jamais le
  // dernier coût d'achat (les achats futurs ne réécrivent pas l'historique).
  const cogs = db
    .prepare(
      `SELECT COALESCE(SUM(li.cogs_minor), 0) AS cogs
       FROM sale_items li JOIN sales s ON s.id = li.sale_id
       ${saleCat ? "JOIN products p ON p.id = li.product_id AND p.category_id = ?" : ""}
       WHERE s.is_cancelled = 0 AND substr(s.created_at, 1, 10) BETWEEN ? AND ? ${saleCust}`,
    )
    .get(...(saleCat ? [args.categoryId] : []), args.from, args.to, ...saleCustP) as {
    cogs: number;
  };

  // Achats (entrées validées).
  const intakeFrom = intakeCat
    ? `stock_intakes si JOIN stock_intake_items ii ON ii.stock_intake_id = si.id JOIN products p ON p.id = ii.product_id AND p.category_id = ?`
    : `stock_intakes si`;
  const intakeFromP: unknown[] = intakeCat ? [args.categoryId] : [];
  const purchases = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(t.total_minor), 0) AS total FROM (
         SELECT DISTINCT si.id AS id, si.total_minor AS total_minor FROM ${intakeFrom}
         WHERE si.status != 'cancelled' AND substr(si.created_at, 1, 10) BETWEEN ? AND ? ${intakeSup}
       ) t`,
    )
    .get(...intakeFromP, args.from, args.to, ...intakeSupP) as { n: number; total: number };

  const expenses = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total FROM expenses
       WHERE substr(expense_date, 1, 10) BETWEEN ? AND ?`,
    )
    .get(args.from, args.to) as { total: number };

  // Séries temporelles (jour/semaine) : union des dates actives, montants par seau.
  const dayOrWeek = (col: string): string =>
    weekly ? `strftime('%Y-S%W', ${col})` : `substr(${col}, 1, 10)`;
  const buckets = db
    .prepare(
      `SELECT d AS date,
        COALESCE((SELECT SUM(t.total_minor) FROM (SELECT DISTINCT s2.id AS id, s2.total_minor AS total_minor FROM sales s2${saleCat ? " JOIN sale_items li2 ON li2.sale_id = s2.id JOIN products p2 ON p2.id = li2.product_id AND p2.category_id = ?" : ""} WHERE s2.is_cancelled = 0 AND ${weekly ? `strftime('%Y-S%W', s2.created_at)` : `substr(s2.created_at, 1, 10)`} = d ${saleCust.replace(/s\./g, "s2.")}) t), 0) AS sales
       FROM (SELECT DISTINCT ${dayOrWeek("created_at")} AS d FROM sales WHERE substr(created_at, 1, 10) BETWEEN ? AND ?
             UNION SELECT DISTINCT ${dayOrWeek("created_at")} FROM stock_intakes WHERE substr(created_at, 1, 10) BETWEEN ? AND ?
             UNION SELECT DISTINCT ${dayOrWeek("expense_date")} FROM expenses WHERE substr(expense_date, 1, 10) BETWEEN ? AND ?
             ORDER BY 1)`,
    )
    .all(
      ...(saleCat ? [args.categoryId] : []),
      ...saleCustP,
      args.from,
      args.to,
      args.from,
      args.to,
      args.from,
      args.to,
    ) as {
    date: string;
    sales: number;
  }[];
  // Séries achats/dépenses par seau (requêtes simples, période bornée).
  const byBucket = (
    table: string,
    col: string,
    dateCol: string,
    extra: string,
    extraP: unknown[],
  ): Map<string, number> => {
    const expr = weekly ? `strftime('%Y-S%W', ${dateCol})` : `substr(${dateCol}, 1, 10)`;
    const rows = db
      .prepare(
        `SELECT ${expr} AS d, COALESCE(SUM(${col}), 0) AS s FROM ${table}
         WHERE ${dateCol} IS NOT NULL AND substr(${dateCol}, 1, 10) BETWEEN ? AND ? ${extra} GROUP BY 1`,
      )
      .all(args.from, args.to, ...extraP) as { d: string; s: number }[];
    return new Map(rows.map((r) => [r.d, r.s]));
  };
  const purchMap = byBucket(
    "stock_intakes si",
    "total_minor",
    "si.created_at",
    `AND si.status != 'cancelled' ${intakeSup} ${intakeCat ? "AND EXISTS (SELECT 1 FROM stock_intake_items ii JOIN products p ON p.id = ii.product_id AND p.category_id = ? WHERE ii.stock_intake_id = si.id)" : ""}`,
    [...intakeSupP, ...(intakeCat ? [args.categoryId] : [])],
  );
  const expMap = byBucket("expenses", "amount_minor", "expense_date", "", []);
  const cogsMap = (() => {
    const expr = weekly ? `strftime('%Y-S%W', s.created_at)` : `substr(s.created_at, 1, 10)`;
    const rows = db
      .prepare(
        `SELECT ${expr} AS d, COALESCE(SUM(li.cogs_minor), 0) AS s
         FROM sale_items li JOIN sales s ON s.id = li.sale_id
         ${saleCat ? "JOIN products p ON p.id = li.product_id AND p.category_id = ?" : ""}
         WHERE s.is_cancelled = 0 AND substr(s.created_at, 1, 10) BETWEEN ? AND ? ${saleCust}
         GROUP BY 1`,
      )
      .all(...(saleCat ? [args.categoryId] : []), args.from, args.to, ...saleCustP) as {
      d: string;
      s: number;
    }[];
    return new Map(rows.map((r) => [r.d, r.s]));
  })();
  const payIn = db
    .prepare(
      `SELECT COALESCE(SUM(sp.amount_minor), 0) AS s FROM sale_payments sp
       WHERE substr(sp.payment_date, 1, 10) BETWEEN ? AND ?${args.customerId != null ? " AND sp.customer_id = ?" : ""}`,
    )
    .get(
      ...(args.customerId != null ? [args.from, args.to, args.customerId] : [args.from, args.to]),
    ) as { s: number };
  const payOut = db
    .prepare(
      `SELECT COALESCE(SUM(sp.amount_minor), 0) AS s FROM supplier_payments sp
       WHERE substr(sp.payment_date, 1, 10) BETWEEN ? AND ?${args.supplierId != null ? " AND sp.supplier_id = ?" : ""}`,
    )
    .get(
      ...(args.supplierId != null ? [args.from, args.to, args.supplierId] : [args.from, args.to]),
    ) as { s: number };
  const returns = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_return_value_minor), 0) AS s FROM returns
       WHERE status != 'cancelled' AND substr(created_at, 1, 10) BETWEEN ? AND ?`,
    )
    .get(args.from, args.to) as { n: number; s: number };
  const topCustomers = db
    .prepare(
      `SELECT COALESCE(c.search_name, 'Passage') AS name, COALESCE(SUM(s.total_minor), 0) AS total
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.is_cancelled = 0 AND substr(s.created_at, 1, 10) BETWEEN ? AND ? ${saleCust}
       GROUP BY COALESCE(c.search_name, 'Passage') ORDER BY total DESC LIMIT 5`,
    )
    .all(args.from, args.to, ...saleCustP);
  const topSuppliers = db
    .prepare(
      `SELECT COALESCE(s.name, 'Comptant') AS name, COALESCE(SUM(si.total_minor), 0) AS total
       FROM stock_intakes si LEFT JOIN suppliers s ON s.id = si.supplier_id
       WHERE si.status != 'cancelled' AND substr(si.created_at, 1, 10) BETWEEN ? AND ? ${intakeSup}
       GROUP BY COALESCE(s.name, 'Comptant') ORDER BY total DESC LIMIT 5`,
    )
    .all(args.from, args.to, ...intakeSupP);
  const topProducts = db
    .prepare(
      `SELECT li.product_name_snapshot AS name, COALESCE(SUM(li.quantity), 0) AS qty,
        COALESCE(SUM(li.line_total_minor), 0) AS total
       FROM sale_items li JOIN sales s ON s.id = li.sale_id
       ${saleCat ? "JOIN products p ON p.id = li.product_id AND p.category_id = ?" : ""}
       WHERE s.is_cancelled = 0 AND substr(s.created_at, 1, 10) BETWEEN ? AND ? ${saleCust}
       GROUP BY li.product_name_snapshot ORDER BY total DESC LIMIT 5`,
    )
    .all(...(saleCat ? [args.categoryId] : []), args.from, args.to, ...saleCustP);
  const customerDebt = db
    .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor), 0) AS d FROM customers`)
    .get() as { d: number };
  const supplierDebt = db
    .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor), 0) AS d FROM suppliers`)
    .get() as { d: number };

  return {
    from: args.from,
    to: args.to,
    weekly,
    kpis: {
      salesMinor: salesClean.revenue,
      salesCount: salesClean.n,
      purchasesMinor: purchases.total,
      purchasesCount: purchases.n,
      expensesMinor: expenses.total,
      profitMinor: Math.round(salesClean.revenue - Number(cogs.cogs)),
      customerDebtMinor: customerDebt.d,
      supplierDebtMinor: supplierDebt.d,
    },
    buckets: buckets.map((b) => ({
      date: b.date,
      sales: b.sales,
      purchases: purchMap.get(b.date) ?? 0,
      expenses: expMap.get(b.date) ?? 0,
      profit: Math.round(b.sales - (cogsMap.get(b.date) ?? 0)),
    })),
    tops: { customers: topCustomers, suppliers: topSuppliers, products: topProducts },
    payments: { inMinor: payIn.s, outMinor: payOut.s },
    returns: { count: returns.n, amountMinor: returns.s },
  };
}

/**
 * Tableau de bord (lecture seule, bornée) : KPIs période + instantanés
 * (dettes, stock), séries jour, méthodes, comparaison période précédente,
 * top rotation, alertes, récents, pain. Trésorerie = encaissé − décaissé.
 */
export function getDashboardSummary(from: string, to: string): Record<string, unknown> {
  const db = getDb();
  if (from > to) throw new Error("Période invalide.");
  const spanDays =
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;
  if (spanDays < 1 || spanDays > 366) throw new Error("Période hors bornes (1-366 jours).");
  const prevTo = new Date(new Date(`${from}T00:00:00Z`).getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const prevFrom = new Date(new Date(`${from}T00:00:00Z`).getTime() - spanDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const sales = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_minor), 0) AS t FROM sales
       WHERE is_cancelled = 0 AND substr(created_at, 1, 10) BETWEEN ? AND ?`,
    )
    .get(from, to) as { n: number; t: number };
  const prevSales = db
    .prepare(
      `SELECT COALESCE(SUM(total_minor), 0) AS t FROM sales
       WHERE is_cancelled = 0 AND substr(created_at, 1, 10) BETWEEN ? AND ?`,
    )
    .get(prevFrom, prevTo) as { t: number };
  const cogs = db
    .prepare(
      `SELECT COALESCE(SUM(li.cogs_minor), 0) AS c FROM sale_items li
       JOIN sales s ON s.id = li.sale_id
       WHERE s.is_cancelled = 0 AND substr(s.created_at, 1, 10) BETWEEN ? AND ?`,
    )
    .get(from, to) as { c: number };
  const purchases = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_minor), 0) AS t FROM stock_intakes
       WHERE status != 'cancelled' AND substr(created_at, 1, 10) BETWEEN ? AND ?`,
    )
    .get(from, to) as { n: number; t: number };
  const expenses = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(amount_minor), 0) AS t FROM expenses
       WHERE substr(expense_date, 1, 10) BETWEEN ? AND ?`,
    )
    .get(from, to) as { n: number; t: number };
  const payIn = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) AS s FROM sale_payments
       WHERE substr(payment_date, 1, 10) BETWEEN ? AND ?`,
    )
    .get(from, to) as { s: number };
  const payOut = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) AS s FROM supplier_payments
       WHERE substr(payment_date, 1, 10) BETWEEN ? AND ?`,
    )
    .get(from, to) as { s: number };
  const customerDebt = db
    .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor), 0) AS d FROM customers`)
    .get() as { d: number };
  const supplierDebt = db
    .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor), 0) AS d FROM suppliers`)
    .get() as { d: number };
  const stock = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN quantity > 0 AND quantity <= min_stock_level THEN 1 ELSE 0 END), 0) AS low,
        COALESCE(SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END), 0) AS out
       FROM products WHERE is_active = 1`,
    )
    .get() as { low: number; out: number };
  const stockValue = fifoValuation();
  const lowRows = db
    .prepare(
      `SELECT id, name, quantity, min_stock_level FROM products
       WHERE is_active = 1 AND quantity <= min_stock_level ORDER BY quantity ASC LIMIT 5`,
    )
    .all();
  const byMethod = db
    .prepare(
      `SELECT COALESCE(payment_method, 'none') AS method, COUNT(*) AS n, COALESCE(SUM(total_minor), 0) AS t
       FROM sales WHERE is_cancelled = 0 AND substr(created_at, 1, 10) BETWEEN ? AND ?
       GROUP BY COALESCE(payment_method, 'none') ORDER BY t DESC`,
    )
    .all(from, to);
  const byDay = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS d, COALESCE(SUM(total_minor), 0) AS t, COUNT(*) AS n
       FROM sales WHERE is_cancelled = 0 AND substr(created_at, 1, 10) BETWEEN ? AND ?
       GROUP BY 1 ORDER BY 1`,
    )
    .all(from, to);
  const fastMoving = db
    .prepare(
      `SELECT li.product_name_snapshot AS name, COALESCE(SUM(li.quantity), 0) AS qty,
        COALESCE(SUM(li.line_total_minor), 0) AS total
       FROM sale_items li JOIN sales s ON s.id = li.sale_id
       WHERE s.is_cancelled = 0 AND substr(s.created_at, 1, 10) BETWEEN ? AND ?
       GROUP BY li.product_name_snapshot ORDER BY qty DESC LIMIT 5`,
    )
    .all(from, to);
  const overdue = db
    .prepare(
      `SELECT 'customer' AS kind, s.invoice_number AS ref,
        COALESCE(c.search_name, 'Passage') AS party, s.remaining_balance_minor AS remaining,
        s.due_date AS due
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.is_cancelled = 0 AND s.remaining_balance_minor > 0
       AND s.due_date IS NOT NULL AND substr(s.due_date, 1, 10) < date('now')
       ORDER BY s.due_date ASC LIMIT 5`,
    )
    .all();
  const upcoming = db
    .prepare(
      `SELECT 'customer' AS kind, s.invoice_number AS ref,
        COALESCE(c.search_name, 'Passage') AS party, s.remaining_balance_minor AS remaining,
        s.due_date AS due
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.is_cancelled = 0 AND s.remaining_balance_minor > 0
       AND s.due_date IS NOT NULL AND substr(s.due_date, 1, 10) BETWEEN date('now') AND date('now', '+7 days')
       ORDER BY s.due_date ASC LIMIT 5`,
    )
    .all();
  const recentSales = db
    .prepare(
      `SELECT s.id, s.invoice_number, s.total_minor, s.created_at,
        COALESCE(c.search_name, 'Passage') AS party
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.is_cancelled = 0 ORDER BY s.id DESC LIMIT 5`,
    )
    .all();
  const recentPayments = db
    .prepare(
      `SELECT 'in' AS dir, sp.amount_minor, sp.method, sp.payment_date,
        COALESCE(c.search_name, 'Client') AS party
       FROM sale_payments sp LEFT JOIN customers c ON c.id = sp.customer_id
       UNION ALL
       SELECT 'out' AS dir, sp.amount_minor, sp.method, sp.payment_date,
        COALESCE(s.name, 'Fournisseur') AS party
       FROM supplier_payments sp LEFT JOIN suppliers s ON s.id = sp.supplier_id
       ORDER BY payment_date DESC LIMIT 5`,
    )
    .all();
  const recentPurchases = db
    .prepare(
      `SELECT si.id, COALESCE(si.invoice_number, 'BON-' || printf('%05d', si.id)) AS ref,
        COALESCE(s.name, 'Comptant') AS party, si.total_minor, si.created_at
       FROM stock_intakes si LEFT JOIN suppliers s ON s.id = si.supplier_id
       ORDER BY si.id DESC LIMIT 5`,
    )
    .all();
  const recentReturns = db
    .prepare(
      `SELECT 'client' AS kind, return_number AS ref, total_return_value_minor AS total, created_at
       FROM returns UNION ALL
       SELECT 'fournisseur' AS kind, return_number AS ref, total_return_value_minor AS total, created_at
       FROM supplier_returns ORDER BY created_at DESC LIMIT 5`,
    )
    .all();
  const recentExpenses = db
    .prepare(
      `SELECT id, description, category, amount_minor, expense_date FROM expenses
       ORDER BY expense_date DESC, id DESC LIMIT 5`,
    )
    .all();
  let integrity = "unknown";
  try {
    integrity = integrityCheck().integrity;
  } catch {
    /* diagnostic quand même */
  }
  let lastBackup: string | null = null;
  try {
    lastBackup = backupStatus().lastAt;
  } catch {
    /* best effort */
  }
  const profit = Math.round(sales.t - Number(cogs.c));
  const delta =
    prevSales.t > 0 ? Math.round(((sales.t - prevSales.t) / prevSales.t) * 1000) / 10 : 0;
  return {
    from,
    to,
    kpis: {
      salesMinor: sales.t,
      salesCount: sales.n,
      purchasesMinor: purchases.t,
      purchasesCount: purchases.n,
      expensesMinor: expenses.t,
      expensesCount: expenses.n,
      profitMinor: profit,
      customerDebtMinor: customerDebt.d,
      supplierDebtMinor: supplierDebt.d,
      stockValueMinor: Math.round(Number(stockValue)),
      cashMinor: payIn.s - payOut.s - expenses.t,
    },
    daily: byDay,
    byMethod,
    comparison: { prevSalesMinor: prevSales.t, deltaPercent: delta },
    fastMoving,
    stock: { low: stock.low, out: stock.out, lowRows },
    overdue,
    upcoming,
    recent: {
      sales: recentSales,
      payments: recentPayments,
      purchases: recentPurchases,
      returns: recentReturns,
      expenses: recentExpenses,
    },
    bread: getBreadStats(),
    alerts: { integrity, lastBackup },
  };
}
