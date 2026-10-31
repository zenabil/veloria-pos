// Veloria Owner — contrat de la liasse de supervision (lecture seule).
// Le POS calcule tout (centimes DZD) et pousse une liasse agrégée : l'app ne
// fait aucun calcul financier, elle affiche et filtre.

export type SaleKind = "sale" | "return" | "payment" | "expense";

export type MethodKey = "cash" | "card" | "credit";

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
  /** Variation du nombre de tickets vs la veille (nulle si inconnue). */
  ticketsDelta: number | null;
  objectiveMinor: number | null;
  comparison: { previousLabel: string; deltaPercent: number };
  methods: MethodTotal[];
  journal: JournalRow[];
}

export interface CashSession {
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
  manager: string | null;
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

export type MovementKind = "vente" | "retour" | "inventaire" | "reception";

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
  range: 7 | 30;
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
    activeSession: CashSession | null;
    sessions: CashSession[];
    expenses: ExpenseBlock;
    debts: DebtBlock;
  };
  stock: StockBlock;
  periods: PeriodBlock;
  alerts: AlertsBlock;
}

export interface Session {
  email: string;
  accessToken: string | null;
  demo: boolean;
  lastLoginAt: string;
}

export type ProductFilter = "all" | "low" | "out";

/** Liste filtrée + recherche (nom, référence, code-barres) — pure. */
export function filterProducts(
  products: Product[],
  filter: ProductFilter,
  query: string,
): Product[] {
  const q = query.trim().toLowerCase();
  return products.filter((p) => {
    if (filter === "low" && !(p.quantity > 0 && p.quantity <= p.minLevel)) return false;
    if (filter === "out" && p.quantity !== 0) return false;
    if (q === "") return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.ref.toLowerCase().includes(q) ||
      (p.ean ?? "").includes(q)
    );
  });
}

/** Statut d'un produit dérivé des quantités (jamais stocké côté cloud). */
export function productStatus(p: Product): "out" | "low" | "ok" {
  if (p.quantity <= 0) return "out";
  if (p.quantity <= p.minLevel) return "low";
  return "ok";
}

export function findProduct(snapshot: OwnerSnapshot, id: string): Product | null {
  return snapshot.stock.products.find((p) => p.id === id) ?? null;
}

export function findDebtor(snapshot: OwnerSnapshot, id: string): Debtor | null {
  return snapshot.money.debts.rows.find((d) => d.id === id) ?? null;
}

export function findJournalEntry(snapshot: OwnerSnapshot, id: string): JournalRow | null {
  return snapshot.day.journal.find((r) => r.id === id) ?? null;
}

export interface MovementFeedRow {
  product: Product;
  movement: StockMovement;
}

/** Flux global des mouvements (tous produits), du plus récent au plus ancien. */
export function recentMovements(snapshot: OwnerSnapshot, limit = 30): MovementFeedRow[] {
  const rows: MovementFeedRow[] = [];
  for (const product of snapshot.stock.products) {
    for (const movement of product.movements) rows.push({ product, movement });
  }
  rows.sort((a, b) => b.movement.at.localeCompare(a.movement.at));
  return rows.slice(0, limit);
}
