// Veloria PoS — Vente : finalisation + onglets (extrait de SellScreen).
// Logique reprise à l'identique (centimes, operationId idempotent, gardes,
// montants bornés, messages FR). Règlement → sell-settle, devis →
// sell-proforma, purs → sell-totals. Les actions prennent leurs dépendances
// explicites (fabrique flowDepsFrom pour l'écran).
import { playSound } from "@shared/sound/sound.ts";
import { minorToInputTotal, parseDzdInputTotal } from "@domain/money/money.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { roundQuantity } from "@domain/common/quantity.ts";
import { BUSINESS_TIME_ZONE } from "@domain/common/business-day.ts";
import { isBilledByAmount } from "@domain/sales/sale-rules.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { formatCustomerCode } from "@shared/formatters/format.ts";
import { api } from "@shared/types/ipc-client.ts";
import { callChecked, saleResultSchema } from "@shared/types/ipc-contracts.ts";
import { buildSalePayload } from "@/application/sales/create-sale.ts";
import { pickSaleOperationId } from "../sale-op.ts";
import { toCartDraftTabs } from "./cart-drafts.ts";
import type { RefObject } from "react";
import { MAX_CART_TABS, type ActiveCart } from "../cart-store.ts";
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
  paidError: string;
  deliveryError: string;
  setDeliveryText: (v: string) => void;
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
  setPreview: (v: { sale: LastSale; saleId: number | null; text80: string } | null) => void;
  preview: { sale: LastSale; saleId: number | null; text80: string } | null;
  searchRef: RefObject<HTMLInputElement | null>;
  cancelBusy: boolean;
  setCancelBusy: (v: boolean) => void;
  setProformaDoc: (v: ProformaDoc | null) => void;
  setCustomerDrawer: (v: { customer: EnrichedCustomer; sales: StatementSale[] } | null) => void;
  setDrawerBusy: (v: boolean) => void;
  drawerBusy: boolean;
  defaultMethod: "cash" | "cheque" | "transfer";
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
  extra: Pick<SellFlowDeps, "defaultMethod" | "autoPrintInvoice" | "confirmAsync">,
): SellFlowDeps {
  return { ...s, cart, notify, company, ...extra };
}

/**
 * Identité d'opération de la tentative d'encaissement (M-1 côté vente).
 * Liée au CONTENU soumis : un retry (double-clic, timeout, crash + reprise)
 * rejoue la MÊME opération, tandis qu'une correction du panier (ligne, client,
 * montant donné) ouvre une NOUVELLE opération. Sans cette liaison, le main
 * rejouerait l'ancienne vente déjà committée pendant que la caisse imprime et
 * annonce le panier corrigé.
 *
 * POINT DE GÉNÉRATION UNIQUE : au commit, sur le contenu exact envoyé. Résoudre
 * plus tôt (à l'ouverture du dialogue) figerait l'empreinte sur un montant
 * SUPPOSÉ — le caissier saisit-il un versement partiel que l'empreinte change,
 * et le retry après réponse perdue rouvrirait une seconde vente au lieu de
 * rejouer la première.
 */
function saleAttempt(d: SellFlowDeps, amountPaidMinor: number): string {
  const attempt = pickSaleOperationId(d.cart, {
    customerId: d.cart.customerId,
    lines: d.cart.lines,
    amountPaidMinor,
    deliveryFeeMinor: d.cart.deliveryFeeMinor,
    paymentMethod: d.cart.paymentMethod,
  });
  // Écriture seulement quand le contenu diverge : réécrire à chaque appel ferait
  // vibrer le store (et le brouillon autosauvegardé) pour rien.
  if (attempt.rotated) d.cart.setSaleOperation(attempt.key, attempt.operationId);
  return attempt.operationId;
}

export function openPay(d: SellFlowDeps): void {
  if (d.cart.lines.length === 0 || d.totals == null) {
    d.notify("Panier vide : ajoutez au moins un article.", "err");
    return;
  }
  if (d.deliveryError !== "") {
    d.notify(d.deliveryError, "err");
    return;
  }
  d.setPaidText(minorToInputTotal(d.totals.totalMinor));
  d.setDueDate("");
  d.setLimitOverride(false);
  d.setPayOpen(true);
}

export function bumpLastQty(cart: ActiveCart, delta: 1 | -1, notify?: Notify): void {
  // ADR-132 : le raccourci vise la DERNIÈRE ligne (c'est ce qu'annonce
  // l'aide « Quantité dernière ligne »). Si elle est facturée au MONTANT
  // SAISI (quantité verrouillée), on ne fait RIEN : remonter à une ligne
  // antérieure modifierait un produit que le caissier n'a pas visé (et « − »
  // pourrait même la retirer).
  const last = cart.lines[cart.lines.length - 1];
  if (!last) return;
  if (isBilledByAmount(last)) {
    notify?.("Quantité verrouillée : montant saisi — retirez la ligne pour la corriger.", "err");
    return;
  }
  const next = roundQuantity(last.quantity + delta);
  if (next <= 0) {
    notify?.("Quantité minimale atteinte : utilisez la croix pour retirer la ligne.", "err");
    return;
  }
  if (delta > 0 && last.stockQty != null && next > last.stockQty) {
    notify?.(
      `Stock insuffisant : « ${last.productName} » — disponible ${Math.round(last.stockQty * 1000) / 1000}.`,
      "err",
    );
    return;
  }
  cart.setQty(last.key, next);
}

export function clearSaleForm(d: SellFlowDeps): void {
  d.cart.clear();
  d.cart.setTotals({ paymentMethod: d.defaultMethod });
  d.setPaidText("");
  d.setDeliveryText("");
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
  if (d.cart.tabs.length >= MAX_CART_TABS) {
    d.notify(`Limite de ${MAX_CART_TABS} paniers atteinte : fermez un onglet.`, "err");
    return;
  }
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
    // Le montant saisi est revalidé ici (source : texte, pas l'état optimiste).
    // Un texte invalide ne doit JAMAIS devenir 0 (crédit involontaire).
    let rawPaidMinor = 0;
    try {
      rawPaidMinor = d.paidText.trim() === "" ? 0 : parseDzdInputTotal(d.paidText, "Montant donné");
    } catch (e) {
      d.notify(frError(e, "Montant donné invalide."), "err");
      return;
    }
    const appliedPaidMinor = Math.min(rawPaidMinor, totals.totalMinor);
    const remainingMinor = totals.totalMinor - appliedPaidMinor;
    const dueDate = remainingMinor > 0 && d.dueDate !== "" ? d.dueDate : null;
    if (appliedPaidMinor !== d.cart.amountPaidMinor) {
      d.cart.setTotals({ amountPaidMinor: appliedPaidMinor });
    }
    const snapshot = buildSaleSnapshot(
      { ...d.cart, amountPaidMinor: appliedPaidMinor },
      totals,
      d.defaultMethod,
      dueDate,
    );
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
    // Identité de la tentative résolue sur le contenu FINAL (montant réellement
    // appliqué compris) : c'est lui que le main va committer.
    const operationId = saleAttempt(d, appliedPaidMinor);
    // Persister l'identité de la tentative AVANT le commit : si l'application
    // meurt entre le commit et le nettoyage du panier, le brouillon rejouera
    // le même operationId et `createSaleAtomic` reconnaîtra la vente. Le montant
    // appliqué est écrit explicitement (les onglets du store sont encore ceux du
    // rendu courant) pour que le brouillon décrive exactement cette vente.
    const draftTabs = toCartDraftTabs(d.cart.tabs).map((t) =>
      t.tabId === d.cart.activeId
        ? { ...t, saleOperationId: operationId, amountPaidMinor: appliedPaidMinor }
        : t,
    );
    try {
      await api.cartsSave({ operationId: newOperationId(), tabs: draftTabs });
    } catch (e) {
      d.notify(frError(e, "Sauvegarde du panier impossible : vente annulée."), "err");
      return;
    }
    // P2 : résultat validé (jamais de cast) — dérive main/renderer = erreur FR.
    const res = await callChecked(
      (a) =>
        a.sales.create(
          buildSalePayload({
            operationId,
            lines: d.cart.lines,
            deliveryFeeMinor: d.cart.deliveryFeeMinor,
            amountPaidMinor: appliedPaidMinor,
            customerId: d.cart.customerId,
            customerCreditAllowed: freshCredit ?? d.customerCredit ?? false,
            customerOutstandingMinor: prevBalance ?? d.customerBalance ?? null,
            customerCreditLimitMinor: freshLimit ?? d.customerCreditLimit ?? null,
            limitOverrideApproved: d.limitOverride,
            dueDate,
            // ADR-182 : commande client servie par cette vente (la vente lie
            // la commande dans SA transaction — pas de commande orpheline).
            clientOrderId: d.cart.clientOrderId ?? null,
            // Crédit sans versement : aucun moyen de paiement à imprimer.
            paymentMethod: appliedPaidMinor > 0 ? (d.cart.paymentMethod ?? d.defaultMethod) : null,
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
      date: new Date().toLocaleString("fr-FR", { timeZone: BUSINESS_TIME_ZONE }),
    };
    sale.balances =
      prevBalance != null
        ? { prev: prevBalance, current: prevBalance + remainingMinor }
        : undefined;
    // Fermer la caisse AVANT toute impression : si l'aperçu/le pilote échoue,
    // la vente déjà commitée ne peut pas être rejouée depuis le panier.
    clearSaleForm(d);
    d.setResults([]);
    d.searchRef.current?.focus();
    try {
      const pv = (await api.printPreview(buildPrintPayload(d.company, sale, sale.balances))) as {
        text80: string;
      };
      d.setPreview({ sale, saleId: res.saleId, text80: pv.text80 });
      if (d.autoPrintInvoice) {
        try {
          // Vente = ticket uniquement (jamais A4) — politique opération → format.
          await api.printReceipt(buildPrintPayload(d.company, sale, sale.balances));
          d.notify("Impression auto envoyée.", "ok");
        } catch (e) {
          console.error("[Veloria] impression auto impossible", e);
          d.notify("Impression auto impossible.", "err");
        }
      }
    } catch (e) {
      console.error("[Veloria] aperçu du ticket indisponible", e);
      d.notify("Aperçu indisponible.", "err");
    }
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
