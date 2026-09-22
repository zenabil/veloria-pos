// Veloria PoS — Fournisseurs : tiroir détail + formulaire + paiement + historique.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";

import { callChecked, paymentAckSchema } from "@shared/types/ipc-contracts.ts";
import { useDefaultMethod } from "@shared/settings/use-app-settings.ts";

import { formatDzd, parseDzdInputStrict } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";

import { todayUtcDate } from "@shared/dates/dates.ts";
import { Button, Field, Modal, Select, TextInput } from "@shared/ui/primitives.tsx";

import { PAYMENT_METHOD_LABELS, type Supplier } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

// ---------------------------------------------------------------------------
// Paiement fournisseur.
// ---------------------------------------------------------------------------

export function SupplierPaymentDialog({
  supplier,
  onClose,
  onSaved,
  notify,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const debt = supplier.outstanding_balance_minor;
  const [amount, setAmount] = useState((debt / 100).toString().replace(".", ","));
  const [method, setMethod] = useDefaultMethod();
  const [date, setDate] = useState(todayUtcDate());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // Idempotence (migration 0020) : même UUID rejoué = même paiement retrouvé.
  const [operationId, setOperationId] = useState<string>(() => newOperationId());

  // P1-5 : parse strict (bornes H-1, jamais NaN) ; invalide → paiement refusé.
  let amountMinor = 0;
  let amountOk = true;
  try {
    amountMinor = parseDzdInputStrict(amount.trim() === "" ? "0" : amount, "Montant");
  } catch {
    amountOk = false;
  }
  const valid = amountOk && Number.isInteger(amountMinor) && amountMinor > 0 && amountMinor <= debt;
  const newBalance = valid ? debt - amountMinor : debt;

  async function save(): Promise<void> {
    if (!valid) {
      notify("Montant invalide (1 centime → dette totale).", "err");
      return;
    }
    setBusy(true);
    try {
      await callChecked(
        (a) =>
          a.suppliers.pay({
            operationId,
            supplierId: supplier.id,
            amountMinor,
            method,
            reference: reference.trim() === "" ? null : reference.trim(),
            notes: notes.trim() === "" ? null : notes.trim(),
            paymentDate: date,
          }),
        paymentAckSchema,
      );
      setOperationId(newOperationId());
      notify(`Paiement ${formatDzd(amountMinor)} enregistré.`, "ok");
      // P5 : encaissement = caisse.
      playSound("cash");
      onSaved();
    } catch (e) {
      notify(frError(e, "Paiement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Paiement fournisseur" title={`Payer — ${supplier.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
          <div className="flex justify-between text-slate-300">
            <dt>Fournisseur</dt>
            <dd className="font-semibold">{supplier.name}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
            <dt className="font-extrabold">Dette actuelle</dt>
            <dd className="text-xl font-extrabold tabular-nums text-red-300">{formatDzd(debt)}</dd>
          </div>
          <div className="flex justify-between font-bold text-emerald-300">
            <dt>Nouveau solde</dt>
            <dd className="tabular-nums">{formatDzd(newBalance)}</dd>
          </div>
        </dl>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant (DZD)">
            <TextInput
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Montant du paiement"
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date de paiement">
            <TextInput
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date de paiement"
            />
          </Field>
          <Field label="Référence" hint="Optionnel.">
            <TextInput
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex. : CHQ-123"
              aria-label="Référence"
            />
          </Field>
        </div>
        <Field label="Notes" hint="Optionnel.">
          <TextInput
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex. : acompte…"
            aria-label="Notes du paiement"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" disabled={busy || !valid} className="flex-[2]">
            {busy ? "Enregistrement…" : `Payer ${formatDzd(valid ? amountMinor : 0)}`}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Paiement borné par la dette (aucun dépassement accepté). Dette + paiement + audit = une
          transaction atomique.
        </p>
      </form>
    </Modal>
  );
}
