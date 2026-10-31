// Veloria Client (APK) — View-models purs (testés) : miroir JSON → écrans.
// Aucun import RN ici : les écrans ne font qu'afficher ces structures.
import { formatMinor } from "./format.ts";
import { t, type Lang } from "./i18n.ts";

export interface HomeInvoice {
  id: number;
  invoice_number: string;
  total_minor: number;
  amount_paid_minor: number;
  remaining_balance_minor: number;
  payment_status: string;
  is_cancelled: number;
  created_at: string;
}

export interface HomePayment {
  id: number;
  amount_minor: number;
  method: string;
  reference: string | null;
  sale_id: number | null;
  payment_date: string;
}

export interface DetailItem {
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface DetailSale {
  id: number;
  invoice_number: string;
  total_minor: number;
  amount_paid_minor: number;
  remaining_balance_minor: number;
  payment_status: string;
  is_cancelled: number;
  created_at: string;
}

export interface InvoiceDetail {
  sale: DetailSale;
  items: DetailItem[];
}

export interface HomeData {
  debtMinor: number;
  debtStatus: string;
  overLimit: boolean;
  creditLimitMinor: number;
  monthPurchasesMinor: number;
  monthPaymentsMinor: number;
  loyaltyPoints: number;
  /** Nombre total de factures vivantes (cliché `invoiceCount`). */
  invoiceCount: number;
  /** Mois courant « AAAA-MM » du cliché (libellé du récapitulatif). */
  monthKey: string;
  /** Jour d'échéance convenu avec le magasin (0 = aucun). */
  settlementDay: number;
  lastSales: HomeInvoice[];
  lastPayments: HomePayment[];
  topProducts: { name: string; quantity: number; lastPriceMinor: number }[];
  /** Cadence de rafraîchissement auto choisie dans POS (5–1440 min, 15 par défaut). */
  syncIntervalMinutes: number;
  syncedAt: string | null;
  announcement: string | null;
  shop: { name: string; phone: string | null; address: string | null };
}

/**
 * Entier sûr depuis n'importe quelle source (miroir JSON, champ legacy,
 * chaîne). STRICT : un montant non entier (ex. "12.9", 12.5) est CORROMPU —
 * il dégrade en `fallback` (0), jamais tronqué en valeur plausible.
 * Tronquer 12.9 → 12 affichait une dette fausse mais crédible ; dégrader en
 * 0 signale une anomalie au lieu de mentir. `formatMinor` jette sur un
 * montant non sûr, un champ illisible doit dégrader en 0 — jamais planter
 * l'écran entier. Exporté : App.tsx mappe aussi les lignes miroir avec.
 * Les QUANTITÉS décimales (kg, 3 décimales POS) utilisent `numQty` ci-dessous.
 */
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  return Number.isSafeInteger(n) ? n : fallback;
}

/**
 * Quantité POS (NUMERIC, 3 décimales max — miroir de la règle domaine
 * `roundQuantity` + migration initiale 0001).
 * Le POS pousse des quantités décimales (ex. 1.5 kg) vers le miroir ; l'ancien
 * `num()` les tronquait via `Math.trunc` (1.5 → 1, perte sèche + total dérivé
 * faux). Ici : parse fini + bornes + arrondi 3 décimales (même règle que le
 * domaine), sinon `fallback`. Les montants restent sur `num()`.
 */
export const MAX_QTY = 1_000_000;

export function numQty(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0 || n > MAX_QTY) return fallback;
  const r = Math.round(n * 1000) / 1000;
  if (!Number.isFinite(r)) return fallback;
  return r;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Cliché `customer_snapshot` → écran d'accueil (tolérant aux champs absents). */
export function toHome(payload: unknown): HomeData {
  const p = (payload ?? {}) as Record<string, unknown>;
  const customer = (p["customer"] ?? {}) as Record<string, unknown>;
  const sales = (Array.isArray(p["lastSales"]) ? p["lastSales"] : []) as Record<string, unknown>[];
  const payments = (Array.isArray(p["lastPayments"]) ? p["lastPayments"] : []) as Record<
    string,
    unknown
  >[];
  const tops = (Array.isArray(p["topProducts"]) ? p["topProducts"] : []) as Record<
    string,
    unknown
  >[];
  const shopRaw = (p["shop"] ?? {}) as Record<string, unknown>;
  const shopName =
    typeof shopRaw["name"] === "string" && shopRaw["name"] !== "" ? shopRaw["name"] : "Veloria";
  const mapSale = (s: Record<string, unknown>): HomeInvoice => ({
    id: num(s["id"]),
    invoice_number: str(s["invoice_number"]),
    total_minor: num(s["total_minor"]),
    amount_paid_minor: num(s["amount_paid_minor"]),
    remaining_balance_minor: num(s["remaining_balance_minor"]),
    payment_status: str(s["payment_status"]),
    is_cancelled: num(s["is_cancelled"]),
    created_at: str(s["created_at"]),
  });
  // `invoiceCount` absent (ancien cliché) : la prévisualisation (3 max) reste
  // le meilleur minorant lisible — jamais 0 à côté de factures affichées.
  const invoiceCount = num(p["invoiceCount"]);
  const syncInterval = num(p["syncIntervalMinutes"]);
  return {
    debtMinor: num(customer["outstanding_balance_minor"]),
    debtStatus: str(customer["debt_status"]) || "none",
    overLimit: num(customer["is_over_limit"] ?? 0) === 1,
    creditLimitMinor: num(customer["credit_limit_minor"]),
    monthPurchasesMinor: num(p["monthPurchasesMinor"]),
    monthPaymentsMinor: num(p["monthPaymentsMinor"]),
    loyaltyPoints: num(p["loyaltyPoints"]),
    invoiceCount: invoiceCount > 0 ? invoiceCount : sales.length,
    monthKey: str(p["monthKey"]),
    settlementDay: num(customer["settlement_day"]),
    lastSales: sales.map(mapSale),
    lastPayments: payments.map((x) => ({
      id: num(x["id"]),
      amount_minor: num(x["amount_minor"]),
      method: str(x["method"]),
      reference: typeof x["reference"] === "string" ? x["reference"] : null,
      sale_id: typeof x["sale_id"] === "number" ? x["sale_id"] : null,
      payment_date: str(x["payment_date"]),
    })),
    topProducts: tops.map((x) => ({
      name: str(x["name"]),
      quantity: numQty(x["quantity"]),
      lastPriceMinor: num(x["lastPriceMinor"]),
    })),
    syncIntervalMinutes: syncInterval >= 5 && syncInterval <= 1440 ? syncInterval : 15,
    syncedAt: typeof p["syncedAt"] === "string" ? (p["syncedAt"] as string) : null,
    announcement: typeof p["announcement"] === "string" ? (p["announcement"] as string) : null,
    shop: {
      name: shopName,
      phone: typeof shopRaw["phone"] === "string" ? shopRaw["phone"] : null,
      address: typeof shopRaw["address"] === "string" ? shopRaw["address"] : null,
    },
  };
}

/** Libellé localisé d'un moyen de paiement (inconnu → valeur brute). */
export function paymentMethodLabel(lang: Lang, method: string): string {
  if (method === "cash") return t(lang, "cash");
  if (method === "cheque") return t(lang, "cheque");
  if (method === "transfer") return t(lang, "transfer");
  return method;
}

/** Totaux par moyen de paiement (résumé mensuel, ordre décroissant). */
export interface MethodTotal {
  method: string;
  totalMinor: number;
  count: number;
}

export function paymentsByMethod(rows: HomePayment[]): MethodTotal[] {
  const map = new Map<string, MethodTotal>();
  for (const p of rows) {
    const method = p.method === "" ? "other" : p.method;
    const cur = map.get(method) ?? { method, totalMinor: 0, count: 0 };
    cur.totalMinor += p.amount_minor;
    cur.count += 1;
    map.set(method, cur);
  }
  return [...map.values()].sort((a, b) => b.totalMinor - a.totalMinor);
}

/** Recherche + filtre factures (local, sur la liste miroir). */
export type InvoiceFilter = "all" | "paid" | "partial" | "unpaid" | "cancelled";

export function filterInvoices(
  rows: HomeInvoice[],
  query: string,
  filter: InvoiceFilter,
): HomeInvoice[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  return rows.filter((s) => {
    if (q && !s.invoice_number.toLowerCase().replace(/\s+/g, "").includes(q)) return false;
    if (filter === "cancelled") return s.is_cancelled === 1;
    if (s.is_cancelled === 1) return false;
    if (filter === "all") return true;
    return s.payment_status === filter;
  });
}

/** Paiements du mois AAAA-MM (filtre unique V1). */
export function paymentsOfMonth(rows: HomePayment[], monthKey: string): HomePayment[] {
  return rows.filter((p) => p.payment_date.slice(0, 7) === monthKey);
}

/**
 * Cliché `invoice_detail` → page détail (tolérant : lignes manquantes,
 * totaux dérivés). Retourne null si la vente est illisible.
 */
export function toDetail(payload: unknown): InvoiceDetail | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const s = (p["sale"] ?? {}) as Record<string, unknown>;
  const id = num(s["id"]);
  const invoiceNumber = str(s["invoice_number"]);
  if (id <= 0 || invoiceNumber === "") return null;
  const total = num(s["total_minor"]);
  const remaining = num(s["remaining_balance_minor"]);
  const paidRaw = s["amount_paid_minor"];
  const paid =
    typeof paidRaw === "number" && Number.isSafeInteger(paidRaw)
      ? paidRaw
      : typeof paidRaw === "string" && paidRaw.trim() !== ""
        ? (() => {
            const n = Number(paidRaw);
            return Number.isSafeInteger(n) ? n : total - remaining;
          })()
        : total - remaining;
  const rawItems = Array.isArray(p["items"]) ? (p["items"] as Record<string, unknown>[]) : [];
  const items: DetailItem[] = rawItems
    .map((it) => {
      const qty = numQty(it["quantity"]);
      const unit = num(it["unit_price_minor"]);
      const lineRaw = it["line_total_minor"];
      const line =
        typeof lineRaw === "number" && Number.isSafeInteger(lineRaw)
          ? lineRaw
          : // Même règle que le POS (`multiplyMinorByQuantity`) : arrondi au
            // centime le plus proche, jamais de troncature float.
            Math.round(qty * unit);
      return {
        name: (str(it["product_name_snapshot"]) || str(it["name"])).trim(),
        quantity: qty,
        unitPriceMinor: unit,
        lineTotalMinor: line,
      };
    })
    .filter((it) => it.name !== "");
  return {
    sale: {
      id,
      invoice_number: invoiceNumber,
      total_minor: total,
      amount_paid_minor: paid,
      remaining_balance_minor: remaining,
      payment_status: str(s["payment_status"]),
      is_cancelled: num(s["is_cancelled"]),
      created_at: str(s["created_at"]),
    },
    items,
  };
}

/** Texte de partage du relevé (WhatsApp) : dette + synchro, jamais de PIN. */
export function buildShareText(opts: {
  lang: Lang;
  name: string;
  debtMinor: number;
  syncedAt: string | null;
}): string {
  const amount = formatMinor(opts.debtMinor, opts.lang);
  const date = opts.syncedAt ? opts.syncedAt.slice(0, 10) : "—";
  return `${t(opts.lang, "statementTitle")} ${opts.name} : ${t(opts.lang, "debtRemaining")} ${amount} (${t(opts.lang, "lastSync")} ${date})`;
}
