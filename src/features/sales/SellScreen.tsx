// Veloria PoS — Écran : Vente (caisse « Nova », clavier d'abord).
// Composition (P2 : découpage sans changement de comportement) :
// état → sell/useSellState, recherche → sell/sell-search,
// finalisation/devis/règlement → sell/sell-finalize,
// impression → sell/useSellPrint, JSX → sell/Sell*Panel + SellOverlays,
// panier → sell/CartPanel.
import { useEffect, useRef } from "react";
import { useCart } from "./cart-store.ts";
import { CartPanel } from "./sell/CartPanel.tsx";
import { useSellShortcuts, type SellKeyActions } from "./sell/useSellShortcuts.ts";
import { useSellState } from "./sell/useSellState.ts";
import {
  addCustomProduct,
  addProductOrAskQuantity,
  confirmWeightedAdd,
  fetchCustomerCredit,
  onQueryChange,
  parseQtyPrefix,
  searchCustomers,
  searchDepsFrom,
  selectCustomer,
  type QtyPrefix,
} from "./sell/sell-search.ts";
import {
  bumpLastQty,
  cancelLastSale,
  clearActiveCart,
  closeTab,
  finalizeSale,
  flowDepsFrom,
  openNewTab,
  openPay,
  type SellFlowDeps,
} from "./sell/sell-finalize.ts";
import { openSettle, settleDebt } from "./sell/sell-settle.ts";
import {
  createProforma,
  openCustomerDetails,
  refreshCustomerDrawer,
} from "./sell/sell-proforma.ts";
import { computeChangeMinor, creditBlockState, tabTotalOf } from "./sell/sell-totals.ts";
import { useSellPrint } from "./sell/useSellPrint.ts";
import { SellSearchPanel } from "./sell/SellSearchPanel.tsx";
import { SellCustomerPanel } from "./sell/SellCustomerPanel.tsx";
import { SellTabsBar } from "./sell/SellTabsBar.tsx";
import { SellTotalsPanel } from "./sell/SellTotalsPanel.tsx";
import { SellOverlays } from "./sell/SellOverlays.tsx";
import { SellShortcutsHelp } from "./sell/SellShortcutsHelp.tsx";
import { useAppSettings, type SalesSettings } from "@shared/settings/use-app-settings.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { useCompany } from "@shared/company/use-company.ts";
import type { PrintMode } from "@/app/shell/App.tsx";
import type { Notify } from "@shared/ui/primitives.tsx";
import type { Customer } from "../customers/types.ts";
import type { SearchRow } from "./sell/sell-types.ts";

export function SellScreen({
  notify,
  printMode,
}: {
  notify: Notify;
  printMode: PrintMode;
}): React.JSX.Element {
  const cart = useCart();
  const s = useSellState(cart);
  // Fiche entreprise : source unique partagée (imprimés caisse + devis).
  const { company } = useCompany();
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  const { value: salesSettings } = useAppSettings<SalesSettings>("sales");
  const defaultMethod = salesSettings?.defaultPaymentMethod ?? "cash";
  // Actions clavier : ref vers les dernières closures (écouteur monté une fois).
  const keyActions = useRef<SellKeyActions | null>(null);
  // P4 : raccourcis montés une fois (sell/useSellShortcuts).
  useSellShortcuts(keyActions, s.searchRef);

  // Focus initial au montage uniquement.
  useEffect(() => {
    s.searchRef.current?.focus();
  }, []);

  // Solde + autorisation + plafond du client sélectionné (lecture seule, avant encaissement).
  useEffect(() => {
    if (cart.customerId == null) {
      s.setCustomerBalance(null);
      s.setCustomerCredit(null);
      s.setCustomerCreditLimit(null);
      s.setLimitOverride(false);
      s.setCreditUnknown(false);
      return;
    }
    let cancelled = false;
    void fetchCustomerCredit(cart.customerId).then(({ balance, allowed, limit }) => {
      if (cancelled) return;
      s.setCustomerBalance(balance);
      s.setCustomerCredit(allowed);
      s.setCustomerCreditLimit(limit);
      s.setLimitOverride(false);
      // Échec de lecture : ni solde ni autorisation fiables (pas de défaut
      // « Comptant uniquement » trompeur — badge « indisponible » explicite).
      s.setCreditUnknown(balance == null || allowed == null);
    });
    return () => {
      cancelled = true;
    };
  }, [cart.customerId]);

  const searchDeps = searchDepsFrom(cart, notify, s);
  const flowDeps: SellFlowDeps = flowDepsFrom(cart, notify, company, s, {
    defaultMethod,
    printMode,
    autoPrintInvoice: salesSettings?.autoPrintInvoice === true,
    confirmAsync,
  });

  useEffect(() => {
    keyActions.current = {
      openCustom: () => s.setCustomOpen(true),
      openPay: () => openPay(flowDeps),
      createProforma: () => createProforma(flowDeps),
      newTab: () => openNewTab(flowDeps),
      clearCart: () => clearActiveCart(flowDeps),
      closeTab: () => closeTab(flowDeps, cart.activeId),
      focusClient: () => s.customerRef.current?.focus(),
      openHelp: () => s.setHelpOpen(true),
      bump: (delta) => bumpLastQty(cart, delta),
    };
  });

  const { print, printProforma, printProforma80, exportProformaPdf } = useSellPrint({
    preview: s.preview,
    proformaDoc: s.proformaDoc,
    printMode,
    company,
    notify,
  });

  const changeMinor = computeChangeMinor(s.paidText, s.payOpen, s.totals);
  const {
    blocked: creditBlocked,
    message: creditBlockedMsg,
    limitExceeded,
    projectedMinor,
  } = creditBlockState(s.payOpen, s.totals, cart.customerId, s.customerCredit, {
    outstandingMinor: s.customerBalance,
    creditLimitMinor: s.customerCreditLimit,
    limitOverrideApproved: s.limitOverride,
  });

  /**
   * ADR-114 — Ajout depuis la recherche : unité continue (poids/volume/
   * longueur) sans quantité tapée → dialogue « quantité vendue » ; la
   * recherche est CONSERVÉE (annulation = retour direct aux résultats).
   * Quantité tapée (`5*code`) ou unité discrète → ajout direct.
   */
  function addRow(r: SearchRow, prefix: QtyPrefix): void {
    if (addProductOrAskQuantity(searchDeps, r, prefix) === "dialog") return;
    s.setQuery("");
    s.setResults([]);
  }

  function pickFirstResult(): void {
    const first = s.results[0];
    if (first) addRow(first, parseQtyPrefix(s.query));
  }

  function onEditCustomer(c: Customer): void {
    s.setCustomerDrawer(null);
    s.setCustomerEditing(c);
    s.setCustomerFormOpen(true);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Barre de recherche + client */}
      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <SellSearchPanel
          query={s.query}
          onQueryChange={(q) => onQueryChange(searchDeps, q)}
          onEnterFirst={pickFirstResult}
          results={s.results}
          searching={s.searching}
          onPick={(r) => addRow(r, parseQtyPrefix(s.query))}
          onOpenCustom={() => s.setCustomOpen(true)}
          onCreateProforma={() => void createProforma(flowDeps)}
          proformaBusy={s.proformaBusy}
          cartEmpty={cart.lines.length === 0}
          searchRef={s.searchRef}
          onOpenHelp={() => s.setHelpOpen(true)}
        />
        <SellCustomerPanel
          customerQuery={s.customerQuery}
          onSearchCustomers={(q) => searchCustomers(searchDeps, q)}
          customerId={cart.customerId}
          customerLabel={cart.customerLabel}
          creditUnknown={s.creditUnknown}
          customerCredit={s.customerCredit}
          customerBalance={s.customerBalance}
          customerCreditLimit={s.customerCreditLimit}
          projectedMinor={s.totals ? (s.customerBalance ?? 0) + s.totals.remainingMinor : null}
          limitExceeded={limitExceeded}
          onOpenDetails={() => void openCustomerDetails(flowDeps)}
          onOpenSettle={() => openSettle(flowDeps)}
          onSelectPassage={() => selectCustomer(searchDeps, null)}
          customerResults={s.customerResults}
          customerTotal={s.customerTotal}
          onSelectCustomer={(c) => selectCustomer(searchDeps, c)}
          customerRef={s.customerRef}
          notify={notify}
        />
      </div>

      {/* Onglets paniers : chaque panier garde ses articles et son client.
          F6 ouvre un nouvel onglet sans toucher aux autres, F8 ferme l'actif. */}
      <SellTabsBar
        tabs={cart.tabs}
        activeId={cart.activeId}
        onSwitch={(id) => cart.switchTab(id)}
        onCloseTab={(id) => closeTab(flowDeps, id)}
        tabTotal={tabTotalOf}
        onNewTab={() => openNewTab(flowDeps)}
      />

      {/* Panier + totaux */}
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        <CartPanel
          cart={cart}
          totalQty={s.totalQty}
          clearActiveCart={() => clearActiveCart(flowDeps)}
          confirmAsync={confirmAsync}
          notify={notify}
        />
        <SellTotalsPanel
          linesCount={cart.lines.length}
          totalQty={s.totalQty}
          totals={s.totals}
          totalsErr={s.totalsErr}
          deliveryText={s.deliveryText}
          setDeliveryText={s.setDeliveryText}
          deliveryFeeMinor={cart.deliveryFeeMinor}
          onOpenPay={() => openPay(flowDeps)}
          preview={s.preview}
          printMode={printMode}
          onPrint={() => void print()}
          onCancelLastSale={s.preview?.saleId != null ? () => void cancelLastSale(flowDeps) : null}
          cancelBusy={s.cancelBusy}
        />
      </div>

      <SellOverlays
        payOpen={s.payOpen}
        totals={s.totals}
        customerLabel={cart.customerLabel}
        paidText={s.paidText}
        setPaidText={s.setPaidText}
        paymentMethod={cart.paymentMethod}
        defaultMethod={defaultMethod}
        setPaymentMethod={(m) => cart.setTotals({ paymentMethod: m })}
        dueDate={s.dueDate}
        setDueDate={s.setDueDate}
        changeMinor={changeMinor}
        busy={s.busy}
        creditBlocked={creditBlocked}
        creditBlockedMsg={creditBlockedMsg}
        outstandingMinor={s.customerBalance}
        creditLimitMinor={s.customerCreditLimit}
        projectedMinor={projectedMinor}
        limitExceeded={limitExceeded}
        limitOverride={s.limitOverride}
        onToggleOverride={(v) => s.setLimitOverride(v)}
        onClosePay={() => s.setPayOpen(false)}
        onValidatePay={() => void finalizeSale(flowDeps)}
        notify={notify}
        settleOpen={s.settleOpen}
        settleCustomerId={cart.customerId}
        customerBalance={s.customerBalance}
        settleAmount={s.settleAmount}
        setSettleAmount={s.setSettleAmount}
        settleMethod={s.settleMethod}
        setSettleMethod={s.setSettleMethod}
        settleBusy={s.settleBusy}
        onCloseSettle={() => s.setSettleOpen(false)}
        onSubmitSettle={() => void settleDebt(flowDeps)}
        proformaDoc={s.proformaDoc}
        onCloseProforma={() => s.setProformaDoc(null)}
        onPrintProforma={() => void printProforma()}
        onPrintProforma80={() => void printProforma80()}
        onExportProformaPdf={() => void exportProformaPdf()}
        customerDrawer={s.customerDrawer}
        onCloseCustomerDrawer={() => s.setCustomerDrawer(null)}
        onEditCustomer={onEditCustomer}
        onCustomerChanged={() => void refreshCustomerDrawer(flowDeps)}
        customerFormOpen={s.customerFormOpen}
        customerEditing={s.customerEditing}
        onCloseCustomerForm={() => {
          s.setCustomerFormOpen(false);
          s.setCustomerEditing(null);
        }}
        onSavedCustomerForm={() => {
          s.setCustomerFormOpen(false);
          s.setCustomerEditing(null);
          void refreshCustomerDrawer(flowDeps);
        }}
        customOpen={s.customOpen}
        customForm={s.customForm}
        setCustomForm={s.setCustomForm}
        customPriceRef={s.customPriceRef}
        onCloseCustom={() => s.setCustomOpen(false)}
        onAddCustom={() => addCustomProduct(searchDeps)}
        quantityFor={s.quantityFor}
        onCloseQuantity={() => {
          // Annulation : le dialogue se ferme, la recherche (requête +
          // résultats) est conservée — focus rendu au champ de recherche.
          s.setQuantityFor(null);
          s.searchRef.current?.focus();
        }}
        onConfirmQuantity={(qty) => {
          confirmWeightedAdd(searchDeps, qty);
        }}
      />

      {/* Aide raccourcis clavier ([?]) */}
      {s.helpOpen ? <SellShortcutsHelp onClose={() => s.setHelpOpen(false)} /> : null}
    </div>
  );
}
