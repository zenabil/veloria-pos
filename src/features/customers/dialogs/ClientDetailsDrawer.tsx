// Veloria PoS — Clients : tiroir de détail (fiche 360, 5 onglets).
// Composition (découpage sans changement de comportement) : les données
// (`useClientDrawerData`), les actions (`useClientDrawerActions`) et les
// panneaux (`ClientDrawerHeader/Tabs/Debts`, `ClientMobileAccess`) vivent
// dans `dialogs/`. Branché sur le bridge window.veloria (jamais de SQLite
// côté renderer).
import { useRef, useState } from "react";
import { Drawer } from "@shared/ui/primitives.tsx";
import { InvoicePreviewModal } from "@shared/documents/invoice-preview.tsx";
import { PaymentTicketModal } from "@shared/documents/payment-preview.tsx";
import { fullName, isArchived } from "../types.ts";
import { asMinor, normFr } from "../client-matching.ts";
import { useClientDrawerData } from "./useClientDrawerData.ts";
import { useClientDrawerActions } from "./useClientDrawerActions.ts";
import {
  ClientDrawerBadges,
  ClientDrawerFooter,
  ClientDrawerHeader,
} from "./ClientDrawerHeader.tsx";
import { ClientMobileAccess } from "./ClientMobileAccess.tsx";
import { ClientDrawerTabs } from "./ClientDrawerTabs.tsx";
import { ClientDrawerDebts } from "./ClientDrawerDebts.tsx";
import { SlipPreviewModal } from "./SlipPreviewModal.tsx";
import { PaymentDialog } from "./PaymentDialog.tsx";
import {
  CLIENT_TABS,
  clientTabLabel,
  type ClientDetailsDrawerProps,
  type ClientTabCounts,
  type ClientTabId,
} from "./types.ts";

/** Tiroir de détail client. */
export function ClientDetailsDrawer({
  customer,
  sales: initialSales,
  onClose,
  onEdit,
  onChanged,
  notify,
}: ClientDetailsDrawerProps): React.JSX.Element {
  const clientName = fullName(customer);
  const clientNorm = normFr(clientName);
  const {
    tab,
    setTab,
    sales,
    payments,
    statementLoading,
    returnsRows,
    returnsState,
    debtsRows,
    debtsState,
    historyRows,
    historyState,
    loadReturns,
    loadDebts,
    loadHistory,
  } = useClientDrawerData({
    customerId: customer.id,
    clientName,
    clientNorm,
    initialSales,
    notify,
  });
  const actions = useClientDrawerActions({ customer, clientName, notify, onChanged, onClose });
  // Requête 2 : aperçu facture (80mm/A4) + réimpression depuis la fiche.
  const [previewSaleId, setPreviewSaleId] = useState<number | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const archived = isArchived(customer);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onTabListKey(e: React.KeyboardEvent): void {
    const ids = CLIENT_TABS.map((t) => t.id);
    const cur = ids.indexOf(tab);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (cur + 1) % ids.length;
    else if (e.key === "ArrowLeft") next = (cur - 1 + ids.length) % ids.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ids.length - 1;
    if (next == null) return;
    e.preventDefault();
    const id = ids[next];
    if (id == null) return;
    setTab(id);
    const btn = tabRefs.current[next];
    if (btn) btn.focus();
  }

  const counts: ClientTabCounts = {
    sales: sales.length,
    payments: payments.length,
    returns: returnsRows.length,
    returnsReady: returnsState === "ready",
    debts: debtsRows.length,
    debtsReady: debtsState === "ready",
    history: historyRows.length,
    historyReady: historyState === "ready",
  };
  function tabLabel(t: ClientTabId): string {
    return clientTabLabel(t, counts);
  }

  const activeSales = sales.filter((s) => s.is_cancelled !== 1);
  const salesTotal = activeSales.reduce((a, s) => a + s.total_minor, 0);
  const salesRest = activeSales.reduce((a, s) => a + s.remaining_balance_minor, 0);
  const payTotal = payments.reduce((a, p) => a + p.amount_minor, 0);
  const debtsRest = debtsRows.reduce((a, d) => a + asMinor(d.remaining_minor), 0);

  return (
    <>
      <Drawer
        label={`Détail ${fullName(customer)}`}
        title={fullName(customer)}
        sub={`Client #${customer.id}`}
        below={<ClientDrawerBadges customer={customer} />}
        footer={
          <ClientDrawerFooter
            customer={customer}
            archived={archived}
            busy={actions.busy}
            onEncaisser={() => setPayOpen(true)}
            onEdit={onEdit}
            onRemove={() => void actions.remove()}
            onRestore={() => void actions.restore()}
          />
        }
        onClose={onClose}
      >
        <ClientDrawerHeader customer={customer} />

        {!archived ? <ClientMobileAccess customer={customer} notify={notify} /> : null}

        <div
          role="tablist"
          aria-label={`Fiche 360 — ${clientName}`}
          onKeyDown={onTabListKey}
          className="flex flex-wrap gap-1.5"
        >
          {CLIENT_TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`client-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`client-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-black"
                  : "rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white"
              }
            >
              {tabLabel(t.id)}
            </button>
          ))}
        </div>

        <ClientDrawerTabs
          tab={tab}
          sales={sales}
          activeSales={activeSales}
          salesTotal={salesTotal}
          salesRest={salesRest}
          payments={payments}
          payTotal={payTotal}
          statementLoading={statementLoading}
          printId={actions.printId}
          receiptBusyId={actions.receiptBusyId}
          onPreviewSale={(id) => setPreviewSaleId(id)}
          onPrintDirect={(id) => void actions.printDirect(id)}
          onOpenReceipt={(id) => void actions.openReceipt(id)}
        />
        <ClientDrawerDebts
          tab={tab}
          customer={customer}
          returnsRows={returnsRows}
          returnsState={returnsState}
          debtsRows={debtsRows}
          debtsState={debtsState}
          historyRows={historyRows}
          historyState={historyState}
          debtsRest={debtsRest}
          receiptBusyId={actions.receiptBusyId}
          slipBusyKey={actions.slipBusyKey}
          onRetryReturns={() => void loadReturns()}
          onRetryDebts={() => void loadDebts()}
          onRetryHistory={() => void loadHistory()}
          onOpenSlip={(kind, entityId) => void actions.openSlip(kind, entityId)}
          onPreviewSale={(id) => setPreviewSaleId(id)}
          onOpenReceipt={(id) => void actions.openReceipt(id)}
        />
      </Drawer>
      {payOpen ? (
        <PaymentDialog
          customer={customer}
          onClose={() => setPayOpen(false)}
          onSaved={() => {
            setPayOpen(false);
            onChanged();
            onClose();
          }}
          notify={notify}
        />
      ) : null}
      {previewSaleId != null ? (
        <InvoicePreviewModal
          saleId={previewSaleId}
          title={`Facture ${sales.find((s) => s.id === previewSaleId)?.invoice_number ?? ""}`}
          onClose={() => setPreviewSaleId(null)}
          notify={notify}
        />
      ) : null}
      {actions.receiptTicket ? (
        <PaymentTicketModal
          ticket={actions.receiptTicket}
          onClose={() => actions.setReceiptTicket(null)}
          notify={notify}
        />
      ) : null}
      {actions.slip ? (
        <SlipPreviewModal
          title={actions.slip.title}
          text80={actions.slip.text80}
          busy={actions.slipBusy}
          onClose={() => actions.setSlip(null)}
          onPrint={() => void actions.printSlip()}
        />
      ) : null}
    </>
  );
}
