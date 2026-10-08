// Veloria PoS — Vente : constructeurs purs (totaux, clichés, charges d'impression).
// Extraits de sell-finalize (zéro IO, testés par tests/unit/sales/sell-split).
import { strictOrNeg } from "@shared/money/parse.ts";
import { computeLineTotal } from "@domain/sales/sale-rules.ts";
import { timbreQuittanceLf2025 } from "@domain/invoice/timbre-rules.ts";
import { totalsOf } from "@/application/sales/create-sale.ts";
import type { ActiveCart, CartTab } from "../cart-store.ts";
import type { SellTotals } from "./useSellState.ts";
import type { LastSale, PreviewLine } from "./sell-types.ts";

export interface CompanyFields {
  name: string;
  phone: string;
  address: string;
  city: string;
  email: string;
  rc: string;
  nif: string;
  nis: string;
  article: string;
}

/** RX-17 : échéance calendaire réelle (AAAA-MM-JJ). */
export function isValidDueDate(dueDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
}

/**
 * Monnaie à rendre (reçu > total) : calculée sur la saisie brute, jamais
 * stockée ni facturée (le montant enregistré est borné au total).
 */
export function computeChangeMinor(
  paidText: string,
  payOpen: boolean,
  totals: { totalMinor: number } | null,
): number {
  const rawPaidMinor = strictOrNeg(paidText.trim() === "" ? "0" : paidText, "Montant");
  return payOpen &&
    totals != null &&
    Number.isFinite(rawPaidMinor) &&
    rawPaidMinor > totals.totalMinor
    ? rawPaidMinor - totals.totalMinor
    : 0;
}

/** Vente à crédit réservée aux clients autorisés (règle appliquée aussi côté main). */
export function creditBlockState(
  payOpen: boolean,
  totals: { remainingMinor: number } | null,
  customerId: number | null,
  customerCredit: boolean | null,
): { blocked: boolean; message: string } {
  const blocked =
    payOpen &&
    totals != null &&
    totals.remainingMinor > 0 &&
    !(customerId != null && customerCredit === true);
  const message =
    customerId == null
      ? "Vente à crédit : choisissez un client autorisé au crédit."
      : "Vente à crédit refusée : ce client n'est pas autorisé au crédit.";
  return { blocked, message };
}

/** Total d'un onglet (null = vide ou incalculable). */
export function tabTotalOf(t: CartTab): number | null {
  if (t.lines.length === 0) return null;
  try {
    return totalsOf({ lines: t.lines, deliveryFeeMinor: 0, amountPaidMinor: 0 }).totalMinor;
  } catch {
    return null;
  }
}

/** Cliché des lignes + totaux figé AVANT commit (aperçu/impression après succès). */
export function buildSaleSnapshot(
  cart: ActiveCart,
  totals: SellTotals,
  defaultMethod: "cash" | "cheque" | "transfer",
): Omit<LastSale, "invoice" | "date" | "balances"> {
  return {
    lines: cart.lines.map((l) => ({
      name: l.productName,
      qty: l.quantity,
      unit: l.unitCode,
      unitPriceMinor: l.unitPriceMinor,
      lineTotalMinor: computeLineTotal(l.unitPriceMinor, l.quantity),
      ref: l.productId != null ? String(l.productId).padStart(5, "0") : "—",
    })),
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountAmountMinor,
    deliveryMinor: 0,
    totalMinor: totals.totalMinor,
    paidMinor: cart.amountPaidMinor,
    customerLabel: cart.customerLabel,
    customerName: cart.customerId != null ? cart.customerLabel : "",
    customerPhone: "",
    customerAddress: "",
    customerCode: "",
    paymentMethod: cart.paymentMethod ?? defaultMethod,
  };
}

/** Charge d'impression ticket/facture (mentions entreprise + timbre LF 2025). */
export function buildPrintPayload(
  company: CompanyFields,
  sale: LastSale,
  balances?: { prev: number; current: number },
): Record<string, unknown> {
  const paymentMethod = sale.paymentMethod;
  return {
    company: company.name,
    companyPhone: company.phone,
    companyAddress: company.address,
    companyCity: company.city,
    companyEmail: company.email,
    companyRc: company.rc,
    companyNif: company.nif,
    companyNis: company.nis,
    companyArticle: company.article,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    customerAddress: sale.customerAddress,
    customerCode: sale.customerCode,
    paymentMethod,
    invoice: sale.invoice,
    date: sale.date,
    lines: sale.lines,
    subtotalMinor: sale.subtotalMinor,
    discountMinor: sale.discountMinor,
    deliveryMinor: sale.deliveryMinor,
    totalMinor: sale.totalMinor,
    paidMinor: sale.paidMinor,
    // C5 : timbre documentaire LF 2025 sur l'encaissé espèces (quittance).
    stampMinor: timbreQuittanceLf2025(sale.paidMinor, paymentMethod),
    prevBalanceMinor: balances?.prev,
    currentBalanceMinor: balances?.current,
  };
}

/** Charge devis (lignes + totaux, coordonnées client complétées ensuite). */
export function buildProformaLines(cart: ActiveCart): PreviewLine[] {
  return cart.lines.map((l) => ({
    name: l.productName,
    qty: l.quantity,
    unit: l.unitCode,
    unitPriceMinor: l.unitPriceMinor,
    lineTotalMinor: computeLineTotal(l.unitPriceMinor, l.quantity),
    ref: l.productId != null ? String(l.productId).padStart(5, "0") : "—",
  }));
}
