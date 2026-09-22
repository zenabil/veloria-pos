// Veloria PoS — Shared: construction du payload ticket de vente (aperçu/impression).
// Utilisé par l'historique et les dettes (une seule forme canonique).
import { formatCustomerCode } from "@shared/formatters/format.ts";

type Cell = string | number | null | undefined;

export interface SaleTicketSource {
  sale: Record<string, Cell>;
  items: Record<string, Cell>[];
}

export interface SaleTicketCompany {
  company_name?: string | null | undefined;
  phone?: string | null | undefined;
  address?: string | null | undefined;
  city?: string | null | undefined;
  email?: string | null | undefined;
  rc_number?: string | null | undefined;
  nif?: string | null | undefined;
}

export interface SaleTicketCustomer {
  search_name?: string | null | undefined;
  phone?: string | null | undefined;
  address?: string | null | undefined;
}

function text(v: Cell): string {
  return v == null ? "" : String(v);
}

/** Date FR sûre : invalide → "—" (jamais "Invalid Date" anglais sur ticket). */
function dateFr(v: Cell): string {
  const raw = text(v);
  const d = raw === "" ? new Date(Date.now()) : new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR");
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
  return {
    // P2 : tête entreprise unique (buildCompanyHead — plus de double mapping).
    ...buildCompanyHead(company),
    customerName: customer?.search_name ?? "",
    customerPhone: customer?.phone ?? "",
    customerAddress: customer?.address ?? "",
    customerCode: customerId > 0 ? formatCustomerCode(customerId) : "",
    paymentMethod: text(detail.sale["payment_method"]) || null,
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
    paidMinor: num(detail.sale["amount_paid_minor"]),
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
  };
}
