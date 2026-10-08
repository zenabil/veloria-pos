// Veloria PoS — Caisse : surcouches (encaissement, règlement, devis, client, libre).
// Extrait de SellScreen, JSX pur recevant props (zéro logique déplacée).
import type { RefObject } from "react";
import { FileDown, Printer } from "lucide-react";
import { Button, Modal } from "@shared/ui/primitives.tsx";
import type { Notify } from "@shared/ui/primitives.tsx";
import { PayDialog } from "./PayDialog.tsx";
import { SettleDialog } from "./SettleDialog.tsx";
import { CustomItemDialog, type CustomForm } from "./CustomItemDialog.tsx";
import { ClientDetailsDrawer, ClientFormDialog } from "../../customers/ClientDialogs.tsx";
import type { Customer, EnrichedCustomer, StatementSale } from "../../customers/types.ts";
import type { SellTotals } from "./useSellState.ts";
import type { ProformaDoc } from "./sell-types.ts";

export function SellOverlays({
  payOpen,
  totals,
  customerLabel,
  paidText,
  setPaidText,
  paymentMethod,
  defaultMethod,
  setPaymentMethod,
  dueDate,
  setDueDate,
  changeMinor,
  busy,
  creditBlocked,
  creditBlockedMsg,
  onClosePay,
  onValidatePay,
  notify,
  settleOpen,
  settleCustomerId,
  customerBalance,
  settleAmount,
  setSettleAmount,
  settleMethod,
  setSettleMethod,
  settleBusy,
  onCloseSettle,
  onSubmitSettle,
  proformaDoc,
  onCloseProforma,
  onPrintProforma,
  onPrintProforma80,
  onExportProformaPdf,
  customerDrawer,
  onCloseCustomerDrawer,
  onEditCustomer,
  onCustomerChanged,
  customerFormOpen,
  customerEditing,
  onCloseCustomerForm,
  onSavedCustomerForm,
  customOpen,
  customForm,
  setCustomForm,
  customPriceRef,
  onCloseCustom,
  onAddCustom,
}: {
  payOpen: boolean;
  totals: SellTotals | null;
  customerLabel: string;
  paidText: string;
  setPaidText: (v: string) => void;
  paymentMethod: "cash" | "cheque" | "transfer" | null;
  defaultMethod: "cash" | "cheque" | "transfer";
  setPaymentMethod: (m: "cash" | "cheque" | "transfer") => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  changeMinor: number;
  busy: boolean;
  creditBlocked: boolean;
  creditBlockedMsg: string;
  onClosePay: () => void;
  onValidatePay: () => void;
  notify: Notify;
  settleOpen: boolean;
  settleCustomerId: number | null;
  customerBalance: number | null;
  settleAmount: string;
  setSettleAmount: (v: string) => void;
  settleMethod: "cash" | "cheque" | "transfer";
  setSettleMethod: (m: "cash" | "cheque" | "transfer") => void;
  settleBusy: boolean;
  onCloseSettle: () => void;
  onSubmitSettle: () => void;
  proformaDoc: ProformaDoc | null;
  onCloseProforma: () => void;
  onPrintProforma: () => void;
  onPrintProforma80: () => void;
  onExportProformaPdf: () => void;
  customerDrawer: { customer: EnrichedCustomer; sales: StatementSale[] } | null;
  onCloseCustomerDrawer: () => void;
  onEditCustomer: (c: Customer) => void;
  onCustomerChanged: () => void;
  customerFormOpen: boolean;
  customerEditing: Customer | null;
  onCloseCustomerForm: () => void;
  onSavedCustomerForm: () => void;
  customOpen: boolean;
  customForm: CustomForm;
  setCustomForm: (f: CustomForm) => void;
  customPriceRef: RefObject<HTMLInputElement | null>;
  onCloseCustom: () => void;
  onAddCustom: () => void;
}): React.JSX.Element {
  return (
    <>
      {/* Encaissement en 1 étape (sell/PayDialog) */}
      {payOpen && totals ? (
        <PayDialog
          totals={totals}
          customerLabel={customerLabel}
          paidText={paidText}
          setPaidText={setPaidText}
          paymentMethod={paymentMethod}
          defaultMethod={defaultMethod}
          setPaymentMethod={setPaymentMethod}
          dueDate={dueDate}
          setDueDate={setDueDate}
          changeMinor={changeMinor}
          busy={busy}
          creditBlocked={creditBlocked}
          creditBlockedMsg={creditBlockedMsg}
          onClose={onClosePay}
          onValidate={onValidatePay}
          notify={notify}
        />
      ) : null}

      {/* Règlement de la dette client (P4 : sell/SettleDialog) */}
      {settleOpen && settleCustomerId != null && customerBalance != null ? (
        <SettleDialog
          customerLabel={customerLabel}
          customerBalance={customerBalance}
          settleAmount={settleAmount}
          setSettleAmount={setSettleAmount}
          settleMethod={settleMethod}
          setSettleMethod={setSettleMethod}
          settleBusy={settleBusy}
          onClose={onCloseSettle}
          onSubmit={onSubmitSettle}
        />
      ) : null}

      {/* Aperçu du devis + impression 80mm/A4 + PDF (Entrée = imprimer A4) */}
      {proformaDoc ? (
        <Modal
          label="Aperçu devis"
          title={`Devis ${proformaDoc.number}`}
          onClose={onCloseProforma}
          wide
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onPrintProforma();
            }}
          >
            <p className="text-xs text-slate-500">
              {proformaDoc.date} · Document sans valeur fiscale.
            </p>
            <pre
              className="max-h-[180px] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
              aria-label={`Aperçu devis 80mm ${proformaDoc.number}`}
            >
              {proformaDoc.text80}
            </pre>
            <iframe
              sandbox=""
              srcDoc={proformaDoc.htmlA4}
              title={`Aperçu devis ${proformaDoc.number}`}
              className="h-[420px] w-full rounded-xl border border-white/10 bg-white"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onCloseProforma}
                className="flex-1"
              >
                Fermer
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onPrintProforma80}
                className="flex-1"
              >
                <Printer size={16} aria-hidden="true" /> 80mm
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onExportProformaPdf}
                className="flex-1"
              >
                <FileDown size={16} aria-hidden="true" /> PDF
              </Button>
              <Button type="submit" className="flex-[2]">
                <Printer size={16} aria-hidden="true" /> Imprimer A4
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* Fiche client directe (requête 1) : le panier reste intact */}
      {customerDrawer ? (
        <ClientDetailsDrawer
          customer={customerDrawer.customer}
          sales={customerDrawer.sales}
          onClose={onCloseCustomerDrawer}
          onEdit={onEditCustomer}
          onChanged={onCustomerChanged}
          notify={notify}
        />
      ) : null}
      {customerFormOpen ? (
        <ClientFormDialog
          customer={customerEditing}
          onClose={onCloseCustomerForm}
          onSaved={onSavedCustomerForm}
          notify={notify}
        />
      ) : null}

      {/* Article libre (P4 : sell/CustomItemDialog) */}
      {customOpen ? (
        <CustomItemDialog
          customForm={customForm}
          setCustomForm={setCustomForm}
          customPriceRef={customPriceRef}
          onClose={onCloseCustom}
          onAdd={onAddCustom}
        />
      ) : null}
    </>
  );
}
