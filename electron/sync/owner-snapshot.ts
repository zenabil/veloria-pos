// Veloria PoS — Liasse de supervision propriétaire (ADR-171) : CONSTRUCTEUR.
// SQLite reste la seule source de vérité : ce module AGRÈGE pour l'app `owner/`
// (lecture seule, PostgREST `public.owner_snapshots`). Il ne réécrit aucune
// requête métier existante — il appelle les repos de lecture du POS
// (`dashboard.repo`, `cash-session.repo`, `finance.repo`) et n'ajoute que les
// lectures strictes qu'aucun écran ne proposait (créances par débiteur,
// mouvements par produit, cadence de vente 30 jours).
//
// RÈGLES :
// - E-35 / ADR-169 : tout découpage de journée passe par `business-day.ts`
//   (Africa/Algiers, UTC+1 fixe). Les instants restent ISO UTC dans la liasse.
// - Argent = centimes entiers DZD : chaque `*Minor` rendu est un entier sûr
//   (`formatMinor` de l'app propriétaire LEVE sinon).
// - Jamais de donnée inventée : un champ sans source en base est `null` là où
//   le contrat l'autorise, sinon une dérivation DOCUMENTÉE ci-dessous.
// - Bornes strictes (egress + JSONB) : constantes `MAX_*` + garde de taille.
//
// Contrat `OwnerSnapshot` v1 : JUMEAU de `owner/src/store.ts:269-289` (le
// workspace `owner/` n'est pas importable depuis `electron/` — frontière
// rootDir, AGENTS.md règle 5). La parité de forme est prouvée par
// `tests/integration/owner-snapshot.test.ts` (garde de lecture de l'app).

import { getDb } from "../database/sqlite.service";
import {
  businessDayOf,
  businessDayRangeUtc,
  businessMonthStart,
  addCalendarDays,
  calendarDaySql,
  previousBusinessDay,
} from "../shared/business-day";
import { getDashboardSummary } from "../ipc/handlers/dashboard.repo";
import { listClosings } from "../ipc/handlers/finance.repo";
import {
  getCashAuditSummary,
  getActiveCashSession,
  type CashSessionRow,
} from "../ipc/handlers/cash-session.repo";

// ---------------------------------------------------------------------------
// Contrat (jumeau `owner/src/store.ts`)
// ---------------------------------------------------------------------------

export type SaleKind = "sale" | "return" | "payment" | "expense";
export type MethodKey = "cash" | "card" | "credit";
export type MovementKind = "vente" | "retour" | "inventaire" | "reception";

export interface TransactionLine {
  name: string;
  qty: number;
  unitMinor: number;
  totalMinor: number;
}

export interface SaleDetail {
  kind: "sale";
  invoiceNumber: string;
  lines: TransactionLine[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  payment: { label: string; receivedMinor: number; changeMinor: number; creditMinor: number };
  cashier: string;
  session: string;
}

export interface ReturnDetail {
  kind: "return";
  originInvoice: string;
  lines: TransactionLine[];
  reason: string;
  refund: { label: string; amountMinor: number; toDebtMinor: number };
  totalMinor: number;
  operator: string;
}

export interface PaymentDetail {
  kind: "payment";
  label: string;
  method: string;
  reference: string;
  amountMinor: number;
  operator: string;
  note: string | null;
}

export interface ExpenseDetail {
  kind: "expense";
  category: string;
  payee: string;
  method: string;
  reference: string;
  amountMinor: number;
  operator: string;
  note: string | null;
}

export type TransactionDetail = SaleDetail | ReturnDetail | PaymentDetail | ExpenseDetail;

export interface JournalRow {
  id: string;
  at: string;
  kind: SaleKind;
  ref: string;
  detail: string;
  amountMinor: number;
  tx: TransactionDetail;
}

export interface MethodTotal {
  method: MethodKey;
  label: string;
  count: number;
  totalMinor: number;
  sharePercent: number;
}

export interface DayBlock {
  date: string;
  salesMinor: number;
  salesCount: number;
  returnsMinor: number;
  returnsCount: number;
  profitMinor: number;
  cashMinor: number;
  basketMinor: number;
  ticketsDelta: number | null;
  objectiveMinor: null;
  comparison: { previousLabel: string; deltaPercent: number };
  methods: MethodTotal[];
  journal: JournalRow[];
}

export interface CashSessionView {
  id: string;
  label: string;
  operator: string;
  post: string;
  openedAt: string;
  closedAt: string | null;
  expectedMinor: number | null;
  countedMinor: number | null;
  varianceMinor: number | null;
  status: "open" | "closed";
  note: string | null;
}

export interface ExpenseRow {
  id: string;
  at: string;
  category: string;
  label: string;
  amountMinor: number;
}

export interface ExpenseBlock {
  monthLabel: string;
  totalMinor: number;
  count: number;
  rows: ExpenseRow[];
}

export interface DebtInvoice {
  ref: string;
  issuedAt: string;
  dueAt: string;
  totalMinor: number;
  depositMinor: number;
  remainingMinor: number;
  lateDays: number;
}

export interface Debtor {
  id: string;
  code: string;
  name: string;
  segment: string;
  manager: null;
  phone: string;
  totalMinor: number;
  overdueMinor: number;
  limitMinor: number | null;
  lastPaymentMinor: number | null;
  lastPaymentAt: string | null;
  lastPaymentNote: string | null;
  lateDays: number;
  aging: { d0to30Minor: number; d31to60Minor: number; d60plusMinor: number };
  invoices: DebtInvoice[];
}

export interface DebtBlock {
  totalMinor: number;
  overdueMinor: number;
  count: number;
  rows: Debtor[];
}

export interface StockMovement {
  id: string;
  at: string;
  kind: MovementKind;
  ref: string;
  note: string | null;
  badge: string | null;
  qty: number;
  balance: number;
}

export interface Product {
  id: string;
  ref: string;
  ean: string | null;
  name: string;
  subtitle: string;
  unit: { singular: string; plural: string };
  quantity: number;
  minLevel: number;
  valueMinor: number;
  purchaseUnitMinor: number;
  saleUnitMinor: number;
  marginUnitMinor: number;
  marginPercent: number;
  sold30: number;
  perDay: number;
  autonomyDays: number;
  suggestedRestock: number;
  lastInventoryAt: string | null;
  movements: StockMovement[];
}

export interface StockBlock {
  valueMinor: number;
  references: number;
  lowCount: number;
  outCount: number;
  deadCount: number;
  lastInventoryAt: string | null;
  products: Product[];
}

export interface CategoryMargin {
  name: string;
  salesMinor: number;
  profitMinor: number;
  sharePercent: number;
  marginPercent: number;
}

export interface TopProduct {
  name: string;
  qty: number;
  totalMinor: number;
}

export interface PeriodBlock {
  range: 30;
  totalMinor: number;
  tickets: number;
  basketMinor: number;
  marginTotalMinor: number;
  marginPercent: number;
  days: { date: string; totalMinor: number }[];
  categories: CategoryMargin[];
  top: TopProduct[];
}

export interface StockAlert {
  id: string;
  productId: string;
  name: string;
  ref: string;
  severity: "critical" | "watch";
  headline: string;
  detail: string;
  lossPerDayMinor: number | null;
}

export interface DebtAlert {
  debtorId: string;
  name: string;
  ref: string;
  lateDays: number;
  remainingMinor: number;
}

export interface SystemCheck {
  id: string;
  label: string;
  detail: string;
  at: string | null;
  state: "ok" | "watch" | "critical";
}

export interface AlertsBlock {
  critical: number;
  watch: number;
  ok: number;
  anomaliesTitle: string;
  anomaliesDetail: string;
  stock: StockAlert[];
  debts: DebtAlert[];
  system: SystemCheck[];
}

export interface OwnerSnapshot {
  version: 1;
  shopName: string;
  generatedAt: string;
  day: DayBlock;
  money: {
    audit: {
      fundsMinor: number;
      varianceNetMinor: number;
      conformityPercent: number;
      activeRegisters: number;
    };
    activeSession: CashSessionView | null;
    sessions: CashSessionView[];
    expenses: ExpenseBlock;
    debts: DebtBlock;
  };
  stock: StockBlock;
  periods: PeriodBlock;
  alerts: AlertsBlock;
}

// ---------------------------------------------------------------------------
// Bornes (egress + JSONB) — constantes uniques, testées.
// ---------------------------------------------------------------------------

const MAX_STOCK_PRODUCTS = 120;
const MAX_MOVEMENTS_PER_PRODUCT = 8;
const MAX_JOURNAL_ROWS = 60;
const MAX_TX_LINES = 20;
const MAX_DEBTORS = 60;
const MAX_INVOICES_PER_DEBTOR = 10;
const MAX_CLOSED_SESSIONS = 60;
const MAX_EXPENSE_ROWS = 60;
const MAX_STOCK_ALERTS = 40;
const MAX_DEBT_ALERTS = 20;
/** Fenêtre du journal : 24 h glissantes (l'app affiche « aujourd'hui » en flux). */
const JOURNAL_WINDOW_MS = 24 * 3_600_000;
/** Cadence de vente mesurée sur 30 journées métier (contrat `sold30`). */
const SALES_WINDOW_DAYS = 30;
/** Stock mort : aucune vente nette sur 60 journées métier. */
const DEAD_STOCK_DAYS = 60;
/** Horizon de réappro proposé : couverture du seuil + 7 jours de vente. */
const RESTOCK_HORIZON_DAYS = 7;
/**
 * Sentinelle d'autonomie : produit sans vente → jamais `Infinity` (JSON
 * invalide dans un colonne JSONB). 9999 jours ≈ « non rotatif ».
 */
const NO_SALES_AUTONOMY_DAYS = 9999;
/** Garde de taille : au-delà, on refuse la publication plutôt que d'exploser. */
export const MAX_LIASSE_CHARS = 900_000;
/** Session de caisse : fenêtre d'audit = 30 journées métier. */
const AUDIT_WINDOW_DAYS = 30;

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/**
 * Libellés FR d'unité — JUMEAU de `src/domain/units/units.ts` (`UNIT_LABELS`,
 * frontière rootDir règle 5). La parité est assertée dans
 * `tests/integration/owner-snapshot.test.ts` : toute dérive casse le test.
 */
const UNIT_LABELS_FR: Record<string, string> = {
  PIECE: "Pièce",
  KG: "Kilogramme",
  G: "Gramme",
  L: "Litre",
  ML: "Millilitre",
  CL: "Centilitre",
  M: "Mètre",
  CARTON: "Carton",
  PAQUET: "Paquet",
  AUTRE: "Autre",
};

/** Singulier/pluriel FR (accord simple : jamais de pluriel irrégulier inventé). */
function unitLabels(code: string): { singular: string; plural: string } {
  const fallback = code.trim();
  const singular = UNIT_LABELS_FR[fallback.toUpperCase()] ?? (fallback === "" ? "Unité" : fallback);
  const last = singular.slice(-1).toLowerCase();
  const plural = ["s", "x", "z"].includes(last) ? singular : `${singular}s`;
  return { singular, plural };
}

/** Mode de paiement FR (miroir de l'UI POS : `cash`/`cheque`/`transfer`). */
function methodLabelFr(method: string): string {
  if (method === "cash") return "Espèces";
  if (method === "cheque") return "Chèque";
  if (method === "transfer") return "Virement";
  if (method === "none") return "Avoir client";
  return method === "" ? "—" : method;
}

/**
 * `movement_type` → grain de la liasse (contrat à 4 kinds uniquement).
 * Règle documentée : la régularisation (ajustement, casse, inventaire) rejoint
 * `inventaire`, l'annulation de vente est un retour physique en rayon.
 */
function movementKindFr(movementType: string): MovementKind {
  if (movementType === "sale_out") return "vente";
  if (movementType === "return_in" || movementType === "sale_cancel_in") return "retour";
  if (movementType === "intake_in") return "reception";
  return "inventaire";
}

const MOVEMENT_BADGE_FR: Record<MovementKind, string | null> = {
  vente: "Sortie",
  retour: "Retour",
  reception: "Réception",
  inventaire: "Régularisation",
};
/** Repère d'un mouvement sans `reference` : le mot-doc français (jamais vide). */
const MOVEMENT_REF_FR: Record<MovementKind, string> = {
  vente: "Vente",
  retour: "Retour",
  reception: "Réception",
  inventaire: "Inventaire",
};

// ---------------------------------------------------------------------------
// Lecteurs défensifs (le pont `Record<string, unknown>` des repos de lecture).
// ---------------------------------------------------------------------------

function obj(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(obj) : [];
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Centime : entier SÛR (l'app propriétaire lève sur un flottant). */
function minor(value: unknown): number {
  const n = num(value);
  return Number.isSafeInteger(n) ? n : Math.round(n);
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return "";
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

function businessMonthLabelFr(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  const index = Number(m[2]) - 1;
  const name = MONTHS_FR[index] ?? monthKey;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${m[1]}`;
}

/**
 * Jours dépassés d'une échéance (`AAAA-MM-JJ`) vs le jour métier courant.
 * 0 si l'échéance est absente ou non dépassée — jamais de négatif.
 */
function daysLate(dueDate: string, today: string): number {
  const due = dueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 0;
  const dueMs = Date.parse(`${due}T00:00:00.000Z`);
  const todayMs = Date.parse(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(dueMs) || !Number.isFinite(todayMs)) return 0;
  return Math.max(0, Math.round((todayMs - dueMs) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Sources communes
// ---------------------------------------------------------------------------

/** Fenêtre d'INSTANTS couvrant `fromDay`..`toDay` de JOURS MÉTIER inclus (E-35). */
function businessWindowUtc(
  fromDay: string,
  toDay: string,
): {
  from: string;
  toExclusive: string;
} {
  return {
    from: businessDayRangeUtc(fromDay).from,
    toExclusive: businessDayRangeUtc(toDay).toExclusive,
  };
}

interface StaffRow {
  id: number;
  display_name: string;
}

/** Noms d'opérateurs (une seule lecture, ~peu de lignes) — jamais d'id brut. */
function staffNames(): Map<number, string> {
  const rows = getDb().prepare(`SELECT id, display_name FROM staff_users`).all() as StaffRow[];
  return new Map(rows.map((r) => [Number(r.id), r.display_name]));
}

function actorName(names: Map<number, string>, id: unknown): string {
  if (id == null) return "—";
  return names.get(Number(id)) ?? "—";
}

/** Nom commercial du magasin (même règle que le cliché APK, ADR-068). */
function shopNameOf(): string {
  const row = getDb()
    .prepare(`SELECT commercial_name, company_name FROM company_profile WHERE id = 1`)
    .get() as { commercial_name: string | null; company_name: string } | undefined;
  if (!row) return "Veloria";
  return text(row.commercial_name) || text(row.company_name) || "Veloria";
}

// ---------------------------------------------------------------------------
// Bloc `day` (tableau de bord de la journée métier + journal 24 h)
// ---------------------------------------------------------------------------

/** Bucket unique (React s'appuie sur `method` comme clé) → 3 modes maximum. */
const METHOD_BUCKETS: Record<string, MethodKey> = {
  cash: "cash",
  cheque: "card",
  transfer: "card",
  none: "credit",
};
const METHOD_BUCKET_LABEL: Record<MethodKey, string> = {
  cash: "Espèces",
  card: "Chèque / virement",
  credit: "Avoir client",
};

function methodsOf(raw: Record<string, unknown>[]): MethodTotal[] {
  const acc = new Map<MethodKey, { count: number; total: number }>();
  for (const row of raw) {
    const method = text(row["method"]);
    const key = METHOD_BUCKETS[method] ?? "credit";
    const cur = acc.get(key) ?? { count: 0, total: 0 };
    cur.count += num(row["n"]);
    cur.total += num(row["t"]);
    acc.set(key, cur);
  }
  const absSum = [...acc.values()].reduce((s, v) => s + Math.abs(v.total), 0);
  const out: MethodTotal[] = [];
  for (const [method, v] of acc) {
    if (v.count <= 0) continue;
    out.push({
      method,
      label: METHOD_BUCKET_LABEL[method],
      count: Math.round(v.count),
      totalMinor: minor(v.total),
      sharePercent: absSum === 0 ? 0 : Math.round((Math.abs(v.total) * 1000) / absSum) / 10,
    });
  }
  return out.sort((a, b) => b.totalMinor - a.totalMinor);
}

// ---------------------------------------------------------------------------
// Journal (dernières 24 h, détails complets)
// ---------------------------------------------------------------------------

interface JournalHead {
  kind: SaleKind;
  id: number;
  at: string;
  ref: string;
  detail: string;
  amountMinor: number;
  /** Porteur pour le détail (vente/retour/encaissement/dépense). */
  payload: Record<string, unknown>;
}

function journalSales(from: string, to: string): JournalHead[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.created_at, s.invoice_number, s.subtotal_minor, s.discount_amount_minor,
         s.total_minor, s.amount_paid_minor, s.credit_applied_minor, s.payment_method,
         s.staff_user_id, COALESCE(c.search_name, 'Passage') AS party,
         (SELECT x.label FROM cash_sessions x
           WHERE x.opened_at <= s.created_at
             AND (x.closed_at IS NULL OR x.closed_at > s.created_at)
           ORDER BY x.opened_at DESC, x.id DESC LIMIT 1) AS session_label
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.is_cancelled = 0 AND s.created_at >= ? AND s.created_at <= ?
       ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    )
    .all(from, to, MAX_JOURNAL_ROWS) as Record<string, unknown>[];
  return rows.map((r) => ({
    kind: "sale",
    id: Number(r["id"]),
    at: text(r["created_at"]),
    ref: text(r["invoice_number"]),
    detail: `Vente ${text(r["party"])}`,
    amountMinor: minor(r["total_minor"]),
    payload: r,
  }));
}

function journalReturns(from: string, to: string): JournalHead[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.created_at, r.return_number, r.original_invoice_number, r.reason,
         r.total_return_value_minor, r.amount_refunded_minor, r.credit_to_customer_minor,
         r.refund_method, r.staff_user_id
       FROM returns r
       WHERE r.status != 'cancelled' AND r.created_at >= ? AND r.created_at <= ?
       ORDER BY r.created_at DESC, r.id DESC LIMIT ?`,
    )
    .all(from, to, MAX_JOURNAL_ROWS) as Record<string, unknown>[];
  return rows.map((r) => ({
    kind: "return",
    id: Number(r["id"]),
    at: text(r["created_at"]),
    ref: text(r["return_number"]),
    detail: `Retour ${text(r["original_invoice_number"])}`,
    amountMinor: -minor(r["total_return_value_minor"]),
    payload: r,
  }));
}

function journalPayments(from: string, to: string): JournalHead[] {
  const rows = getDb()
    .prepare(
      `SELECT sp.id, sp.created_at, sp.amount_minor, sp.method, sp.reference, sp.notes,
         sp.staff_user_id, COALESCE(s.invoice_number, 'Encaissement') AS ref,
         COALESCE(c.search_name, 'Client') AS party
       FROM sale_payments sp
       LEFT JOIN sales s ON s.id = sp.sale_id
       LEFT JOIN customers c ON c.id = COALESCE(sp.customer_id, s.customer_id)
       WHERE (sp.sale_id IS NULL OR COALESCE(s.is_cancelled, 0) = 0)
         AND sp.created_at >= ? AND sp.created_at <= ?
       ORDER BY sp.created_at DESC, sp.id DESC LIMIT ?`,
    )
    .all(from, to, MAX_JOURNAL_ROWS) as Record<string, unknown>[];
  return rows.map((r) => ({
    kind: "payment",
    id: Number(r["id"]),
    at: text(r["created_at"]),
    ref: text(r["ref"]),
    detail: `Encaissement ${text(r["party"])}`,
    amountMinor: minor(r["amount_minor"]),
    payload: r,
  }));
}

function journalExpenses(from: string, to: string): JournalHead[] {
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.created_at, e.category, e.description, e.amount_minor,
         e.payment_method, e.reference, e.notes, e.staff_user_id, e.supplier_id,
         COALESCE(s.name, '—') AS payee
       FROM expenses e LEFT JOIN suppliers s ON s.id = e.supplier_id
       WHERE e.created_at >= ? AND e.created_at <= ?
       ORDER BY e.created_at DESC, e.id DESC LIMIT ?`,
    )
    .all(from, to, MAX_JOURNAL_ROWS) as Record<string, unknown>[];
  return rows.map((r) => ({
    kind: "expense",
    id: Number(r["id"]),
    at: text(r["created_at"]),
    ref: text(r["reference"]) || `DEP-${String(r["id"]).padStart(5, "0")}`,
    detail: `Dépense ${text(r["category"])}`,
    amountMinor: -minor(r["amount_minor"]),
    payload: r,
  }));
}

interface LineRow {
  parentId: number;
  name: string;
  qty: number;
  unitMinor: number;
  totalMinor: number;
}

/** Lignes de vente / de retour (deux requêtes groupées, jamais une par ligne). */
function linesByParent(kind: "sale" | "return", ids: number[]): Map<number, LineRow[]> {
  const out = new Map<number, LineRow[]>();
  if (ids.length === 0) return out;
  const sql =
    kind === "sale"
      ? `SELECT sale_id AS parent_id, product_name_snapshot AS name,
               quantity * unit_factor AS qty, unit_price_minor, line_total_minor
        FROM sale_items WHERE sale_id IN (${placeholders(ids.length)}) ORDER BY sale_id, id ASC`
      : `SELECT return_id AS parent_id, product_name_snapshot AS name,
               quantity * unit_factor AS qty, unit_price_minor, line_total_minor
        FROM return_items WHERE return_id IN (${placeholders(ids.length)}) ORDER BY return_id, id ASC`;
  const rows = getDb()
    .prepare(sql)
    .all(...ids) as Record<string, unknown>[];
  for (const r of rows) {
    const parentId = Number(r["parent_id"]);
    const cur = out.get(parentId) ?? [];
    if (cur.length < MAX_TX_LINES) {
      cur.push({
        parentId,
        name: text(r["name"]),
        qty: num(r["qty"]),
        unitMinor: minor(r["unit_price_minor"]),
        totalMinor: minor(r["line_total_minor"]),
      });
    }
    out.set(parentId, cur);
  }
  return out;
}

function toTxLines(rows: LineRow[] | undefined): TransactionLine[] {
  return (rows ?? []).map((r) => ({
    name: r.name,
    qty: r.qty,
    unitMinor: r.unitMinor,
    totalMinor: r.totalMinor,
  }));
}

function buildJournal(now: string, names: Map<number, string>): JournalRow[] {
  const endMs = Date.parse(now);
  if (!Number.isFinite(endMs)) throw new Error("Horodatage de liasse invalide.");
  const from = new Date(endMs - JOURNAL_WINDOW_MS).toISOString();
  const heads = [
    ...journalSales(from, now),
    ...journalReturns(from, now),
    ...journalPayments(from, now),
    ...journalExpenses(from, now),
  ]
    .sort((a, b) => (a.at === b.at ? b.id - a.id : a.at < b.at ? 1 : -1))
    .slice(0, MAX_JOURNAL_ROWS);

  const saleIds = heads.filter((h) => h.kind === "sale").map((h) => h.id);
  const returnIds = heads.filter((h) => h.kind === "return").map((h) => h.id);
  const saleLines = linesByParent("sale", saleIds);
  const returnLines = linesByParent("return", returnIds);

  return heads.map((h) => {
    const p = h.payload;
    let tx: TransactionDetail;
    if (h.kind === "sale") {
      const method = text(p["payment_method"]);
      tx = {
        kind: "sale",
        invoiceNumber: h.ref,
        lines: toTxLines(saleLines.get(h.id)),
        subtotalMinor: minor(p["subtotal_minor"]),
        discountMinor: minor(p["discount_amount_minor"]),
        totalMinor: minor(p["total_minor"]),
        // `changeMinor` : la monnaie rendue n'est JAMAIS stockée (seul
        // `amount_paid_minor` = encaissé net l'est) → 0, jamais deviné.
        payment: {
          label: methodLabelFr(method),
          receivedMinor: minor(p["amount_paid_minor"]),
          changeMinor: 0,
          creditMinor: minor(p["credit_applied_minor"]),
        },
        cashier: actorName(names, p["staff_user_id"]),
        session: text(p["session_label"]) || "—",
      };
    } else if (h.kind === "return") {
      tx = {
        kind: "return",
        originInvoice: text(p["original_invoice_number"]),
        lines: toTxLines(returnLines.get(h.id)),
        reason: text(p["reason"]) || "—",
        refund: {
          // CHECK 0010 : `refund_method` est NULL quand rien n'a été rendu —
          // libellé explicite, jamais un « — » muet.
          label:
            p["refund_method"] == null
              ? "Aucun remboursement"
              : methodLabelFr(text(p["refund_method"])),
          amountMinor: minor(p["amount_refunded_minor"]),
          toDebtMinor: minor(p["credit_to_customer_minor"]),
        },
        totalMinor: minor(p["total_return_value_minor"]),
        operator: actorName(names, p["staff_user_id"]),
      };
    } else if (h.kind === "payment") {
      tx = {
        kind: "payment",
        label: text(p["party"]),
        method: methodLabelFr(text(p["method"])),
        reference: text(p["reference"]) || "—",
        amountMinor: minor(p["amount_minor"]),
        operator: actorName(names, p["staff_user_id"]),
        note: p["notes"] == null ? null : text(p["notes"]),
      };
    } else {
      tx = {
        kind: "expense",
        category: text(p["category"]),
        payee: text(p["payee"]),
        method: methodLabelFr(text(p["payment_method"])),
        reference: h.ref,
        amountMinor: minor(p["amount_minor"]),
        operator: actorName(names, p["staff_user_id"]),
        note: p["notes"] == null ? null : text(p["notes"]),
      };
    }
    return {
      id: `${h.kind}-${h.id}`,
      at: h.at,
      kind: h.kind,
      ref: h.ref,
      detail: h.detail,
      amountMinor: h.amountMinor,
      tx,
    };
  });
}

// ---------------------------------------------------------------------------
// Bloc `stock` (produits les plus critiques d'abord, mouvements bornés)
// ---------------------------------------------------------------------------

interface ProductRow {
  id: number;
  name: string;
  unit_code: string;
  quantity: number;
  min_stock_level: number;
  purchase_price_minor: number;
  selling_price_minor: number;
  category_name: string | null;
  ean: string | null;
  value_minor: number;
  last_inventory_at: string | null;
}

const PRODUCT_CANDIDATES_SQL = `SELECT p.id, p.name, p.unit_code, p.quantity, p.min_stock_level,
    p.purchase_price_minor, p.selling_price_minor, c.name AS category_name,
    (SELECT b.barcode FROM product_barcodes b
      WHERE b.product_id = p.id ORDER BY b.is_primary DESC, b.id ASC LIMIT 1) AS ean,
    (SELECT COALESCE(SUM(l.remaining_quantity * l.unit_cost_minor), 0)
      FROM inventory_layers l WHERE l.product_id = p.id) AS value_minor,
    (SELECT MAX(m.created_at) FROM stock_movements m
      WHERE m.product_id = p.id
        AND m.movement_type IN ('adjust_in','adjust_out')
        AND m.related_entity_type = 'inventory') AS last_inventory_at
  FROM products p LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.is_active = 1
  ORDER BY CASE
      WHEN p.quantity <= 0 THEN 0
      WHEN p.quantity <= p.min_stock_level THEN 1
      ELSE 2
    END ASC, value_minor DESC, p.name COLLATE NOCASE ASC, p.id ASC
  LIMIT ${MAX_STOCK_PRODUCTS}`;

/**
 * Quantité nette vendue sur une fenêtre de journées métier (les retours
 * déduisent — même arithmétique que `fastMoving` du tableau de bord).
 */
function netSoldByProduct(from: string, toExclusive: string, ids: number[]): Map<number, number> {
  if (ids.length === 0) return new Map();
  const inList = placeholders(ids.length);
  const rows = getDb()
    .prepare(
      `SELECT product_id, SUM(qty) AS qty FROM (
         SELECT li.product_id AS product_id, li.quantity * li.unit_factor AS qty
         FROM sale_items li JOIN sales s ON s.id = li.sale_id
         WHERE s.is_cancelled = 0 AND li.product_id IN (${inList})
           AND s.created_at >= ? AND s.created_at < ?
         UNION ALL
         SELECT ri.product_id AS product_id, -(ri.quantity * ri.unit_factor) AS qty
         FROM return_items ri JOIN returns r ON r.id = ri.return_id
         WHERE r.status != 'cancelled' AND ri.product_id IN (${inList})
           AND r.created_at >= ? AND r.created_at < ?
       )
       WHERE product_id IS NOT NULL
       GROUP BY product_id`,
    )
    .all(...ids, from, toExclusive, ...ids, from, toExclusive) as Record<string, unknown>[];
  return new Map(rows.map((r) => [Number(r["product_id"]), num(r["qty"])]));
}

/** Références sans aucune vente nette depuis `DEAD_STOCK_DAYS` journées. */
function deadCount(today: string): number {
  const range = businessWindowUtc(addCalendarDays(today, -(DEAD_STOCK_DAYS - 1)), today);
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM products p
       WHERE p.is_active = 1 AND p.quantity > 0
         AND p.id NOT IN (
           SELECT x.product_id FROM (
             SELECT li.product_id AS product_id, li.quantity * li.unit_factor AS qty
             FROM sale_items li JOIN sales s ON s.id = li.sale_id
             WHERE s.is_cancelled = 0 AND li.product_id IS NOT NULL
               AND s.created_at >= ? AND s.created_at < ?
             UNION ALL
             SELECT ri.product_id AS product_id, -(ri.quantity * ri.unit_factor) AS qty
             FROM return_items ri JOIN returns r ON r.id = ri.return_id
             WHERE r.status != 'cancelled' AND ri.product_id IS NOT NULL
               AND r.created_at >= ? AND r.created_at < ?
           ) x
           GROUP BY x.product_id HAVING SUM(x.qty) > 0
         )`,
    )
    .get(range.from, range.toExclusive, range.from, range.toExclusive) as {
    c: number;
  };
  return Number(row.c);
}

interface MovementRow {
  id: number;
  product_id: number;
  created_at: string;
  movement_type: string;
  related_entity_type: string | null;
  reference: string | null;
  notes: string | null;
  reason: string | null;
  quantity_delta: number;
  quantity_after: number;
}

/** ≤ `MAX_MOVEMENTS_PER_PRODUCT` mouvements par produit (fenêtre ROW_NUMBER). */
function movementsByProduct(ids: number[]): Map<number, StockMovement[]> {
  const out = new Map<number, StockMovement[]>();
  if (ids.length === 0) return out;
  const rows = getDb()
    .prepare(
      `SELECT id, product_id, created_at, movement_type, related_entity_type, reference,
         notes, reason, quantity_delta, quantity_after
       FROM (
         SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.product_id ORDER BY m.id DESC) AS rn
         FROM stock_movements m WHERE m.product_id IN (${placeholders(ids.length)})
       )
       WHERE rn <= ?
       ORDER BY product_id ASC, id DESC`,
    )
    .all(...ids, MAX_MOVEMENTS_PER_PRODUCT) as unknown as MovementRow[];
  for (const r of rows) {
    const productId = Number(r.product_id);
    const cur = out.get(productId) ?? [];
    const kind = movementKindFr(r.movement_type);
    cur.push({
      id: String(r.id),
      at: r.created_at,
      kind,
      ref: r.reference ?? MOVEMENT_REF_FR[kind],
      note: r.notes ?? r.reason ?? null,
      badge: MOVEMENT_BADGE_FR[kind],
      qty: num(r.quantity_delta),
      balance: num(r.quantity_after),
    });
    out.set(productId, cur);
  }
  return out;
}

function lastGlobalInventoryAt(): string | null {
  const row = getDb()
    .prepare(
      `SELECT MAX(created_at) AS at FROM stock_movements
       WHERE movement_type IN ('adjust_in','adjust_out') AND related_entity_type = 'inventory'`,
    )
    .get() as { at: string | null };
  return row.at ?? null;
}

/**
 * Autonomie / réappro proposés. `perDay` = cadence réelle mesurée ; à 0 on
 * rend la sentinelle `NO_SALES_AUTONOMY_DAYS` (jamais `Infinity`, JSONB exige
 * du JSON strict) et un réappro limité au seul seuil minimum.
 */
function autonomy(product: { quantity: number; perDay: number; minLevel: number }): {
  autonomyDays: number;
  suggestedRestock: number;
} {
  const cover = product.minLevel + product.perDay * RESTOCK_HORIZON_DAYS;
  const suggested = Math.max(0, Math.ceil(cover - product.quantity));
  if (product.perDay <= 0) {
    return { autonomyDays: NO_SALES_AUTONOMY_DAYS, suggestedRestock: suggested };
  }
  const days = Math.round(product.quantity / product.perDay);
  return { autonomyDays: Math.min(days, NO_SALES_AUTONOMY_DAYS), suggestedRestock: suggested };
}

function buildStock(
  today: string,
  dayRaw: Record<string, unknown>,
): { block: StockBlock; products: Product[] } {
  const db = getDb();
  const candidates = db.prepare(PRODUCT_CANDIDATES_SQL).all() as unknown as ProductRow[];
  const ids = candidates.map((p) => Number(p.id));
  const window = businessWindowUtc(addCalendarDays(today, -(SALES_WINDOW_DAYS - 1)), today);
  const sold = netSoldByProduct(window.from, window.toExclusive, ids);
  const movements = movementsByProduct(ids);
  const products: Product[] = candidates.map((p) => {
    const quantity = num(p.quantity);
    const minLevel = num(p.min_stock_level);
    const sold30 = num(sold.get(Number(p.id)) ?? 0);
    const perDay = Math.round((sold30 / SALES_WINDOW_DAYS) * 100) / 100;
    const purchaseUnitMinor = minor(p.purchase_price_minor);
    const saleUnitMinor = minor(p.selling_price_minor);
    const marginUnitMinor = saleUnitMinor - purchaseUnitMinor;
    const { autonomyDays, suggestedRestock } = autonomy({ quantity, perDay, minLevel });
    return {
      id: String(p.id),
      // Aucune colonne « référence magasin » n'existe : la référence publiée
      // est l'identifiant SQLite (stable, unique, non inventé).
      ref: String(p.id),
      ean: p.ean == null ? null : text(p.ean),
      name: text(p.name),
      subtitle: text(p.category_name) || "Sans catégorie",
      unit: unitLabels(text(p.unit_code)),
      quantity,
      minLevel,
      valueMinor: minor(p.value_minor),
      purchaseUnitMinor,
      saleUnitMinor,
      marginUnitMinor,
      marginPercent:
        purchaseUnitMinor > 0 ? Math.round((marginUnitMinor / purchaseUnitMinor) * 1000) / 10 : 0,
      sold30,
      perDay,
      autonomyDays,
      suggestedRestock,
      lastInventoryAt: p.last_inventory_at ?? null,
      movements: movements.get(Number(p.id)) ?? [],
    };
  });
  const block: StockBlock = {
    // `stockValueMinor` du tableau de bord = valorisation FIFO des couches
    // restantes (même source que l'écran Stock).
    valueMinor: minor(obj(dayRaw["kpis"])["stockValueMinor"]),
    // Comptes GLOBAUX (tous les produits actifs), jamais ceux du seul lot
    // publié : la selection est bornée à `MAX_STOCK_PRODUCTS`.
    references: Number(
      (
        getDb().prepare(`SELECT COUNT(*) AS c FROM products WHERE is_active = 1`).get() as {
          c: number;
        }
      ).c,
    ),
    lowCount: Number(obj(dayRaw["stock"])["low"]),
    outCount: Number(obj(dayRaw["stock"])["out"]),
    deadCount: deadCount(today),
    lastInventoryAt: lastGlobalInventoryAt(),
    products,
  };
  return { block, products };
}

// ---------------------------------------------------------------------------
// Bloc `money.debts` (créances clients au grain document + débiteur)
// ---------------------------------------------------------------------------

/** Segment FR dérivé de `customers.debt_status` + garde de plafond (0001). */
function segmentOf(debtStatus: string, isOverLimit: number): string {
  if (isOverLimit === 1 || debtStatus === "over_limit") return "Créances > plafond";
  if (debtStatus === "overdue") return "Créances en retard";
  if (debtStatus === "due") return "Crédit simple";
  return "Crédit simple";
}

interface DebtorRow {
  id: number;
  search_name: string;
  phone: string | null;
  credit_limit_minor: number;
  debt_status: string;
  is_over_limit: number;
  total_minor: number;
  overdue_minor: number;
}

function buildDebts(today: string): DebtBlock {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT COUNT(DISTINCT s.customer_id) AS c,
         COALESCE(SUM(s.remaining_balance_minor), 0) AS total,
         COALESCE(SUM(CASE WHEN s.due_date IS NOT NULL AND ${calendarDaySql("s.due_date")} < ?
           THEN s.remaining_balance_minor ELSE 0 END), 0) AS overdue
       FROM sales s
       WHERE s.is_cancelled = 0 AND s.remaining_balance_minor > 0 AND s.customer_id IS NOT NULL`,
    )
    .get(today) as { c: number; total: number; overdue: number };

  const debtors = db
    .prepare(
      `SELECT c.id, c.search_name, c.phone, c.credit_limit_minor, c.debt_status, c.is_over_limit,
         COALESCE(SUM(s.remaining_balance_minor), 0) AS total_minor,
         COALESCE(SUM(CASE WHEN s.due_date IS NOT NULL AND ${calendarDaySql("s.due_date")} < ?
           THEN s.remaining_balance_minor ELSE 0 END), 0) AS overdue_minor
       FROM sales s JOIN customers c ON c.id = s.customer_id
       WHERE s.is_cancelled = 0 AND s.remaining_balance_minor > 0
       GROUP BY c.id ORDER BY total_minor DESC, c.id ASC LIMIT ${MAX_DEBTORS}`,
    )
    .all(today) as unknown as DebtorRow[];
  const ids = debtors.map((d) => Number(d.id));
  if (ids.length === 0) {
    return {
      totalMinor: minor(totals.total),
      overdueMinor: minor(totals.overdue),
      count: Number(totals.c),
      rows: [],
    };
  }

  // Factures impayées (les 10 premières par débiteur, échéance la plus ancienne).
  const invoiceRows = db
    .prepare(
      `SELECT customer_id, id, invoice_number, created_at, due_date, total_minor,
         amount_paid_minor, remaining_balance_minor
       FROM (
         SELECT s.customer_id, s.id, s.invoice_number, s.created_at, s.due_date, s.total_minor,
           s.amount_paid_minor, s.remaining_balance_minor,
           ROW_NUMBER() OVER (PARTITION BY s.customer_id ORDER BY s.due_date IS NULL, s.due_date ASC, s.id ASC) AS rn
         FROM sales s
         WHERE s.is_cancelled = 0 AND s.remaining_balance_minor > 0
           AND s.customer_id IN (${placeholders(ids.length)})
       )
       WHERE rn <= ?
       ORDER BY customer_id ASC, rn ASC`,
    )
    .all(...ids, MAX_INVOICES_PER_DEBTOR) as Record<string, unknown>[];
  const invoices = new Map<number, DebtInvoice[]>();
  for (const r of invoiceRows) {
    const customerId = Number(r["customer_id"]);
    const due = text(r["due_date"]);
    const cur = invoices.get(customerId) ?? [];
    cur.push({
      ref: text(r["invoice_number"]),
      issuedAt: text(r["created_at"]),
      // Une échéance absente reste vide (l'app rend « — ») : jamais de date
      // fabriquée à partir du jour d'émission.
      dueAt: due === "" ? "" : due.slice(0, 10),
      totalMinor: minor(r["total_minor"]),
      depositMinor: minor(r["amount_paid_minor"]),
      remainingMinor: minor(r["remaining_balance_minor"]),
      lateDays: daysLate(due, today),
    });
    invoices.set(customerId, cur);
  }

  // Anciennetage : bucket sur TOUTES les factures (la liste ci-dessus est
  // bornée à 10) → la somme des trois buckets vaut exactement `totalMinor`.
  const agingRows = db
    .prepare(
      `SELECT x.customer_id,
         COALESCE(SUM(CASE WHEN x.late <= 30 THEN x.remaining ELSE 0 END), 0) AS d0to30,
         COALESCE(SUM(CASE WHEN x.late > 30 AND x.late <= 60 THEN x.remaining ELSE 0 END), 0) AS d31to60,
         COALESCE(SUM(CASE WHEN x.late > 60 THEN x.remaining ELSE 0 END), 0) AS d60plus
       FROM (
         SELECT s.customer_id, s.remaining_balance_minor AS remaining,
           CASE WHEN s.due_date IS NULL THEN 0
             ELSE MAX(0, CAST(julianday(?) - julianday(${calendarDaySql("s.due_date")}) AS INTEGER))
           END AS late
         FROM sales s
         WHERE s.is_cancelled = 0 AND s.remaining_balance_minor > 0
           AND s.customer_id IN (${placeholders(ids.length)})
       ) x
       GROUP BY x.customer_id`,
    )
    .all(today, ...ids) as Record<string, unknown>[];
  const aging = new Map(
    agingRows.map((r) => [
      Number(r["customer_id"]),
      {
        d0to30Minor: minor(r["d0to30"]),
        d31to60Minor: minor(r["d31to60"]),
        d60plusMinor: minor(r["d60plus"]),
      },
    ]),
  );

  // Dernier encaissement du client (rattaché à une vente ou autonome).
  const paymentRows = db
    .prepare(
      `SELECT customer_id, amount_minor, created_at, notes FROM (
         SELECT COALESCE(sp.customer_id, s.customer_id) AS customer_id, sp.amount_minor,
           sp.created_at, sp.notes,
           ROW_NUMBER() OVER (PARTITION BY COALESCE(sp.customer_id, s.customer_id)
             ORDER BY sp.created_at DESC, sp.id DESC) AS rn
         FROM sale_payments sp
         LEFT JOIN sales s ON s.id = sp.sale_id
         WHERE COALESCE(sp.customer_id, s.customer_id) IN (${placeholders(ids.length)})
       )
       WHERE rn = 1`,
    )
    .all(...ids) as Record<string, unknown>[];
  const lastPayment = new Map(
    paymentRows.map((r) => [
      Number(r["customer_id"]),
      {
        amountMinor: minor(r["amount_minor"]),
        at: text(r["created_at"]),
        note: r["notes"] == null ? null : text(r["notes"]),
      },
    ]),
  );

  const rows: Debtor[] = debtors.map((d) => {
    const customerId = Number(d.id);
    const invoicesFor = invoices.get(customerId) ?? [];
    const late = invoicesFor.reduce((m, inv) => Math.max(m, inv.lateDays), 0);
    const pay = lastPayment.get(customerId);
    const limit = minor(d.credit_limit_minor);
    return {
      id: String(customerId),
      // Aucune colonne « code client » n'existe : le code publié est
      // l'identifiant SQLite préfixé (stable et unique).
      code: `CLT-${String(customerId).padStart(5, "0")}`,
      name: text(d.search_name),
      segment: segmentOf(text(d.debt_status), Number(d.is_over_limit)),
      manager: null,
      phone: d.phone == null ? "" : text(d.phone),
      totalMinor: minor(d.total_minor),
      overdueMinor: minor(d.overdue_minor),
      // 0 = aucun plafond saisi (colonne NOT NULL DEFAULT 0) → null, pas un
      // « plafond à 0 DZD » mensonger.
      limitMinor: limit > 0 ? limit : null,
      lastPaymentMinor: pay?.amountMinor ?? null,
      lastPaymentAt: pay?.at ?? null,
      lastPaymentNote: pay?.note ?? null,
      lateDays: late,
      aging: aging.get(customerId) ?? { d0to30Minor: 0, d31to60Minor: 0, d60plusMinor: 0 },
      invoices: invoicesFor,
    };
  });

  return {
    totalMinor: minor(totals.total),
    overdueMinor: minor(totals.overdue),
    count: Number(totals.c),
    rows,
  };
}

// ---------------------------------------------------------------------------
// Blocs `money.expenses` / `money.audit`
// ---------------------------------------------------------------------------

function buildExpenses(today: string): ExpenseBlock {
  const db = getDb();
  const monthStart = businessMonthStart(today);
  const agg = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(amount_minor), 0) AS total
       FROM expenses WHERE ${calendarDaySql("expense_date")} >= ? AND ${calendarDaySql("expense_date")} <= ?`,
    )
    .get(monthStart, today) as { c: number; total: number };
  const rows = db
    .prepare(
      `SELECT e.id, e.created_at, e.category, e.description, e.amount_minor
       FROM expenses e
       WHERE ${calendarDaySql("expense_date")} >= ? AND ${calendarDaySql("expense_date")} <= ?
       ORDER BY e.expense_date DESC, e.id DESC LIMIT ${MAX_EXPENSE_ROWS}`,
    )
    .all(monthStart, today) as Record<string, unknown>[];
  return {
    monthLabel: businessMonthLabelFr(monthStart.slice(0, 7)),
    totalMinor: minor(agg.total),
    count: Number(agg.c),
    rows: rows.map((r) => ({
      id: String(r["id"]),
      at: text(r["created_at"]),
      category: text(r["category"]),
      label: text(r["description"]),
      amountMinor: minor(r["amount_minor"]),
    })),
  };
}

function sessionView(row: CashSessionRow, names: Map<number, string>): CashSessionView {
  return {
    id: row.uuid,
    label: row.label,
    operator: row.staffUserId == null ? "—" : (names.get(row.staffUserId) ?? "—"),
    post: row.post,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    expectedMinor: row.expectedMinor,
    countedMinor: row.countedMinor,
    varianceMinor: row.varianceMinor,
    status: row.status,
    note: row.note,
  };
}

interface MoneyAuditSource {
  fundsMinor: number;
  varianceNetMinor: number;
  conformityPercent: number;
  activeRegisters: number;
  sessions: CashSessionView[];
  activeSession: CashSessionView | null;
}

function buildMoneyAudit(today: string, now: string, names: Map<number, string>): MoneyAuditSource {
  const from = addCalendarDays(today, -(AUDIT_WINDOW_DAYS - 1));
  const audit = getCashAuditSummary({ from, to: today, now });
  const closed = audit.sessions.filter((s) => s.status === "closed");
  // `activeSession` : LA session ouverte (canal `cash.current`), même si son
  // ouverture est antérieure à la fenêtre d'audit — le tiroir reste ouvert.
  const active = audit.activeSession ?? getActiveCashSession(now);
  return {
    fundsMinor: minor(audit.fundsMinor),
    varianceNetMinor: minor(audit.varianceNetMinor),
    conformityPercent: num(audit.conformityPercent),
    activeRegisters: Number(audit.activeRegisters),
    sessions: closed.slice(0, MAX_CLOSED_SESSIONS).map((s) => sessionView(s, names)),
    activeSession: active ? sessionView(active, names) : null,
  };
}

// ---------------------------------------------------------------------------
// Bloc `periods` (30 journées métier)
// ---------------------------------------------------------------------------

function buildPeriods(
  raw: Record<string, unknown>,
  periodFrom: string,
  today: string,
): PeriodBlock {
  const k = obj(raw["kpis"]);
  const totalMinor = minor(k["salesMinor"]);
  const tickets = num(k["salesCount"]);
  const marginTotalMinor = minor(k["profitMinor"]);
  const daily = list(raw["daily"]);
  // Jours manquants = 0 : `dashboard.repo` remplit déjà la série, on revérifie
  // la fenêtre complète ici (jamais de trou dans le graphique de l'app).
  const byDay = new Map(daily.map((d) => [text(d["d"]), num(d["t"])]));
  const span = Math.round(
    (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${periodFrom}T00:00:00.000Z`)) / 86_400_000,
  );
  const days: { date: string; totalMinor: number }[] = [];
  for (let i = 0; i <= span; i += 1) {
    const d = addCalendarDays(periodFrom, i);
    days.push({ date: d, totalMinor: minor(byDay.get(d) ?? 0) });
  }
  const categories = list(raw["byCategory"]);
  const catSum = categories.reduce((s, c) => s + Math.abs(num(c["salesMinor"])), 0);
  return {
    range: 30,
    totalMinor,
    tickets: Math.round(tickets),
    basketMinor: tickets > 0 ? Math.round(totalMinor / tickets) : 0,
    marginTotalMinor,
    marginPercent: totalMinor > 0 ? Math.round((marginTotalMinor * 1000) / totalMinor) / 10 : 0,
    days,
    categories: categories.map((c) => {
      const sales = num(c["salesMinor"]);
      const profit = num(c["profitMinor"]);
      return {
        name: text(c["name"]) || "Sans catégorie",
        salesMinor: minor(sales),
        profitMinor: minor(profit),
        sharePercent: catSum === 0 ? 0 : Math.round((Math.abs(sales) * 1000) / catSum) / 10,
        marginPercent: sales > 0 ? Math.round((profit * 1000) / sales) / 10 : 0,
      };
    }),
    top: list(raw["fastMoving"]).map((f) => ({
      name: text(f["name"]),
      qty: num(f["qty"]),
      totalMinor: minor(f["total"]),
    })),
  };
}

// ---------------------------------------------------------------------------
// Bloc `alerts`
// ---------------------------------------------------------------------------

function buildStockAlerts(products: Product[]): StockAlert[] {
  const out: StockAlert[] = [];
  for (const p of products) {
    const critical = p.quantity <= 0;
    const watch = p.quantity > 0 && p.quantity <= p.minLevel;
    if (!critical && !watch) continue;
    out.push({
      id: `stock-${p.id}`,
      productId: p.id,
      name: p.name,
      ref: p.ref,
      severity: critical ? "critical" : "watch",
      headline: critical
        ? `Rupture · ${p.unit.singular.toLowerCase()} épuisée`
        : `Sous le seuil · ${p.quantity} / ${p.minLevel}`,
      detail: critical
        ? p.perDay > 0
          ? `Cadence ${p.perDay} ${p.unit.plural.toLowerCase()}/jour : ${p.suggestedRestock} à commander.`
          : `Aucune vente sur ${SALES_WINDOW_DAYS} jours : réassort au seuil (${p.minLevel}).`
        : `Réappro conseillé : ${p.suggestedRestock} ${p.unit.plural.toLowerCase()} (couverture ${RESTOCK_HORIZON_DAYS} j).`,
      // Coût d'achat × cadence = perte quotidienne estimée ; uniquement sur une
      // rupture (une veilleuse n'est pas encore une perte).
      lossPerDayMinor: critical ? Math.round(p.perDay * p.purchaseUnitMinor) : null,
    });
    if (out.length >= MAX_STOCK_ALERTS) break;
  }
  return out;
}

function buildDebtAlerts(debts: DebtBlock): DebtAlert[] {
  const out: DebtAlert[] = [];
  for (const d of debts.rows) {
    if (d.lateDays <= 0) continue;
    const worst = d.invoices.reduce<DebtInvoice | null>(
      (m, inv) => (m === null || inv.lateDays > m.lateDays ? inv : m),
      null,
    );
    if (!worst) continue;
    out.push({
      debtorId: d.id,
      name: d.name,
      ref: worst.ref,
      lateDays: worst.lateDays,
      remainingMinor: worst.remainingMinor,
    });
    if (out.length >= MAX_DEBT_ALERTS) break;
  }
  return out.sort((a, b) => b.lateDays - a.lateDays);
}

function buildSystemChecks(raw: Record<string, unknown>, today: string): SystemCheck[] {
  const alerts = obj(raw["alerts"]);
  const integrity = text(alerts["integrity"]) || "unknown";
  const integrityAt = alerts["integrityAt"] == null ? null : text(alerts["integrityAt"]);
  const backupRaw = alerts["lastBackup"];
  const backupAt = backupRaw == null ? null : text(backupRaw);
  const closings = list(listClosings(addCalendarDays(today, -(AUDIT_WINDOW_DAYS - 1)), today).rows);
  const lastClosing = closings[0];
  const closingAt = lastClosing == null ? null : text(lastClosing["closed_at"]);
  const closingDate = lastClosing == null ? null : text(lastClosing["business_date"]);

  const backupState: SystemCheck["state"] =
    backupAt == null
      ? "watch"
      : Date.parse(backupAt) < Date.parse(today) - AUDIT_WINDOW_DAYS * 86_400_000
        ? "watch"
        : "ok";

  return [
    {
      id: "system-integrity",
      label: "Intégrité de la base",
      detail:
        integrity === "ok"
          ? "Vérification SQLite : aucune anomalie signalée."
          : integrity === "unknown"
            ? "Aucune vérification enregistrée sur ce poste."
            : `Verdict : ${integrity}.`,
      at: integrityAt === "" ? null : integrityAt,
      // Règle : `ok` = verdict sain, `critical` = verdict connu mauvais,
      // `watch` = jamais vérifié (jamais un « ok » par défaut).
      state: integrity === "ok" ? "ok" : integrity === "unknown" ? "watch" : "critical",
    },
    {
      id: "system-backup",
      label: "Sauvegarde",
      detail:
        backupAt == null
          ? "Aucune sauvegarde trouvée sur ce poste."
          : `Dernière copie du ${businessDayOf(backupAt)}.`,
      at: backupAt,
      state: backupState,
    },
    {
      id: "system-closing",
      label: "Clôture journalière (Z)",
      detail:
        closingDate == null
          ? `Aucune clôture sur les ${AUDIT_WINDOW_DAYS} dernières journées.`
          : `Dernière journée clôturée : ${closingDate}.`,
      at: closingAt === "" ? null : closingAt,
      // Règle : une clôture de moins de 7 journées métier = `ok`, au-delà (ou
      // absente) = `watch` — jamais `critical` (l'absence de Z n'est pas une
      // perte de données, SQLite reste le master).
      state:
        closingDate == null ||
        Date.parse(`${closingDate}T00:00:00.000Z`) <
          Date.parse(`${today}T00:00:00.000Z`) - 7 * 86_400_000
          ? "watch"
          : "ok",
    },
  ];
}

function buildAlerts(
  products: Product[],
  debts: DebtBlock,
  raw: Record<string, unknown>,
  today: string,
): AlertsBlock {
  const stock = buildStockAlerts(products);
  const debtAlerts = buildDebtAlerts(debts);
  const system = buildSystemChecks(raw, today);
  const stockCritical = stock.filter((s) => s.severity === "critical").length;
  const systemCritical = system.filter((s) => s.state === "critical").length;
  const systemWatch = system.filter((s) => s.state === "watch").length;
  const systemOk = system.filter((s) => s.state === "ok").length;
  const critical = stockCritical + systemCritical;
  const watch = stock.length - stockCritical + debtAlerts.length + systemWatch;
  const anomalies = critical + watch;
  return {
    critical,
    watch,
    // Les « conformes » du tableau de bord propriétaire = contrôles système
    // sains (les lignes stock/créances sont par nature des alertes).
    ok: systemOk,
    anomaliesTitle:
      anomalies === 0
        ? "0 anomalie active"
        : `${anomalies} anomalie${anomalies > 1 ? "s" : ""} active${anomalies > 1 ? "s" : ""}`,
    anomaliesDetail:
      anomalies === 0
        ? "Ruptures, créances et contrôles système : rien à signaler."
        : `${stockCritical} rupture${stockCritical > 1 ? "s" : ""}, ${debtAlerts.length} créance${
            debtAlerts.length > 1 ? "s" : ""
          } en retard, ${systemCritical} contrôle système critique.`,
    stock,
    debts: debtAlerts,
    system,
  };
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

/**
 * Construit la liasse `OwnerSnapshot` v1 à l'instant `now` (ISO UTC).
 * Lit SQLite uniquement ; n'écrit rien ; ne fait aucun réseau.
 */
export function buildOwnerSnapshot(now: string): OwnerSnapshot {
  const day = businessDayOf(now);
  if (day === "") throw new Error("Horodatage de liasse invalide.");
  const previousDay = previousBusinessDay(day);
  const periodFrom = addCalendarDays(day, -(SALES_WINDOW_DAYS - 1));
  const names = staffNames();

  const dayRaw = obj(getDashboardSummary(day, day, null));
  const periodRaw = obj(getDashboardSummary(periodFrom, day, null));
  const k = obj(dayRaw["kpis"]);
  const comparison = obj(dayRaw["comparison"]);
  // Le compte de tickets de la veille vient de la série 30 jours (celle du
  // jour unique ne couvre que `day` elle-même).
  const periodDaily = list(periodRaw["daily"]);
  const salesCount = num(k["salesCount"]);
  const salesMinor = minor(k["salesMinor"]);
  const previousTickets = periodDaily.find((d) => text(d["d"]) === previousDay);
  const ticketsToday = Math.round(salesCount);
  const ticketsDelta =
    previousTickets == null ? null : ticketsToday - Math.round(num(previousTickets["n"]));

  const stock = buildStock(day, dayRaw);
  const debts = buildDebts(day);
  const expenses = buildExpenses(day);
  const audit = buildMoneyAudit(day, now, names);
  const journal = buildJournal(now, names);

  const snapshot: OwnerSnapshot = {
    version: 1,
    shopName: shopNameOf(),
    generatedAt: now,
    day: {
      date: day,
      salesMinor,
      salesCount: ticketsToday,
      returnsMinor: minor(k["returnsMinor"]),
      returnsCount: num(k["returnsCount"]),
      profitMinor: minor(k["profitMinor"]),
      cashMinor: minor(k["cashMinor"]),
      basketMinor: salesCount > 0 ? Math.round(salesMinor / salesCount) : 0,
      // Aucun objectif n'est saisi dans le POS : `null` (le contrat l'autorise),
      // jamais un objectif inventé.
      ticketsDelta,
      objectiveMinor: null,
      comparison: {
        previousLabel: "hier",
        deltaPercent: num(comparison["deltaPercent"]),
      },
      methods: methodsOf(list(dayRaw["byMethod"])),
      journal,
    },
    money: {
      audit: {
        fundsMinor: audit.fundsMinor,
        varianceNetMinor: audit.varianceNetMinor,
        conformityPercent: audit.conformityPercent,
        activeRegisters: audit.activeRegisters,
      },
      activeSession: audit.activeSession,
      sessions: audit.sessions,
      expenses,
      debts,
    },
    stock: stock.block,
    periods: buildPeriods(periodRaw, periodFrom, day),
    alerts: buildAlerts(stock.products, debts, dayRaw, day),
  };

  const chars = JSON.stringify(snapshot).length;
  if (chars > MAX_LIASSE_CHARS) {
    throw new Error(
      `Liasse trop volumineuse (${chars} caractères, maximum ${MAX_LIASSE_CHARS}) : réduction impossible côté caisse.`,
    );
  }
  return snapshot;
}
