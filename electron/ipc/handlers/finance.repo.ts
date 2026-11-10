// Veloria PoS — Main-process repository: finance (Phase 8).
// Dettes + rapports période + clôtures Z + sources zakat. Agrégats SQL bornés.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { fifoValuation } from "./fifo";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";
import { getStaffRole } from "./staff.repo";
import { assertOrderClause } from "./sql-guard";
import { percentOfTotal } from "../money-guard";
import {
  SQL_BUSINESS_DATE_PREFIX,
  businessDayRangeUtc,
  businessDaySql,
  businessWeekSql,
  calendarDaySql,
  calendarWeekSql,
  sqlBusinessToday,
} from "../../shared/business-day";

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
 * E-35 : le calendrier de référence est le JOUR MÉTIER (Africa/Algiers).
 */
const SETTLE_DATE = `date(min(${SQL_BUSINESS_DATE_PREFIX},'start of month','+' || (c.settlement_day - 1) || ' days'), ${SQL_BUSINESS_DATE_PREFIX},'start of month','+1 month','-1 day')))`;
const SETTLE_BAND = `(CASE WHEN c.settlement_day IS NULL THEN 'none' WHEN ${sqlBusinessToday()} > (${SETTLE_DATE}) THEN 'overdue' WHEN date((${SETTLE_DATE}), '-7 days') <= ${sqlBusinessToday()} THEN 'soon' ELSE 'ok' END)`;

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
      CASE WHEN s.due_date IS NOT NULL AND ${calendarDaySql("s.due_date")} < ${sqlBusinessToday()} THEN 'overdue' ELSE 'due' END AS status,
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
  if (due === "today") conds.push(`${calendarDaySql("due_date")} = ${sqlBusinessToday()}`);
  else if (due === "overdue")
    conds.push(`due_date IS NOT NULL AND ${calendarDaySql("due_date")} < ${sqlBusinessToday()}`);
  else if (due === "upcoming")
    conds.push(`due_date IS NOT NULL AND ${calendarDaySql("due_date")} > ${sqlBusinessToday()}`);
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
    .prepare(
      `SELECT * FROM (\n${union}\n) ${where} ORDER BY ${assertOrderClause(order)} LIMIT ? OFFSET ?`,
    )
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
       AND due_date IS NOT NULL AND ${calendarDaySql("due_date")} = ${sqlBusinessToday()}`,
    )
    .get() as { c: number };
  // Clients au jour de règlement mensuel dépassé / proche (solde restant).
  const settleDate = `date(min(${SQL_BUSINESS_DATE_PREFIX},'start of month','+' || (settlement_day - 1) || ' days'), ${SQL_BUSINESS_DATE_PREFIX},'start of month','+1 month','-1 day')))`;
  const settle = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN ${sqlBusinessToday()} > (${settleDate}) THEN 1 ELSE 0 END), 0) AS overdue,
        COALESCE(SUM(CASE WHEN ${sqlBusinessToday()} <= (${settleDate}) AND date((${settleDate}), '-7 days') <= ${sqlBusinessToday()} THEN 1 ELSE 0 END), 0) AS soon
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
    // Z : le sous-total « ventes_espèces » = les ventes ENCAISSÉES EN ESPÈCES
    // (le CHECK du domaine s'appelle cashSalesMinor — « ventes_espèces »).
    // Un encaissement par chèque ou par virement ne remplit PAS le tiroir :
    // il est exclu. payment_method NULL = vente sans moyen de paiement
    // (amount_paid = 0 ⇒ contribution nulle) : traité comme espèces, sans
    // effet sur le total.
    // E-35 : la journée clôturée est le jour MÉTIER — bornes UTC de la journée
    // d'Algiers (23:00Z la veille → 23:00Z le jour même), comparables aux
    // `created_at` ISO UTC stockés et indexables.
    //
    // C-01/C-02 (audit 2026-11-09) : source unique = `sale_payments` (grand livre des flux).
    // `payment_date` date-seule = jour metier (jamais decalee) ; les premiers paiements
    // stockes en instant ISO ont pour jour effectif le jour metier de `created_at`.
    // `collections` = TOUS les flux d'especes du jour (sans vente ou vente d'un autre jour),
    // pas seulement `sale_id IS NULL`. Les ventes sans reglement (legacy) restent couvertes
    // par le repli `amount_paid - credit_applied` (NOT EXISTS, zero double comptage).
    const day = businessDayRangeUtc(args.businessDate);
    const effPayDay = `(CASE WHEN length(sp.payment_date) = 10 THEN substr(sp.payment_date, 1, 10) ELSE date(sp.created_at, '+1 hour') END)`;
    const totalPayments = db
      .prepare(
        `SELECT COALESCE(SUM(sp.amount_minor), 0) AS p FROM sale_payments sp
         LEFT JOIN sales s ON s.id = sp.sale_id
         WHERE sp.method = 'cash'
           AND ${effPayDay} = ?
           AND (sp.sale_id IS NULL OR COALESCE(s.is_cancelled, 0) = 0)`,
      )
      .get(args.businessDate) as { p: number };
    const cashSalesPayments = db
      .prepare(
        `SELECT COALESCE(SUM(sp.amount_minor), 0) AS p FROM sale_payments sp
         JOIN sales s ON s.id = sp.sale_id
         WHERE sp.method = 'cash'
           AND ${effPayDay} = ?
           AND s.created_at >= ? AND s.created_at < ?
           AND s.is_cancelled = 0`,
      )
      .get(args.businessDate, day.from, day.toExclusive) as { p: number };
    const cashSynthetic = db
      .prepare(
        `SELECT COALESCE(SUM(amount_paid_minor - credit_applied_minor), 0) AS p FROM sales
         WHERE created_at >= ? AND created_at < ? AND is_cancelled = 0
           AND COALESCE(payment_method, 'cash') = 'cash'
           AND NOT EXISTS (SELECT 1 FROM sale_payments WHERE sale_id = sales.id)`,
      )
      .get(day.from, day.toExclusive) as { p: number };
    const cash = { p: cashSalesPayments.p + cashSynthetic.p };
    const collections = { c: totalPayments.p - cashSalesPayments.p };
    // Dépenses : seules les dépenses DÉCAISSÉES ('paid') diminuent le tiroir ;
    // une dépense 'pending' (non payée) ne sort pas d'argent de la caisse.
    const expenses = db
      .prepare(
        `SELECT COALESCE(SUM(amount_minor),0) AS e FROM expenses WHERE expense_date = ? AND status = 'paid'`,
      )
      .get(args.businessDate) as { e: number };
    // Remboursements (C-03) : attribues a l'instant de sortie d'argent (journal
    // `return_refund_movements` depuis 0060), pas a la creation du retour. Les retours
    // anciens sans journal restent attribues selon `updated_at` (dernier remboursement).
    const refundsMov = db
      .prepare(
        `SELECT COALESCE(SUM(m.amount_minor), 0) AS r FROM return_refund_movements m
         JOIN returns rr ON rr.id = m.return_id
         WHERE rr.status != 'cancelled' AND m.created_at >= ? AND m.created_at < ?`,
      )
      .get(day.from, day.toExclusive) as { r: number };
    const refundsLegacy = db
      .prepare(
        `SELECT COALESCE(SUM(amount_refunded_minor), 0) AS r FROM returns
         WHERE status != 'cancelled' AND updated_at >= ? AND updated_at < ?
           AND NOT EXISTS (SELECT 1 FROM return_refund_movements WHERE return_id = returns.id)`,
      )
      .get(day.from, day.toExclusive) as { r: number };
    const refunds = { r: refundsMov.r + refundsLegacy.r };
    // Paiements fournisseurs du jour (informatif : la formule de clôture du
    // domaine ne les soustrait pas — colonne conservée pour compatibilité).
    const supplierPayouts = db
      .prepare(
        `SELECT COALESCE(SUM(amount_minor),0) AS s FROM supplier_payments WHERE ${calendarDaySql("payment_date")} = ?`,
      )
      .get(args.businessDate) as { s: number };
    // Formule canonique (miroir de src/domain/closings/closing-rules.ts
    // computeClosingBalance — electron/ ne peut pas importer src/ :
    // garder synchronisé, couvert par tests/unit/documents.test.ts).
    // L12 — périmètre volontaire (conclusion d'audit) : le module pain est
    // supprimé (ADR-109) — `collections` ne compte que sale_payments.
    // Les décaissements fournisseurs (colonne informative ci-dessus)
    // n'entrent pas non plus. Identique au
    // domaine, qui ne prend que opening + cashSales + customerCollections −
    // expenses − refunds. Toute évolution se décide dans
    // src/domain/closings/closing-rules.ts.
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

/**
 * E-21 (P1) : RÉOUVERTURE d'une journée clôturée.
 *
 * La migration 0048 verrouille une journée close (fail-closed : plus aucune
 * écriture sur cette date). Sans issue, une erreur de saisie du jour devenait
 * IRRÉVERSIBLE. Cette fonction est l'issue EXPLICITE, TRACÉE et RAREMENT
 * UTILISABLE :
 *   - réservé au GÉRANT (session obligatoire, fail-closed sans session) ;
 *   - idempotent (même `operationId` = effet unique, rejouable) ;
 *   - la ligne de clôture est SUPPRIMÉE (les montants d'origine sont
 *     conservés dans `audit_log` ⇒ l'historique reste lisible) ;
 *   - la journée redevient modifiable, puis peut être re-clôturée (la clôture
 *     recalcule les compteurs à la nouvelle).
 */
export function reopenDailyClosingAtomic(args: {
  businessDate: string;
  operationId: string;
  now: string;
  actorUserId: number | null;
}): Record<string, unknown> {
  const db = getDb();
  // Gérant uniquement : sans session active, la réouverture est refusée.
  if (args.actorUserId == null) {
    throw new Error("Session requise : reconnectez-vous pour rouvrir une journée.");
  }
  if (getStaffRole(args.actorUserId) !== "manager") {
    throw new Error("Action réservée au gérant.");
  }
  const fast = peekIdempotency<Record<string, unknown>>(args.operationId, "closings.reopen");
  if (fast && Object.keys(fast).length > 0) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "closings.reopen", args.now);
    const closing = db
      .prepare(`SELECT * FROM daily_closings WHERE business_date = ?`)
      .get(args.businessDate) as Record<string, unknown> | undefined;
    if (!closing) {
      throw new Error("Aucune clôture à rouvrir pour cette date.");
    }
    db.prepare(`DELETE FROM daily_closings WHERE business_date = ?`).run(args.businessDate);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'closing.reopened', 'closing', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      args.businessDate,
      args.operationId,
      JSON.stringify({ closing, reopenedAt: args.now, actorUserId: args.actorUserId }),
      args.now,
    );
    const result = {
      reopened: true,
      businessDate: args.businessDate,
      previousClosing: closing,
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
      `SELECT COALESCE(SUM(amount_paid_minor - credit_applied_minor),0) AS paid, COALESCE(SUM(total_minor),0) AS total FROM sales WHERE is_cancelled = 0`,
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
    { value_json: string } | undefined;
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
    net >= args.nisabMinor && args.nisabMinor > 0
      ? (() => {
          // R7 RADICAL : calcul unique via money-guard (plus de duplication
          // du domaine percentOfMinor ici).
          if (!Number.isSafeInteger(net) || net < 0) throw new Error("Assiette nette invalide.");
          return percentOfTotal(net, args.ratePercent);
        })()
      : 0;
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
    return txz();
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
  /** R2 (0046) : null = gérant (tout), sinon opérations de l'utilisateur. */
  staffUserId?: number | null;
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
  const staffCond = args.staffUserId != null ? ` AND s.staff_user_id = ?` : "";
  const staffP: unknown[] = args.staffUserId != null ? [args.staffUserId] : [];
  const salesClean = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(t.total_minor), 0) AS revenue FROM (
         SELECT DISTINCT s.id AS id, s.total_minor AS total_minor FROM ${saleFrom}
         WHERE s.is_cancelled = 0 AND ${businessDaySql("s.created_at")} BETWEEN ? AND ? ${saleCust}${staffCond}
       ) t`,
    )
    .get(...saleFromP, args.from, args.to, ...saleCustP, ...staffP) as {
    n: number;
    revenue: number;
  };
  // COGS = somme des coûts FIFO figés à la vente (cogs_minor), jamais le
  // dernier coût d'achat (les achats futurs ne réécrivent pas l'historique).
  const cogs = db
    .prepare(
      `SELECT COALESCE(SUM(li.cogs_minor), 0) AS cogs
       FROM sale_items li JOIN sales s ON s.id = li.sale_id
       ${saleCat ? "JOIN products p ON p.id = li.product_id AND p.category_id = ?" : ""}
       WHERE s.is_cancelled = 0 AND ${businessDaySql("s.created_at")} BETWEEN ? AND ? ${saleCust}${staffCond}`,
    )
    .get(...(saleCat ? [args.categoryId] : []), args.from, args.to, ...saleCustP, ...staffP) as {
    cogs: number;
  };

  // Achats (entrées validées).
  const intakeFrom = intakeCat
    ? `stock_intakes si JOIN stock_intake_items ii ON ii.stock_intake_id = si.id JOIN products p ON p.id = ii.product_id AND p.category_id = ?`
    : `stock_intakes si`;
  const intakeFromP: unknown[] = intakeCat ? [args.categoryId] : [];
  const intakeStaffCond = args.staffUserId != null ? ` AND si.staff_user_id = ?` : "";
  const purchases = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(t.total_minor), 0) AS total FROM (
         SELECT DISTINCT si.id AS id, si.total_minor AS total_minor FROM ${intakeFrom}
         WHERE si.status != 'cancelled' AND ${businessDaySql("si.created_at")} BETWEEN ? AND ? ${intakeSup}${intakeStaffCond}
       ) t`,
    )
    .get(...intakeFromP, args.from, args.to, ...intakeSupP, ...staffP) as {
    n: number;
    total: number;
  };

  const expenses = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total FROM expenses
       WHERE ${calendarDaySql("expense_date")} BETWEEN ? AND ?${args.staffUserId != null ? " AND staff_user_id = ?" : ""}`,
    )
    .get(
      ...(args.staffUserId != null ? [args.from, args.to, args.staffUserId] : [args.from, args.to]),
    ) as { total: number };

  // Séries temporelles (jour/semaine) : union des dates actives, montants par seau.
  // E-35 : les seaux des colonnes d'INSTANT suivent le jour métier algérien ;
  // les colonnes date-seule sont déjà des dates métier (aucun décalage).
  const dayOrWeek = (col: string, instant: boolean): string =>
    instant
      ? weekly
        ? businessWeekSql(col)
        : businessDaySql(col)
      : weekly
        ? calendarWeekSql(col)
        : calendarDaySql(col);
  // R2 (0046) : périmètre auteur appliqué aux seaux ventes/achats/dépenses.
  const staffS2 = args.staffUserId != null ? ` AND s2.staff_user_id = ?` : "";
  const staff1T = args.staffUserId != null ? ` AND staff_user_id = ?` : "";
  const staffBP: unknown[] = args.staffUserId != null ? [args.staffUserId] : [];
  const saleBucket = dayOrWeek("s2.created_at", true);
  const buckets = db
    .prepare(
      `SELECT d AS date,
        COALESCE((SELECT SUM(t.total_minor) FROM (SELECT DISTINCT s2.id AS id, s2.total_minor AS total_minor FROM sales s2${saleCat ? " JOIN sale_items li2 ON li2.sale_id = s2.id JOIN products p2 ON p2.id = li2.product_id AND p2.category_id = ?" : ""} WHERE s2.is_cancelled = 0 AND ${saleBucket} = d ${saleCust.replace(/s\./g, "s2.")}${staffS2}) t), 0) AS sales
       FROM (SELECT DISTINCT ${dayOrWeek("created_at", true)} AS d FROM sales WHERE ${businessDaySql("created_at")} BETWEEN ? AND ?${staff1T}
             UNION SELECT DISTINCT ${dayOrWeek("created_at", true)} FROM stock_intakes WHERE ${businessDaySql("created_at")} BETWEEN ? AND ?${staff1T}
             UNION SELECT DISTINCT ${dayOrWeek("expense_date", false)} FROM expenses WHERE ${calendarDaySql("expense_date")} BETWEEN ? AND ?${staff1T}
             ORDER BY 1)`,
    )
    .all(
      ...(saleCat ? [args.categoryId] : []),
      ...saleCustP,
      ...staffBP,
      args.from,
      args.to,
      ...staffBP,
      args.from,
      args.to,
      ...staffBP,
      args.from,
      args.to,
      ...staffBP,
    ) as {
    date: string;
    sales: number;
  }[];
  // Séries achats/dépenses par seau (requêtes simples, période bornée).
  // L11 — DOCUMENTATION SANS CHANGEMENT : `${table}` / `${col}` / `${dateCol}`
  // / `${expr}` sont interpolés dans le SQL et ne proviennent QUE de
  // littéraux internes (appels ci-dessous : "stock_intakes si",
  // "total_minor", …) — jamais d'une saisie utilisateur. Toute nouvelle
  // utilisation doit conserver cette règle ; les bornes de période restent
  // toujours en paramètres `?`.
  const byBucket = (
    table: string,
    col: string,
    dateCol: string,
    extra: string,
    extraP: unknown[],
    staffCol: string | null = null,
    instant = true,
  ): Map<string, number> => {
    const bucket = dayOrWeek(dateCol, instant);
    const range = instant ? businessDaySql(dateCol) : calendarDaySql(dateCol);
    const staffCond = staffCol && args.staffUserId != null ? ` AND ${staffCol} = ?` : "";
    const staffParam: unknown[] = staffCol && args.staffUserId != null ? [args.staffUserId] : [];
    const rows = db
      .prepare(
        `SELECT ${bucket} AS d, COALESCE(SUM(${col}), 0) AS s FROM ${table}
         WHERE ${dateCol} IS NOT NULL AND ${range} BETWEEN ? AND ? ${extra}${staffCond} GROUP BY 1`,
      )
      .all(args.from, args.to, ...extraP, ...staffParam) as { d: string; s: number }[];
    return new Map(rows.map((r) => [r.d, r.s]));
  };
  const purchMap = byBucket(
    "stock_intakes si",
    "total_minor",
    "si.created_at",
    `AND si.status != 'cancelled' ${intakeSup} ${intakeCat ? "AND EXISTS (SELECT 1 FROM stock_intake_items ii JOIN products p ON p.id = ii.product_id AND p.category_id = ? WHERE ii.stock_intake_id = si.id)" : ""}`,
    [...intakeSupP, ...(intakeCat ? [args.categoryId] : [])],
    "si.staff_user_id",
    true,
  );
  const expMap = byBucket(
    "expenses",
    "amount_minor",
    "expense_date",
    "",
    [],
    "staff_user_id",
    false,
  );
  const cogsMap = (() => {
    const expr = dayOrWeek("s.created_at", true);
    const rows = db
      .prepare(
        `SELECT ${expr} AS d, COALESCE(SUM(li.cogs_minor), 0) AS s
         FROM sale_items li JOIN sales s ON s.id = li.sale_id
         ${saleCat ? "JOIN products p ON p.id = li.product_id AND p.category_id = ?" : ""}
         WHERE s.is_cancelled = 0 AND ${businessDaySql("s.created_at")} BETWEEN ? AND ? ${saleCust}${staffCond}
         GROUP BY 1`,
      )
      .all(...(saleCat ? [args.categoryId] : []), args.from, args.to, ...saleCustP, ...staffP) as {
      d: string;
      s: number;
    }[];
    return new Map(rows.map((r) => [r.d, r.s]));
  })();
  // L1 : encaissements alignés sur les KPIs ventes — un paiement rattaché à
  // une vente ANNULÉE n'est plus de l'argent encaissé (cancelSaleAtomic ne
  // supprime jamais la ligne sale_payments). Les encaissements autonomes
  // (sale_id NULL) restent comptés.
  const payStaffIn = args.staffUserId != null ? ` AND sp.staff_user_id = ?` : "";
  const payStaffP: unknown[] = args.staffUserId != null ? [args.staffUserId] : [];
  const payIn = db
    .prepare(
      `SELECT COALESCE(SUM(sp.amount_minor), 0) AS s FROM sale_payments sp
       LEFT JOIN sales sa ON sa.id = sp.sale_id
       WHERE ${calendarDaySql("sp.payment_date")} BETWEEN ? AND ?
         AND (sp.sale_id IS NULL OR COALESCE(sa.is_cancelled, 0) = 0)${args.customerId != null ? " AND sp.customer_id = ?" : ""}${payStaffIn}`,
    )
    .get(
      ...(args.customerId != null
        ? [args.from, args.to, args.customerId, ...payStaffP]
        : [args.from, args.to, ...payStaffP]),
    ) as { s: number };
  const payOut = db
    .prepare(
      `SELECT COALESCE(SUM(sp.amount_minor), 0) AS s FROM supplier_payments sp
       WHERE ${calendarDaySql("sp.payment_date")} BETWEEN ? AND ?${args.supplierId != null ? " AND sp.supplier_id = ?" : ""}${payStaffIn}`,
    )
    .get(
      ...(args.supplierId != null
        ? [args.from, args.to, args.supplierId, ...payStaffP]
        : [args.from, args.to, ...payStaffP]),
    ) as { s: number };
  const returns = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_return_value_minor), 0) AS s FROM returns
       WHERE status != 'cancelled' AND ${businessDaySql("created_at")} BETWEEN ? AND ?${args.staffUserId != null ? " AND staff_user_id = ?" : ""}`,
    )
    .get(
      ...(args.staffUserId != null ? [args.from, args.to, args.staffUserId] : [args.from, args.to]),
    ) as { n: number; s: number };
  const topCustomers = db
    .prepare(
      `SELECT COALESCE(c.search_name, 'Passage') AS name, COALESCE(SUM(s.total_minor), 0) AS total
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.is_cancelled = 0 AND ${businessDaySql("s.created_at")} BETWEEN ? AND ? ${saleCust}${args.staffUserId != null ? " AND s.staff_user_id = ?" : ""}
       GROUP BY COALESCE(c.search_name, 'Passage') ORDER BY total DESC LIMIT 5`,
    )
    .all(
      ...(args.staffUserId != null
        ? [args.from, args.to, ...saleCustP, args.staffUserId]
        : [args.from, args.to, ...saleCustP]),
    );
  const topSuppliers = db
    .prepare(
      `SELECT COALESCE(s.name, 'Comptant') AS name, COALESCE(SUM(si.total_minor), 0) AS total
       FROM stock_intakes si LEFT JOIN suppliers s ON s.id = si.supplier_id
       WHERE si.status != 'cancelled' AND ${businessDaySql("si.created_at")} BETWEEN ? AND ? ${intakeSup}${args.staffUserId != null ? " AND si.staff_user_id = ?" : ""}
       GROUP BY COALESCE(s.name, 'Comptant') ORDER BY total DESC LIMIT 5`,
    )
    .all(
      ...(args.staffUserId != null
        ? [args.from, args.to, ...intakeSupP, args.staffUserId]
        : [args.from, args.to, ...intakeSupP]),
    );
  const topProducts = db
    .prepare(
      `SELECT li.product_name_snapshot AS name,
        COALESCE(SUM(li.quantity * li.unit_factor), 0) AS qty,
        COALESCE(SUM(li.line_total_minor), 0) AS total
       FROM sale_items li JOIN sales s ON s.id = li.sale_id
       ${saleCat ? "JOIN products p ON p.id = li.product_id AND p.category_id = ?" : ""}
       WHERE s.is_cancelled = 0 AND ${businessDaySql("s.created_at")} BETWEEN ? AND ? ${saleCust}${args.staffUserId != null ? " AND s.staff_user_id = ?" : ""}
       GROUP BY li.product_name_snapshot ORDER BY total DESC LIMIT 5`,
    )
    .all(
      ...(saleCat ? [args.categoryId] : []),
      args.from,
      args.to,
      ...saleCustP,
      ...(args.staffUserId != null ? [args.staffUserId] : []),
    );
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
 * Tableau de bord : implémentation isolée dans `dashboard.repo.ts` (NET des
 * retours et remboursements, séries journalières complètes, catégories
 * historiques). `staffUserId` null = gérant ; sinon les tables attribuées sont
 * restreintes à l'auteur. Les instantanés de comptes (dettes, stock) restent
 * globaux par conception (affichés comme tels dans l'UI).
 */
export { getDashboardSummary } from "./dashboard.repo";
