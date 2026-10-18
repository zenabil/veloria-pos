// Veloria PoS — Vente : finalisation + onglets (extrait de SellScreen).
// Logique reprise à l'identique (centimes, operationId idempotent, gardes,
// montants bornés, messages FR). Règlement → sell-settle, devis →
// sell-proforma, purs → sell-totals. Les actions prennent leurs dépendances
// explicites (fabrique flowDepsFrom pour l'écran).
import { playSound } from "@shared/sound/sound.ts";
import { minorToInput } from "@domain/money/money.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { roundQuantity } from "@domain/common/quantity.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { formatCustomerCode } from "@shared/formatters/format.ts";
import { api } from "@shared/types/ipc-client.ts";
import { callChecked, saleResultSchema } from "@shared/types/ipc-contracts.ts";
import { buildSalePayload } from "@/application/sales/create-sale.ts";
import type { RefObject } from "react";
import type { ActiveCart } from "../cart-store.ts";
import type { Notify } from "@shared/ui/primitives.tsx";
import type { EnrichedCustomer, StatementSale } from "../../customers/types.ts";
import type { SellState, SellTotals } from "./useSellState.ts";
import {
  buildPrintPayload,
  buildSaleSnapshot,
  isValidDueDate,
  type CompanyFields,
} from "./sell-totals.ts";
import type { CustomerRow, LastSale, ProformaDoc, SearchRow } from "./sell-types.ts";

export interface SellFlowDeps {
  cart: ActiveCart;
  notify: Notify;
  company: CompanyFields;
  totals: SellTotals | null;
  payOperationId: string;
  setPayOperationId: (v: string) => void;
  settleOperationId: string;
  setSettleOperationId: (v: string) => void;
  finalizeGuard: { current: boolean };
  proformaGuard: { current: boolean };
  settleGuard: { current: boolean };
  proformaOpRef: { current: { key: string; id: string } | null };
  busy: boolean;
  setBusy: (v: boolean) => void;
  settleBusy: boolean;
  setSettleBusy: (v: boolean) => void;
  proformaBusy: boolean;
  setProformaBusy: (v: boolean) => void;
  setPayOpen: (v: boolean) => void;
  setSettleOpen: (v: boolean) => void;
  paidText: string;
  setPaidText: (v: string) => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  settleAmount: string;
  setSettleAmount: (v: string) => void;
  settleMethod: "cash" | "cheque" | "transfer";
  setSettleMethod: (v: "cash" | "cheque" | "transfer") => void;
  customerBalance: number | null;
  setCustomerBalance: (v: number | null) => void;
  customerCredit: boolean | null;
  setCustomerCredit: (v: boolean | null) => void;
  customerCreditLimit: number | null;
  setCustomerCreditLimit: (v: number | null) => void;
  limitOverride: boolean;
  setLimitOverride: (v: boolean) => void;
  setCreditUnknown: (v: boolean) => void;
  setCustomerQuery: (v: string) => void;
  setCustomerResults: (v: CustomerRow[]) => void;
  setCustomerTotal: (v: number) => void;
  setPreview: (
    v: { sale: LastSale; saleId: number | null; text80: string; htmlA4: string } | null,
  ) => void;
  preview: { sale: LastSale; saleId: number | null; text80: string; htmlA4: string } | null;
  searchRef: RefObject<HTMLInputElement | null>;
  cancelBusy: boolean;
  setCancelBusy: (v: boolean) => void;
  setProformaDoc: (v: ProformaDoc | null) => void;
  setCustomerDrawer: (v: { customer: EnrichedCustomer; sales: StatementSale[] } | null) => void;
  setDrawerBusy: (v: boolean) => void;
  drawerBusy: boolean;
  defaultMethod: "cash" | "cheque" | "transfer";
  printMode: "80mm" | "A4";
  autoPrintInvoice: boolean;
  confirmAsync: (message: string) => Promise<boolean>;
  setResults: (v: SearchRow[]) => void;
}

/** Fabrique : le faisceau d'état (hook) + les extras d'écran → deps du flux. */
export function flowDepsFrom(
  cart: ActiveCart,
  notify: Notify,
  company: CompanyFields,
  s: SellState,
  extra: Pick<SellFlowDeps, "defaultMethod" | "printMode" | "autoPrintInvoice" | "confirmAsync">,
): SellFlowDeps {
  return { ...s, cart, notify, company, ...extra };
}

export function openPay(d: SellFlowDeps): void {
  if (d.cart.lines.length === 0 || d.totals == null) {
    d.notify("Panier vide : ajoutez au moins un article.", "err");
    return;
  }
  d.setPaidText(minorToInput(d.totals.totalMinor));
  d.setDueDate("");
  d.setPayOperationId(newOperationId());
  d.setLimitOverride(false);
  d.setPayOpen(true);
}

export function bumpLastQty(cart: ActiveCart, delta: 1 | -1): void {
  const last = cart.lines[cart.lines.length - 1];
  if (!last) return;
  cart.setQty(last.key, roundQuantity(last.quantity + delta));
}

export function clearSaleForm(d: SellFlowDeps): void {
  d.cart.clear();
  d.cart.setTotals({ paymentMethod: d.defaultMethod });
  d.setPaidText("");
  d.setDueDate("");
  d.setCustomerQuery("");
  d.setCustomerResults([]);
  d.setCustomerTotal(0);
  d.setCustomerCredit(null);
  d.setCustomerBalance(null);
  d.setCustomerCreditLimit(null);
  d.setLimitOverride(false);
}

export function openNewTab(d: SellFlowDeps): void {
  // Paniers multiples : le panier en cours est conservé, un nouvel
  // onglet vide devient l'onglet actif (moyen par défaut des réglages).
  d.cart.newTab();
  d.cart.setTotals({ paymentMethod: d.defaultMethod });
  d.setCustomerQuery("");
  d.setCustomerResults([]);
  d.setCustomerTotal(0);
  d.notify("Nouveau panier.", "ok");
}

/** Vide l'onglet actif (avec confirmation s'il contient des articles). */
export function clearActiveCart(d: SellFlowDeps): void {
  if (d.cart.lines.length > 0) {
    void (async () => {
      if (!(await d.confirmAsync(`Vider « ${d.cart.name} » ? Les articles seront perdus.`))) return;
      clearSaleForm(d);
      playSound("clear");
      d.notify("Panier vidé.", "ok");
    })();
    return;
  }
  clearSaleForm(d);
  playSound("clear");
  d.notify("Panier vidé.", "ok");
}

export function closeTab(d: SellFlowDeps, id: number): void {
  const tab = d.cart.tabs.find((t) => t.id === id);
  if (tab && tab.lines.length > 0) {
    void (async () => {
      if (!(await d.confirmAsync(`Fermer « ${tab.name} » ? Les articles seront perdus.`))) return;
      d.cart.closeTab(id);
      playSound("click");
    })();
    return;
  }
  d.cart.closeTab(id);
  playSound("click");
}

export async function finalizeSale(d: SellFlowDeps): Promise<void> {
  const totals = d.totals;
  if (d.cart.lines.length === 0 || !totals || d.busy || d.finalizeGuard.current) return;
  // RX-17: échéance calendaire réelle (le main retranche via businessDate,
  // mais l'UX refuse tôt en FR au lieu de tenter un commit voué à l'échec).
  if (totals.remainingMinor > 0 && d.dueDate !== "" && !isValidDueDate(d.dueDate)) {
    d.notify("Échéance invalide : format AAAA-MM-JJ.", "err");
    return;
  }
  d.finalizeGuard.current = true;
  d.setPayOpen(false);
  d.setBusy(true);
  try {
    const snapshot = buildSaleSnapshot(d.cart, totals, d.defaultMethod);
    // Solde précédent lu AVANT commit (puis courant = précédent + reste).
    // RX-01: autorisation crédit RELUE ici (pas l'état optimiste) — le main
    // retranche de toute façon (trigger 0007), mais l'UX refuse tôt en FR.
    let prevBalance: number | null = null;
    let freshCredit: boolean | null = null;
    let freshLimit: number | null = null;
    if (d.cart.customerId != null) {
      try {
        const st = (await api.customerStatement({ id: d.cart.customerId })) as {
          customer: {
            outstanding_balance_minor: number;
            phone: string | null;
            address: string | null;
            credit_allowed: number;
            credit_limit_minor: number;
          };
        };
        prevBalance = st.customer.outstanding_balance_minor;
        snapshot.customerPhone = st.customer.phone ?? "";
        snapshot.customerAddress = st.customer.address ?? "";
        snapshot.customerCode = formatCustomerCode(d.cart.customerId);
        freshCredit = st.customer.credit_allowed === 1;
        freshLimit = st.customer.credit_limit_minor;
        d.setCustomerCredit(freshCredit);
        d.setCustomerBalance(prevBalance);
        d.setCustomerCreditLimit(freshLimit);
      } catch {
        /* aperçu sans soldes plutôt que pas de vente */
      }
    }
    // P2 : résultat validé (jamais de cast) — dérive main/renderer = erreur FR.
    const res = await callChecked(
      (a) =>
        a.sales.create(
          buildSalePayload({
            operationId: d.payOperationId,
            lines: d.cart.lines,
            deliveryFeeMinor: d.cart.deliveryFeeMinor,
            amountPaidMinor: d.cart.amountPaidMinor,
            customerId: d.cart.customerId,
            customerCreditAllowed: freshCredit ?? d.customerCredit ?? false,
            customerOutstandingMinor: prevBalance ?? d.customerBalance ?? null,
            customerCreditLimitMinor: freshLimit ?? d.customerCreditLimit ?? null,
            limitOverrideApproved: d.limitOverride,
            dueDate: totals.remainingMinor > 0 && d.dueDate !== "" ? d.dueDate : null,
            paymentMethod: d.cart.paymentMethod ?? d.defaultMethod,
          }),
        ),
      saleResultSchema,
    );
    d.notify(`Vente ${res.invoiceNumber} enregistrée.`, "ok");
    // P5 : arpège de succès (vente = événement signature de la caisse).
    playSound("success");
    const sale: LastSale = {
      ...snapshot,
      invoice: res.invoiceNumber,
      date: new Date().toLocaleString("fr-FR"),
    };
    sale.balances =
      prevBalance != null
        ? { prev: prevBalance, current: prevBalance + totals.remainingMinor }
        : undefined;
    try {
      const pv = (await api.printPreview(buildPrintPayload(d.company, sale, sale.balances))) as {
        text80: string;
        htmlA4: string;
      };
      d.setPreview({ sale, saleId: res.saleId, text80: pv.text80, htmlA4: pv.htmlA4 });
      if (d.autoPrintInvoice) {
        try {
          if (d.printMode === "A4")
            await api.printA4(buildPrintPayload(d.company, sale, sale.balances));
          else await api.printReceipt(buildPrintPayload(d.company, sale, sale.balances));
          d.notify("Impression auto envoyée.", "ok");
        } catch {
          d.notify("Impression auto impossible.", "err");
        }
      }
    } catch {
      d.notify("Aperçu indisponible.", "err");
    }
    clearSaleForm(d);
    d.setResults([]);
    // Vente chaînée : le focus revient en recherche (zéro clic entre deux ventes).
    d.searchRef.current?.focus();
  } catch (e) {
    d.notify(frError(e, "Échec de la vente."), "err");
  } finally {
    d.finalizeGuard.current = false;
    d.setBusy(false);
  }
}

/**
 * Annule la dernière vente validée (sales.cancel idempotent : stock restauré,
 * solde client recalculé côté main). Confirm explicite, aperçu effacé.
 */
export async function cancelLastSale(d: SellFlowDeps): Promise<void> {
  const saleId = d.preview?.saleId;
  if (saleId == null || d.cancelBusy) return;
  const invoice = d.preview?.sale.invoice ?? "";
  if (
    !(await d.confirmAsync(
      `Annuler la vente ${invoice} ? Le stock sera restauré et l'encaissement annulé.`,
    ))
  )
    return;
  d.setCancelBusy(true);
  try {
    await api.saleCancel({ id: saleId, operationId: newOperationId() });
    d.setPreview(null);
    playSound("clear");
    d.notify(`Vente ${invoice} annulée, stock restauré.`, "ok");
  } catch (e) {
    d.notify(frError(e, "Annulation impossible."), "err");
  } finally {
    d.setCancelBusy(false);
    d.searchRef.current?.focus();
  }
}
