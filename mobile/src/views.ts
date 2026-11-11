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

/** Annonce du bandeau hero (ADR-166) : texte OU image, échéance optionnelle. */
export interface HomeAnnouncement {
  id: number;
  text: string | null;
  imageUrl: string | null;
  endsAt: string | null;
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
  /** Bandeau hero APK : jusqu'à 4 annonces actives non expirées. */
  announcements: HomeAnnouncement[];
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
    announcements: parseAnnouncements(p),
    shop: {
      name: shopName,
      phone: typeof shopRaw["phone"] === "string" ? shopRaw["phone"] : null,
      address: typeof shopRaw["address"] === "string" ? shopRaw["address"] : null,
    },
  };
}

/** Borne miroir du domaine (4 annonces actives max, ADR-166). */
export const HOME_ANNOUNCEMENT_MAX = 4;

/** Une entrée corrompue est écartée ; un texte OU une image https est requis. */
function toAnnouncement(raw: unknown): HomeAnnouncement | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const text = typeof r["text"] === "string" && r["text"].trim() !== "" ? r["text"].trim() : null;
  const imageRaw = typeof r["imageUrl"] === "string" ? r["imageUrl"].trim() : "";
  const imageUrl = /^https:\/\/\S+$/i.test(imageRaw) && imageRaw.length <= 500 ? imageRaw : null;
  if (text == null && imageUrl == null) return null;
  let endsAt: string | null = null;
  if (typeof r["endsAt"] === "string") {
    // Échéance illisible = annonce corrompue → écartée (fail-closed).
    if (!Number.isFinite(Date.parse(r["endsAt"]))) return null;
    endsAt = r["endsAt"];
  }
  return { id: num(r["id"]), text, imageUrl, endsAt };
}

/**
 * Tableau `announcements` du cliché ; repli sur le champ texte historique
 * (`announcement`, POS ≤ 1.0.4) pour qu'un ancien cliché reste affichable.
 */
export function parseAnnouncements(p: Record<string, unknown>): HomeAnnouncement[] {
  const raw = (Array.isArray(p["announcements"]) ? p["announcements"] : []) as Record<
    string,
    unknown
  >[];
  const out: HomeAnnouncement[] = [];
  for (const item of raw) {
    const announcement = toAnnouncement(item);
    if (announcement) out.push(announcement);
    if (out.length >= HOME_ANNOUNCEMENT_MAX) break;
  }
  if (out.length === 0) {
    const legacy = typeof p["announcement"] === "string" ? p["announcement"].trim() : "";
    if (legacy !== "") out.push({ id: 0, text: legacy, imageUrl: null, endsAt: null });
  }
  return out;
}

/** Une annonce sans échéance (héritage) reste valable indéfiniment. */
export function isAnnouncementLive(a: HomeAnnouncement, nowMs: number): boolean {
  if (a.endsAt == null) return true;
  const ends = Date.parse(a.endsAt);
  return Number.isFinite(ends) && ends > nowMs;
}

/** Annonces affichables maintenant, bornées à 4 (défense miroir). */
export function liveAnnouncements(list: HomeAnnouncement[], nowMs: number): HomeAnnouncement[] {
  return list.filter((a) => isAnnouncementLive(a, nowMs)).slice(0, HOME_ANNOUNCEMENT_MAX);
}

export interface AnnouncementRemaining {
  days: number;
  hours: number;
  minutes: number;
}

/** Compte à rebours arrondi à la minute supérieure (null = sans échéance). */
export function announcementRemaining(
  endsAt: string | null,
  nowMs: number,
): AnnouncementRemaining | null {
  if (endsAt == null) return null;
  const ends = Date.parse(endsAt);
  if (!Number.isFinite(ends)) return null;
  const diff = ends - nowMs;
  if (diff <= 0) return null;
  const totalMinutes = Math.ceil(diff / 60_000);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}

/** Libellé complet bilingue : « Expire dans 3 j 4 h » / « ينتهي بعد 3 يوم 4 ساعة ». */
export function announcementRemainingLabel(
  l: Lang,
  endsAt: string | null,
  nowMs: number,
): string | null {
  const parts = announcementRemaining(endsAt, nowMs);
  if (parts == null) return null;
  const bits: string[] = [];
  if (parts.days > 0) {
    bits.push(`${parts.days} ${t(l, "daysShort")}`);
    if (parts.hours > 0) bits.push(`${parts.hours} ${t(l, "hoursShort")}`);
  } else if (parts.hours > 0) {
    bits.push(`${parts.hours} ${t(l, "hoursShort")}`);
    if (parts.minutes > 0) bits.push(`${parts.minutes} ${t(l, "minutesShort")}`);
  } else {
    bits.push(`${Math.max(1, parts.minutes)} ${t(l, "minutesShort")}`);
  }
  return `${t(l, "expireIn")} ${bits.join(" ")}`;
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

// ============================================================================
// ADR-182 — Catalogue client (table miroir `store_catalog`).
// ============================================================================

/** Produit du catalogue, tel que l'écran le consomme. */
export interface CatalogProduct {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  /** Prix de vente en centimes DZD (jamais un flottant). */
  priceMinor: number;
  unitCode: string;
  /** Indice de disponibilité : la vérité est à la validation au comptoir. */
  available: boolean;
}

/** Borne miroir : le POS ne publie jamais plus de 1000 produits. */
export const CATALOG_MAX_PRODUCTS = 1000;

/**
 * Colonne du catalogue → view-model. Une entrée CORROMPUE est ÉCARTÉE
 * (fail-closed, comme les annonces) : mieux vaut un produit absent qu'un
 * produit au prix faux affiché à l'écran.
 */
export function toCatalogProduct(raw: unknown): CatalogProduct | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r["name"]).trim();
  if (name === "" || name.length > 120) return null;
  const price = num(r["price_minor"], -1);
  if (price < 0) return null;
  const id = num(r["product_id"], -1);
  if (id <= 0) return null;
  const rawCategory = r["category_id"] == null ? null : num(r["category_id"], 0);
  const categoryName = str(r["category_name"]).trim();
  return {
    id,
    name,
    categoryId: rawCategory != null && rawCategory > 0 ? rawCategory : null,
    categoryName: categoryName === "" ? null : categoryName,
    priceMinor: price,
    unitCode: (str(r["unit_code"]).trim() || "PIECE").slice(0, 24),
    available: num(r["available"], 0) === 1,
  };
}

/**
 * Catalogue du miroir → view-models. Tri alphabétique stable (le miroir
 * trie déjà par nom, on re-trie ici pour être indépendant de l'ordre reçu).
 */
export function toCatalog(payload: unknown): CatalogProduct[] {
  const raw = (Array.isArray(payload) ? payload : []) as Record<string, unknown>[];
  const out: CatalogProduct[] = [];
  for (const item of raw) {
    const product = toCatalogProduct(item);
    if (product) out.push(product);
    if (out.length >= CATALOG_MAX_PRODUCTS) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** Catégories présentes dans le catalogue (pour les filtres de l'écran). */
export function catalogCategories(
  items: readonly CatalogProduct[],
): { id: number; name: string }[] {
  const seen = new Map<number, string>();
  for (const item of items) {
    if (item.categoryId == null) continue;
    if (seen.has(item.categoryId)) continue;
    seen.set(item.categoryId, item.categoryName ?? "");
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** Recherche du catalogue (nom ou catégorie), insensible à la casse. */
export function filterCatalog(
  items: readonly CatalogProduct[],
  query: string,
  categoryId: number | null,
): CatalogProduct[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (categoryId != null && item.categoryId !== categoryId) return false;
    if (q === "") return true;
    return (
      item.name.toLowerCase().includes(q) || (item.categoryName ?? "").toLowerCase().includes(q)
    );
  });
}
