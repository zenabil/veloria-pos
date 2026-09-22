// Veloria PoS — Caisse : encaissement en 3 étapes (P4, extrait de SellScreen).
// 1 Montant (reçu + moyen) → 2 Crédit (échéance si reste) → 3 Confirmation.
// Le paiement reste atomique + idempotent (finalize du parent).
import { useState } from "react";
import { formatDzd } from "@domain/money/money.ts";
import { PAYMENT_METHOD_LABELS } from "@shared/formatters/format.ts";
import { Button, Field, Modal, Select, TextInput } from "@shared/ui/primitives.tsx";

import type { Notify } from "@shared/ui/primitives.tsx";

export interface PayTotals {
  totalMinor: number;
  remainingMinor: number;
}

export function PayDialog({
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
  onClose,
  onValidate,
  notify,
}: {
  totals: PayTotals;
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
  onClose: () => void;
  onValidate: () => void;
  notify: Notify;
}): React.JSX.Element {
  const needsCredit = totals.remainingMinor > 0 && changeMinor <= 0;
  const [step, setStep] = useState<1 | 2 | 3>(1);

  function next(): void {
    if (step === 1) {
      setStep(needsCredit ? 2 : 3);
      return;
    }
    if (step === 2) {
      if (dueDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        notify("Échéance invalide : format AAAA-MM-JJ.", "err");
        return;
      }
      setStep(3);
    }
  }

  return (
    <Modal label="Encaissement" title={`Encaissement — étape ${step}/3`} onClose={onClose}>
      <div className="mb-3 flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-amber-400" : "bg-white/10"}`}
          />
        ))}
      </div>
      {step === 1 ? (
        <div className="space-y-4">
          <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
            <div className="flex justify-between text-slate-300">
              <dt>Client</dt>
              <dd className="font-semibold">{customerLabel}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
              <dt className="font-extrabold">À payer</dt>
              <dd className="text-xl font-extrabold tabular-nums text-amber-300">
                {formatDzd(totals.totalMinor)}
              </dd>
            </div>
            {changeMinor > 0 ? (
              <div className="flex justify-between font-bold text-emerald-300">
                <dt>Monnaie à rendre</dt>
                <dd className="tabular-nums">{formatDzd(changeMinor)}</dd>
              </div>
            ) : totals.remainingMinor > 0 ? (
              <div className="flex justify-between font-bold text-sky-300">
                <dt>Reste (crédit client)</dt>
                <dd className="tabular-nums">{formatDzd(totals.remainingMinor)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant reçu (DZD)">
              <TextInput
                value={paidText}
                onChange={(e) => setPaidText(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Montant reçu"
              />
            </Field>
            <Field label="Moyen de paiement">
              <Select
                value={paymentMethod ?? defaultMethod}
                onChange={(e) => setPaymentMethod(e.target.value as "cash" | "cheque" | "transfer")}
                aria-label="Moyen de paiement"
              >
                <option value="cash">{PAYMENT_METHOD_LABELS["cash"]}</option>
                <option value="cheque">{PAYMENT_METHOD_LABELS["cheque"]}</option>
                <option value="transfer">{PAYMENT_METHOD_LABELS["transfer"]}</option>
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Retour
            </Button>
            <Button type="button" onClick={next} className="flex-[2]">
              Continuer
            </Button>
          </div>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Reste à crédit :{" "}
            <strong className="tabular-nums text-sky-300">
              {formatDzd(totals.remainingMinor)}
            </strong>
          </p>
          <Field label="Échéance du crédit" hint="Vide = sans échéance.">
            <TextInput
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Échéance du crédit"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(1)} className="flex-1">
              Retour
            </Button>
            <Button type="button" onClick={next} className="flex-[2]">
              Continuer
            </Button>
          </div>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="space-y-4">
          <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
            <div className="flex justify-between text-slate-300">
              <dt>Total</dt>
              <dd className="font-semibold tabular-nums">{formatDzd(totals.totalMinor)}</dd>
            </div>
            <div className="flex justify-between text-slate-300">
              <dt>Reçu</dt>
              <dd className="tabular-nums">{paidText.trim() === "" ? "—" : paidText}</dd>
            </div>
            {dueDate !== "" ? (
              <div className="flex justify-between text-slate-300">
                <dt>Échéance</dt>
                <dd className="tabular-nums">{dueDate}</dd>
              </div>
            ) : null}
          </dl>
          {creditBlocked ? (
            <p role="alert" className="text-xs font-bold text-red-300">
              {creditBlockedMsg} Exigez le paiement comptant.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Le crédit restant (clients autorisés uniquement) sera ajouté au solde du client. Vente
              atomique avec identifiant unique (anti-doublon).
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep(needsCredit ? 2 : 1)}
              className="flex-1"
            >
              Retour
            </Button>
            <Button
              type="button"
              disabled={busy || creditBlocked}
              onClick={onValidate}
              className="flex-[2]"
            >
              {busy ? "Enregistrement…" : `Valider · ${formatDzd(totals.totalMinor)}`}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
