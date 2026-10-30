// Veloria PoS — Clients : règlement (encaissement standalone borné par la dette).
// Extrait de `ClientDialogs.tsx` (découpage sans changement de comportement).
import { useState } from "react";
import { PAYMENT_METHOD_LABELS, formatCustomerCode } from "@shared/formatters/format.ts";
import { formatDzd, minorToInput, parseDzdInputStrict } from "@domain/money/money.ts";
import { todayUtcDate } from "@shared/dates/dates.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { callChecked, paymentAckSchema } from "@shared/types/ipc-contracts.ts";
import { PaymentTicketModal, type PaymentTicketInput } from "@shared/documents/payment-preview.tsx";
import { Button, Field, Modal, Select, TextInput } from "@shared/ui/primitives.tsx";
import { fullName } from "../types.ts";
import type { PaymentDialogProps } from "./types.ts";

/** Règlement (encaissement standalone borné par la dette). */
export function PaymentDialog({
  customer,
  onClose,
  onSaved,
  notify,
}: PaymentDialogProps): React.JSX.Element {
  const [amount, setAmount] = useState(
    customer.outstanding_balance_minor > 0 ? minorToInput(customer.outstanding_balance_minor) : "",
  );
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [busy, setBusy] = useState(false);
  // Idempotence (migration 0020) : rejouer le même UUID retrouve le paiement
  // au lieu de le dupliquer (retry IPC, double-clic avant le verrou `busy`).
  const [operationId, setOperationId] = useState<string>(() => newOperationId());
  // Reçu de règlement proposé après succès.
  const [ticket, setTicket] = useState<PaymentTicketInput | null>(null);

  // P1-5 : strict (bornes H-1, jamais NaN) ; invalide → règlement refusé.
  let parsed = 0;
  let parsedOk = true;
  try {
    parsed = parseDzdInputStrict(amount.trim() === "" ? "0" : amount, "Montant");
  } catch {
    parsedOk = false;
  }
  const valid = parsedOk && Number.isInteger(parsed) && parsed > 0;
  const newBalance =
    valid && parsed <= customer.outstanding_balance_minor
      ? customer.outstanding_balance_minor - parsed
      : null;

  async function save(): Promise<void> {
    if (!valid) {
      notify("Montant invalide.", "err");
      return;
    }
    if (parsed > customer.outstanding_balance_minor) {
      notify("Le montant dépasse la dette du client.", "err");
      return;
    }
    setBusy(true);
    try {
      const ack = await callChecked(
        (a) =>
          a.customers.recordPayment({
            operationId,
            customerId: customer.id,
            saleId: null,
            amountMinor: parsed,
            method,
          }),
        paymentAckSchema,
      );
      setOperationId(newOperationId());
      notify(`Paiement de ${formatDzd(parsed)} enregistré.`, "ok");
      // P5 : encaissement = caisse.
      playSound("cash");
      // Ticket de règlement proposé (aperçu + impression 80mm/A4).
      setTicket({
        kind: "customer",
        partyLabel: `${fullName(customer)} — ${formatCustomerCode(customer.id)}`,
        reference: ack.paymentId > 0 ? `PAY-${String(ack.paymentId).padStart(5, "0")}` : "",
        date: todayUtcDate(),
        amountMinor: parsed,
        method,
        prevBalanceMinor: customer.outstanding_balance_minor,
        newBalanceMinor: customer.outstanding_balance_minor - parsed,
        notes: "",
      });
    } catch (e) {
      notify(frError(e, "Règlement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal label="Règlement client" title={`Règlement — ${fullName(customer)}`} onClose={onClose}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
            <div className="flex justify-between text-slate-300">
              <dt>Client</dt>
              <dd className="font-semibold">{fullName(customer)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
              <dt className="font-extrabold">Dette actuelle</dt>
              <dd className="text-xl font-extrabold tabular-nums text-red-300">
                {formatDzd(customer.outstanding_balance_minor)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="font-extrabold">Nouveau solde</dt>
              <dd className="text-lg font-extrabold tabular-nums text-emerald-300">
                {newBalance != null ? formatDzd(newBalance) : "—"}
              </dd>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant (DZD)">
              <TextInput
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Montant du règlement"
              />
            </Field>
            <Field label="Moyen de paiement">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as "cash" | "cheque" | "transfer")}
                aria-label="Moyen de paiement"
              >
                <option value="cash">{PAYMENT_METHOD_LABELS["cash"]}</option>
                <option value="cheque">{PAYMENT_METHOD_LABELS["cheque"]}</option>
                <option value="transfer">{PAYMENT_METHOD_LABELS["transfer"]}</option>
              </Select>
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Le montant est réparti automatiquement sur les factures les plus anciennes.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button type="submit" disabled={busy} className="flex-[2]">
              {busy ? "Enregistrement…" : "Enregistrer le paiement"}
            </Button>
          </div>
        </form>
      </Modal>
      {ticket ? (
        <PaymentTicketModal
          ticket={ticket}
          onClose={() => {
            setTicket(null);
            onSaved();
          }}
          notify={notify}
        />
      ) : null}
    </>
  );
}
