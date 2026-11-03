// Veloria PoS — Shared: construction du payload ticket de vente (aperçu/impression).
// Utilisé par l'historique et les dettes (une seule forme canonique).
import { formatCustomerCode } from "@shared/formatters/format.ts";
import { timbreQuittanceLf2025 } from "@domain/invoice/timbre-rules.ts";
import { BUSINESS_TIME_ZONE } from "@domain/common/business-day.ts";

type Cell = string | number | null | undefined;

interface SaleTicketSource {
  sale: Record<string, Cell>;
  items: Record<string, Cell>[];
  seller?: string | null | undefined;
}

interface SaleTicketCompany {
  company_name?: string | null | undefined;
  phone?: string | null | undefined;
  address?: string | null | undefined;
  city?: string | null | undefined;
  email?: string | null | undefined;
  rc_number?: string | null | undefined;
  nif?: string | null | undefined;
  nis?: string | null | undefined;
  article_imposition?: string | null | undefined;
}

interface SaleTicketCustomer {
  search_name?: string | null | undefined;
  phone?: string | null | undefined;
  address?: string | null | undefined;
}

function text(v: Cell): string {
  return v == null ? "" : String(v);
}

/**
 * Date FR sûre : invalide **ou absente** → "—" (jamais "Invalid Date" anglais
 * sur un ticket, jamais une date inventée).
 *
 * E-39 (radical) — l'ancien repli `new Date(Date.now())` imprimait l'horloge
 * du poste comme date de vente quand `created_at` était absent : une pièce
 * comptable avec une date fabriquée, et l'anomalie devenait invisible. Une
 * vente sans date est une anomalie : elle doit SE VOIR sur le ticket.
 */
function dateFr(v: Cell): string {
  const raw = text(v);
  if (raw === "") return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", { timeZone: BUSINESS_TIME_ZONE });
}

function num(v: Cell): number {
  // P0-7 : garde NaN — un montant corrompu ("abc", undefined) vaut 0 affiché,
  // jamais NaN propagé dans le payload d'impression.
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function refOf(v: Cell): string {
  return typeof v === "number" && v > 0 ? String(v).padStart(5, "0") : "—";
}

export function buildSaleTicketPayload(
  detail: SaleTicketSource,
  company: SaleTicketCompany | null,
  customer: SaleTicketCustomer | null,
  customerId: number,
  balances?: { prev: number; current: number },
): Record<string, unknown> {
  const seller =
    typeof detail.seller === "string"
      ? detail.seller
      : text(detail.sale["seller"] ?? detail.sale["cashier"] ?? detail.sale["created_by"] ?? "");
  const paymentMethod = text(detail.sale["payment_method"]) || null;
  const paidMinor = num(detail.sale["amount_paid_minor"]);
  return {
    // P2 : tête entreprise unique (buildCompanyHead — plus de double mapping).
    ...buildCompanyHead(company),
    customerName: customer?.search_name ?? "",
    customerPhone: customer?.phone ?? "",
    customerAddress: customer?.address ?? "",
    customerCode: customerId > 0 ? formatCustomerCode(customerId) : "",
    seller,
    paymentMethod,
    dueDate: text(detail.sale["due_date"]),
    invoice: text(detail.sale["invoice_number"]),
    date: dateFr(detail.sale["created_at"]),
    lines: detail.items.map((l) => ({
      name: text(l["product_name_snapshot"]),
      qty: num(l["quantity"]),
      unit: text(l["unit_code"]),
      unitPriceMinor: num(l["unit_price_minor"]),
      lineTotalMinor: num(l["line_total_minor"]),
      ref: refOf(l["product_id"]),
    })),
    subtotalMinor: num(detail.sale["subtotal_minor"]),
    discountMinor: num(detail.sale["discount_amount_minor"]),
    deliveryMinor: num(detail.sale["delivery_fee_minor"]),
    totalMinor: num(detail.sale["total_minor"]),
    paidMinor,
    // C5 : timbre documentaire LF 2025 sur l'encaissé espèces (quittance).
    stampMinor: timbreQuittanceLf2025(paidMinor, paymentMethod),
    ...(balances ? { prevBalanceMinor: balances.prev, currentBalanceMinor: balances.current } : {}),
  };
}

/** En-tête entreprise partagée (tickets + avoirs) : évite la dérive RC/NIF. */
export function buildCompanyHead(
  company: SaleTicketCompany | null,
  fallbackName = "Veloria",
): Record<string, unknown> {
  return {
    company: company?.company_name ?? fallbackName,
    companyPhone: company?.phone ?? "",
    companyAddress: company?.address ?? "",
    companyCity: company?.city ?? "",
    companyEmail: company?.email ?? "",
    companyRc: company?.rc_number ?? "",
    companyNif: company?.nif ?? "",
    companyNis: company?.nis ?? "",
    companyArticle: company?.article_imposition ?? "",
  };
}
