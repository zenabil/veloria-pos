// Veloria PoS — Dashboard repository (read-only, NET des retours).
// Source de vérité : ventes non annulées − retours non annulés. Les retours
// restockés réduisent le COGS ; les retours non restockés restent une perte.
// Tous les agrégats utilisent des bornes de plage indexables (pas de substr
// dans le WHERE) et les listes « récentes » excluent les opérations annulées.
import { getDb, getLastIntegrityResult } from "../../database/sqlite.service";
import { backupStatus } from "../../backup/backup.service";
import { fifoValuation } from "./fifo";

const DAY_MS = 86_400_000;

interface Range {
  from: string;
  to: string;
  /** Premier jour exclu : permet created_at >= from AND created_at < toExclusive. */
  toExclusive: string;
  spanDays: number;
}

interface SalesAgg {
  n: number;
  t: number;
}

interface ReturnsAgg {
  n: number;
  total: number;
  refunded: number;
}

interface CogsAgg {
  c: number;
}

interface CategoryAcc {
  salesMinor: number;
  cogsMinor: number;
  returnsMinor: number;
  returnCogsMinor: number;
}

export interface DashboardCategoryRow {
  id: number | null;
  name: string;
  salesMinor: number;
  profitMinor: number;
  returnsMinor: number;
}

function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) throw new Error("Date invalide.");
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

function rangeOf(from: string, to: string): Range {
  if (from > to) throw new Error("Période invalide.");
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  const spanDays = Math.round((end - start) / DAY_MS) + 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || spanDays < 1 || spanDays > 366) {
    throw new Error("Période hors bornes (1-366 jours).");
  }
  return { from, to, toExclusive: addDays(to, 1), spanDays };
}

/** Ajoute le filtre auteur à une requête déjà pourvue d'un WHERE. */
function staffCond(alias: string, staffUserId: number | null, params: unknown[]): string {
  if (staffUserId == null) return "";
  params.push(staffUserId);
  return ` AND ${alias}.staff_user_id = ?`;
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T est le contrat de lecture des ~20 requêtes du dashboard ; sans lui chaque appel casterait unknown.
function getOne<T>(sql: string, params: unknown[]): T {
  return getDb()
    .prepare(sql)
    .get(...params) as T;
}

function getAll<T>(sql: string, params: unknown[]): T[] {
  return getDb()
    .prepare(sql)
    .all(...params) as T[];
}

/** CA brut − retours de la période, avec le nombre de ventes. */
function netSalesFor(
  from: string,
  to: string,
  staffUserId: number | null,
): { n: number; gross: number; returns: number; net: number } {
  const r = rangeOf(from, to);
  const sp: unknown[] = [r.from, r.toExclusive];
  const saleStaff = staffCond("s", staffUserId, sp);
  const gross = getOne<SalesAgg>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(s.total_minor), 0) AS t
     FROM sales s
     WHERE s.is_cancelled = 0 AND s.created_at >= ? AND s.created_at < ?${saleStaff}`,
    sp,
  );
  const rp: unknown[] = [r.from, r.toExclusive];
  const returnStaff = staffCond("r", staffUserId, rp);
  const ret = getOne<{ t: number }>(
    `SELECT COALESCE(SUM(r.total_return_value_minor), 0) AS t
     FROM returns r
     WHERE r.status != 'cancelled' AND r.created_at >= ? AND r.created_at < ?${returnStaff}`,
    rp,
  );
  return {
    n: Number(gross.n),
    gross: Number(gross.t),
    returns: Number(ret.t),
    net: Number(gross.t) - Number(ret.t),
  };
}

export function getDashboardSummary(
  from: string,
  to: string,
  staffUserId: number | null = null,
): Record<string, unknown> {
  const r = rangeOf(from, to);

  // Ventes + COGS de la période.
  const sp: unknown[] = [r.from, r.toExclusive];
  const saleStaff = staffCond("s", staffUserId, sp);
  const sales = getOne<SalesAgg>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(s.total_minor), 0) AS t
     FROM sales s
     WHERE s.is_cancelled = 0 AND s.created_at >= ? AND s.created_at < ?${saleStaff}`,
    sp,
  );
  const cp: unknown[] = [r.from, r.toExclusive];
  const cogsStaff = staffCond("s", staffUserId, cp);
  const cogs = getOne<CogsAgg>(
    `SELECT COALESCE(SUM(li.cogs_minor), 0) AS c
     FROM sale_items li JOIN sales s ON s.id = li.sale_id
     WHERE s.is_cancelled = 0 AND s.created_at >= ? AND s.created_at < ?${cogsStaff}`,
    cp,
  );

  // Retours non annulés : valeur, remboursements réels, COGS restocké.
  const rp: unknown[] = [r.from, r.toExclusive];
  const returnStaff = staffCond("r", staffUserId, rp);
  const returns = getOne<ReturnsAgg>(
    `SELECT COUNT(*) AS n,
       COALESCE(SUM(r.total_return_value_minor), 0) AS total,
       COALESCE(SUM(r.amount_refunded_minor), 0) AS refunded
     FROM returns r
     WHERE r.status != 'cancelled' AND r.created_at >= ? AND r.created_at < ?${returnStaff}`,
    rp,
  );
  const rcp: unknown[] = [r.from, r.toExclusive];
  const returnCogsStaff = staffCond("r", staffUserId, rcp);
  const returnCogs = getOne<CogsAgg>(
    `SELECT COALESCE(SUM(ri.cogs_minor), 0) AS c
     FROM return_items ri JOIN returns r ON r.id = ri.return_id
     WHERE r.status != 'cancelled' AND r.created_at >= ? AND r.created_at < ?${returnCogsStaff}`,
    rcp,
  );

  const netSales = Number(sales.t) - Number(returns.total);
  const netCogs = Number(cogs.c) - Number(returnCogs.c);

  // Achats : uniquement les réceptions validées (jamais draft/cancelled).
  const pp: unknown[] = [r.from, r.toExclusive];
  const purchaseStaff = staffCond("si", staffUserId, pp);
  const purchases = getOne<SalesAgg>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(si.total_minor), 0) AS t
     FROM stock_intakes si
     WHERE si.status = 'committed' AND si.created_at >= ? AND si.created_at < ?${purchaseStaff}`,
    pp,
  );

  const ep: unknown[] = [r.from, r.to];
  const expenseStaff = staffCond("e", staffUserId, ep);
  const expenses = getOne<SalesAgg>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(e.amount_minor), 0) AS t
     FROM expenses e
     WHERE e.expense_date >= ? AND e.expense_date <= ? AND e.status = 'paid'${expenseStaff}`,
    ep,
  );

  // Encaissements clients (ventes non annulées + encaissements autonomes).
  const ip: unknown[] = [r.from, r.to];
  const inflowStaff = staffCond("sp", staffUserId, ip);
  const payIn = getOne<{ s: number }>(
    `SELECT COALESCE(SUM(sp.amount_minor), 0) AS s
     FROM sale_payments sp LEFT JOIN sales sa ON sa.id = sp.sale_id
     WHERE sp.payment_date >= ? AND sp.payment_date <= ?
       AND (sp.sale_id IS NULL OR COALESCE(sa.is_cancelled, 0) = 0)${inflowStaff}`,
    ip,
  );
  const op: unknown[] = [r.from, r.to];
  const outflowStaff = staffCond("sp", staffUserId, op);
  const payOut = getOne<{ s: number }>(
    `SELECT COALESCE(SUM(sp.amount_minor), 0) AS s
     FROM supplier_payments sp
     WHERE sp.payment_date >= ? AND sp.payment_date <= ?${outflowStaff}`,
    op,
  );

  const customerDebt = getOne<{ d: number }>(
    `SELECT COALESCE(SUM(outstanding_balance_minor), 0) AS d FROM customers`,
    [],
  );
  const supplierDebt = getOne<{ d: number }>(
    `SELECT COALESCE(SUM(outstanding_balance_minor), 0) AS d FROM suppliers`,
    [],
  );

  const stock = getOne<{ low: number; out: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN quantity > 0 AND quantity <= min_stock_level THEN 1 ELSE 0 END), 0) AS low,
       COALESCE(SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END), 0) AS out
     FROM products WHERE is_active = 1`,
    [],
  );
  const lowRows = getAll<{ id: number; name: string; quantity: number; min_stock_level: number }>(
    `SELECT id, name, quantity, min_stock_level FROM products
     WHERE is_active = 1 AND quantity > 0 AND quantity <= min_stock_level
     ORDER BY quantity ASC LIMIT 5`,
    [],
  );

  // Moyens de paiement : encaissements réels − remboursements réels.
  const inflowP: unknown[] = [r.from, r.to];
  const inflowByMethodStaff = staffCond("sp", staffUserId, inflowP);
  const inflows = getAll<{ method: string; n: number; t: number }>(
    `SELECT sp.method AS method, COUNT(*) AS n, COALESCE(SUM(sp.amount_minor), 0) AS t
     FROM sale_payments sp LEFT JOIN sales sa ON sa.id = sp.sale_id
     WHERE sp.payment_date >= ? AND sp.payment_date <= ?
       AND (sp.sale_id IS NULL OR COALESCE(sa.is_cancelled, 0) = 0)${inflowByMethodStaff}
     GROUP BY sp.method`,
    inflowP,
  );
  const refundP: unknown[] = [r.from, r.toExclusive];
  const refundByMethodStaff = staffCond("r", staffUserId, refundP);
  const refunds = getAll<{ method: string; n: number; t: number }>(
    `SELECT COALESCE(r.refund_method, 'none') AS method, COUNT(*) AS n,
       COALESCE(SUM(r.amount_refunded_minor), 0) AS t
     FROM returns r
     WHERE r.status != 'cancelled' AND r.amount_refunded_minor > 0
       AND r.created_at >= ? AND r.created_at < ?${refundByMethodStaff}
     GROUP BY COALESCE(r.refund_method, 'none')`,
    refundP,
  );
  const methodMap = new Map<string, { method: string; n: number; t: number }>();
  const addMethod = (method: string, n: number, t: number): void => {
    const cur = methodMap.get(method) ?? { method, n: 0, t: 0 };
    cur.n += Number(n);
    cur.t += Number(t);
    methodMap.set(method, cur);
  };
  for (const row of inflows) addMethod(row.method, Number(row.n), Number(row.t));
  for (const row of refunds) addMethod(row.method, Number(row.n), -Number(row.t));
  const byMethod = [...methodMap.values()].filter((row) => row.n > 0).sort((a, b) => b.t - a.t);

  // Série journalière nette, remplie avec les jours sans vente (graphique fiable).
  const dayP: unknown[] = [r.from, r.toExclusive];
  const dayStaff = staffCond("s", staffUserId, dayP);
  const salesByDay = getAll<{ d: string; n: number; t: number }>(
    `SELECT substr(s.created_at, 1, 10) AS d, COUNT(*) AS n,
       COALESCE(SUM(s.total_minor), 0) AS t
     FROM sales s
     WHERE s.is_cancelled = 0 AND s.created_at >= ? AND s.created_at < ?${dayStaff}
     GROUP BY 1`,
    dayP,
  );
  const dayRetP: unknown[] = [r.from, r.toExclusive];
  const dayRetStaff = staffCond("r", staffUserId, dayRetP);
  const returnsByDay = getAll<{ d: string; t: number }>(
    `SELECT substr(r.created_at, 1, 10) AS d,
       COALESCE(SUM(r.total_return_value_minor), 0) AS t
     FROM returns r
     WHERE r.status != 'cancelled' AND r.created_at >= ? AND r.created_at < ?${dayRetStaff}
     GROUP BY 1`,
    dayRetP,
  );
  const salesDayMap = new Map(salesByDay.map((row) => [row.d, row]));
  const returnDayMap = new Map(returnsByDay.map((row) => [row.d, Number(row.t)]));
  const daily: { d: string; t: number; n: number }[] = [];
  for (let i = 0; i < r.spanDays; i += 1) {
    const d = addDays(r.from, i);
    const sale = salesDayMap.get(d);
    daily.push({
      d,
      n: Number(sale?.n ?? 0),
      t: Number(sale?.t ?? 0) - (returnDayMap.get(d) ?? 0),
    });
  }

  // Top rotations NETTES (une ligne retournée ne compte pas comme une vente).
  const fp: unknown[] = [r.from, r.toExclusive];
  const fastSaleStaff = staffCond("s", staffUserId, fp);
  fp.push(r.from, r.toExclusive);
  const fastReturnStaff = staffCond("r", staffUserId, fp);
  const fastMoving = getAll<{ name: string; qty: number; total: number }>(
    `SELECT product_id, name, SUM(qty) AS qty, SUM(total) AS total FROM (
       SELECT li.product_id AS product_id, li.product_name_snapshot AS name,
         li.quantity * li.unit_factor AS qty, li.line_total_minor AS total
       FROM sale_items li JOIN sales s ON s.id = li.sale_id
       WHERE s.is_cancelled = 0 AND s.created_at >= ? AND s.created_at < ?${fastSaleStaff}
       UNION ALL
       SELECT ri.product_id AS product_id, ri.product_name_snapshot AS name,
         -(ri.quantity * ri.unit_factor) AS qty, -ri.line_total_minor AS total
       FROM return_items ri JOIN returns r ON r.id = ri.return_id
       WHERE r.status != 'cancelled' AND r.created_at >= ? AND r.created_at < ?${fastReturnStaff}
     )
     GROUP BY product_id, name HAVING SUM(qty) > 0
     ORDER BY qty DESC LIMIT 5`,
    fp,
  );

  // Ventes + marge par catégorie (catégorie figée dans la ligne, pas la
  // catégorie actuelle du produit). Les frais de livraison ne sont pas
  // catégorisés : total catégories = ventes articles, hors livraison.
  const categories = getAll<{ id: number; name: string }>(
    `SELECT id, name FROM categories ORDER BY name COLLATE NOCASE`,
    [],
  );
  const csP: unknown[] = [r.from, r.toExclusive];
  const catSaleStaff = staffCond("s", staffUserId, csP);
  const catSales = getAll<{ categoryId: number | null; salesMinor: number; cogsMinor: number }>(
    `SELECT li.category_id AS categoryId,
       COALESCE(SUM(li.line_total_minor), 0) AS salesMinor,
       COALESCE(SUM(li.cogs_minor), 0) AS cogsMinor
     FROM sale_items li JOIN sales s ON s.id = li.sale_id
     WHERE s.is_cancelled = 0 AND s.created_at >= ? AND s.created_at < ?${catSaleStaff}
     GROUP BY li.category_id`,
    csP,
  );
  const crP: unknown[] = [r.from, r.toExclusive];
  const catReturnStaff = staffCond("r", staffUserId, crP);
  const catReturns = getAll<{
    categoryId: number | null;
    returnsMinor: number;
    cogsMinor: number;
  }>(
    `SELECT ri.category_id AS categoryId,
       COALESCE(SUM(ri.line_total_minor), 0) AS returnsMinor,
       COALESCE(SUM(ri.cogs_minor), 0) AS cogsMinor
     FROM return_items ri JOIN returns r ON r.id = ri.return_id
     WHERE r.status != 'cancelled' AND r.created_at >= ? AND r.created_at < ?${catReturnStaff}
     GROUP BY ri.category_id`,
    crP,
  );
  const acc = new Map<number | null, CategoryAcc>();
  const ensureAcc = (id: number | null): CategoryAcc => {
    const cur = acc.get(id) ?? {
      salesMinor: 0,
      cogsMinor: 0,
      returnsMinor: 0,
      returnCogsMinor: 0,
    };
    acc.set(id, cur);
    return cur;
  };
  for (const row of catSales) {
    const cur = ensureAcc(row.categoryId == null ? null : Number(row.categoryId));
    cur.salesMinor += Number(row.salesMinor);
    cur.cogsMinor += Number(row.cogsMinor);
  }
  for (const row of catReturns) {
    const cur = ensureAcc(row.categoryId == null ? null : Number(row.categoryId));
    cur.returnsMinor += Number(row.returnsMinor);
    cur.returnCogsMinor += Number(row.cogsMinor);
  }
  const categoryNames = new Map(categories.map((c) => [Number(c.id), c.name]));
  const byCategory: DashboardCategoryRow[] = categories.map((c) => {
    const cur = acc.get(Number(c.id)) ?? {
      salesMinor: 0,
      cogsMinor: 0,
      returnsMinor: 0,
      returnCogsMinor: 0,
    };
    return {
      id: Number(c.id),
      name: c.name,
      salesMinor: cur.salesMinor - cur.returnsMinor,
      profitMinor: cur.salesMinor - cur.returnsMinor - (cur.cogsMinor - cur.returnCogsMinor),
      returnsMinor: cur.returnsMinor,
    };
  });
  const uncategorized = acc.get(null);
  if (uncategorized) {
    byCategory.push({
      id: null,
      name: "Sans catégorie",
      salesMinor: uncategorized.salesMinor - uncategorized.returnsMinor,
      profitMinor:
        uncategorized.salesMinor -
        uncategorized.returnsMinor -
        (uncategorized.cogsMinor - uncategorized.returnCogsMinor),
      returnsMinor: uncategorized.returnsMinor,
    });
  }
  // Catégories historiques absentes du catalogue (ne devrait pas arriver avec
  // la FK SET NULL, mais le rapport ne doit jamais masquer un montant).
  for (const [id, cur] of acc) {
    if (id != null && !categoryNames.has(id)) {
      byCategory.push({
        id,
        name: `Catégorie #${id}`,
        salesMinor: cur.salesMinor - cur.returnsMinor,
        profitMinor: cur.salesMinor - cur.returnsMinor - (cur.cogsMinor - cur.returnCogsMinor),
        returnsMinor: cur.returnsMinor,
      });
    }
  }
  byCategory.sort((a, b) => b.salesMinor - a.salesMinor || a.name.localeCompare(b.name));

  const today = new Date().toISOString().slice(0, 10);
  const in7 = addDays(today, 7);
  const overdueBase =
    "s.is_cancelled = 0 AND s.remaining_balance_minor > 0 AND s.due_date IS NOT NULL";
  const overdueP: unknown[] = [today];
  const overdueStaff = staffCond("s", staffUserId, overdueP);
  const overdueCount = Number(
    getOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sales s WHERE ${overdueBase} AND s.due_date < ?${overdueStaff}`,
      overdueP,
    ).c,
  );
  const overdue = getAll<{
    kind: string;
    ref: string;
    party: string;
    remaining: number;
    due: string;
  }>(
    `SELECT 'customer' AS kind, s.invoice_number AS ref,
       COALESCE(c.search_name, 'Passage') AS party, s.remaining_balance_minor AS remaining,
       s.due_date AS due
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
     WHERE ${overdueBase} AND s.due_date < ?${overdueStaff}
     ORDER BY s.due_date ASC LIMIT 5`,
    overdueP,
  );
  const upcomingP: unknown[] = [today, in7];
  const upcomingStaff = staffCond("s", staffUserId, upcomingP);
  const upcomingCount = Number(
    getOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sales s
       WHERE ${overdueBase} AND s.due_date >= ? AND s.due_date <= ?${upcomingStaff}`,
      upcomingP,
    ).c,
  );
  const upcoming = getAll<{
    kind: string;
    ref: string;
    party: string;
    remaining: number;
    due: string;
  }>(
    `SELECT 'customer' AS kind, s.invoice_number AS ref,
       COALESCE(c.search_name, 'Passage') AS party, s.remaining_balance_minor AS remaining,
       s.due_date AS due
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
     WHERE ${overdueBase} AND s.due_date >= ? AND s.due_date <= ?${upcomingStaff}
     ORDER BY s.due_date ASC LIMIT 5`,
    upcomingP,
  );

  const recentSaleP: unknown[] = [];
  const recentSaleStaff = staffCond("s", staffUserId, recentSaleP);
  const recentSales = getAll<{
    id: number;
    invoice_number: string;
    total_minor: number;
    created_at: string;
    party: string;
  }>(
    `SELECT s.id, s.invoice_number, s.total_minor, s.created_at,
       COALESCE(c.search_name, 'Passage') AS party
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.is_cancelled = 0${recentSaleStaff} ORDER BY s.id DESC LIMIT 5`,
    recentSaleP,
  );

  const recentPayP: unknown[] = [];
  const recentPayInStaff = staffCond("sp", staffUserId, recentPayP);
  const recentPayOutWhere = staffUserId != null ? "WHERE sp.staff_user_id = ?" : "";
  if (staffUserId != null) recentPayP.push(staffUserId);
  const recentPayments = getAll<{
    dir: string;
    amount_minor: number;
    method: string;
    payment_date: string;
    party: string;
  }>(
    `SELECT 'in' AS dir, sp.amount_minor, sp.method, sp.payment_date,
       COALESCE(c.search_name, 'Client') AS party
     FROM sale_payments sp
     LEFT JOIN sales sa ON sa.id = sp.sale_id
     LEFT JOIN customers c ON c.id = sp.customer_id
     WHERE (sp.sale_id IS NULL OR COALESCE(sa.is_cancelled, 0) = 0)${recentPayInStaff}
     UNION ALL
     SELECT 'out' AS dir, sp.amount_minor, sp.method, sp.payment_date,
       COALESCE(s.name, 'Fournisseur') AS party
     FROM supplier_payments sp LEFT JOIN suppliers s ON s.id = sp.supplier_id
     ${recentPayOutWhere}
     ORDER BY payment_date DESC LIMIT 5`,
    recentPayP,
  );

  const recentPurchaseP: unknown[] = [];
  const recentPurchaseStaff = staffCond("si", staffUserId, recentPurchaseP);
  const recentPurchases = getAll<{
    id: number;
    ref: string;
    party: string;
    total_minor: number;
    created_at: string;
  }>(
    `SELECT si.id, COALESCE(si.invoice_number, 'BON-' || printf('%05d', si.id)) AS ref,
       COALESCE(s.name, 'Comptant') AS party, si.total_minor, si.created_at
     FROM stock_intakes si LEFT JOIN suppliers s ON s.id = si.supplier_id
     WHERE si.status = 'committed'${recentPurchaseStaff}
     ORDER BY si.id DESC LIMIT 5`,
    recentPurchaseP,
  );

  const recentReturnP: unknown[] = [];
  const recentReturnCustomerStaff = staffCond("r", staffUserId, recentReturnP);
  const recentReturnSupplierStaff = staffCond("sr", staffUserId, recentReturnP);
  const recentReturns = getAll<{ kind: string; ref: string; total: number; created_at: string }>(
    `SELECT 'client' AS kind, r.return_number AS ref,
       r.total_return_value_minor AS total, r.created_at
     FROM returns r WHERE r.status != 'cancelled'${recentReturnCustomerStaff}
     UNION ALL
     SELECT 'fournisseur' AS kind, sr.return_number AS ref,
       sr.total_return_value_minor AS total, sr.created_at
     FROM supplier_returns sr WHERE sr.status != 'cancelled'${recentReturnSupplierStaff}
     ORDER BY created_at DESC LIMIT 5`,
    recentReturnP,
  );

  const recentExpenseP: unknown[] = [];
  const recentExpenseStaff = staffCond("e", staffUserId, recentExpenseP);
  const recentExpenses = getAll<{
    id: number;
    description: string;
    category: string;
    amount_minor: number;
    expense_date: string;
  }>(
    `SELECT e.id, e.description, e.category, e.amount_minor, e.expense_date
     FROM expenses e WHERE 1 = 1${recentExpenseStaff}
     ORDER BY e.expense_date DESC, e.id DESC LIMIT 5`,
    recentExpenseP,
  );

  const prevFrom = addDays(from, -r.spanDays);
  const prevTo = addDays(from, -1);
  const prev = netSalesFor(prevFrom, prevTo, staffUserId);
  const delta = prev.net > 0 ? Math.round(((netSales - prev.net) / prev.net) * 1000) / 10 : 0;

  const profit = Math.round(netSales - netCogs);
  const cashMinor =
    Number(payIn.s) - Number(returns.refunded) - Number(payOut.s) - Number(expenses.t);

  // Diagnostic : jamais de PRAGMA integrity_check complet à chaque affichage.
  // On affiche le dernier verdict connu AVEC son horodatage (pas de « sain »
  // éternel après une vérification ancienne).
  const integrityResult = getLastIntegrityResult();
  const integrity = integrityResult?.integrity ?? "unknown";
  let lastBackup: string | null = null;
  try {
    lastBackup = backupStatus().lastAt;
  } catch {
    /* best effort */
  }

  return {
    from,
    to,
    kpis: {
      salesMinor: netSales,
      salesCount: Number(sales.n),
      returnsMinor: Number(returns.total),
      returnsCount: Number(returns.n),
      purchasesMinor: Number(purchases.t),
      purchasesCount: Number(purchases.n),
      expensesMinor: Number(expenses.t),
      expensesCount: Number(expenses.n),
      profitMinor: profit,
      customerDebtMinor: Number(customerDebt.d),
      supplierDebtMinor: Number(supplierDebt.d),
      stockValueMinor: Math.round(Number(fifoValuation())),
      cashMinor,
    },
    daily,
    byMethod,
    byCategory,
    comparison: { prevSalesMinor: prev.net, deltaPercent: delta },
    fastMoving,
    stock: { low: Number(stock.low), out: Number(stock.out), lowRows },
    overdue,
    overdueCount,
    upcoming,
    upcomingCount,
    recent: {
      sales: recentSales,
      payments: recentPayments,
      purchases: recentPurchases,
      returns: recentReturns,
      expenses: recentExpenses,
    },
    alerts: { integrity, integrityAt: integrityResult?.at ?? null, lastBackup },
  };
}
