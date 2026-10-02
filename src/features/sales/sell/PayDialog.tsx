// Veloria PoS — Caisse : encaissement en UNE SEULE ÉTAPE.
// Montant + moyen + échéance (si crédit) + validation sur le même écran.
// Le paiement reste atomique + idempotent (finalize du parent).
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

  function validate(): void {
    // L'échéance n'a de sens qu'en crédit : refus FR tôt au lieu d'un commit
    // voué à l'échec (le parent re-vérifie, défense en profondeur).
    if (needsCredit && dueDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      notify("Échéance invalide : format AAAA-MM-JJ.", "err");
      return;
    }
    onValidate();
  }

  return (
    <Modal label="Encaissement" title="Encaissement" onClose={onClose}>
      <div className="space-y-4">
        <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
          <div className="flex justify-between text-slate-300">
            <dt>Client</dt>
            <dd className="font-semibold">{customerLabel}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
            <dt className="font-extrabold">Total Net à Payer</dt>
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
          <Field label="Montant Donné (DZD)">
            <TextInput
              value={paidText}
              onChange={(e) => setPaidText(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Montant donné"
            />
          </Field>
          <Field label="Moyen de paiement">
            <Select
              value={paymentMethod ?? defaultMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "cash" | "cheque" | "transfer")}
              aria-label="Moyen de paiement"
            >
              <option value="cash">Espèces (Caisse locale)</option>
              <option value="cheque">{PAYMENT_METHOD_LABELS["cheque"]}</option>
              <option value="transfer">{PAYMENT_METHOD_LABELS["transfer"]}</option>
            </Select>
          </Field>
        </div>
        {needsCredit ? (
          <Field label="Échéance du crédit" hint="Vide = sans échéance.">
            <TextInput
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Échéance du crédit"
            />
          </Field>
        ) : null}
        {needsCredit ? (
          <p className="text-sm text-slate-300">
            Reste à crédit :{" "}
            <strong className="tabular-nums text-sky-300">
              {formatDzd(totals.remainingMinor)}
            </strong>
          </p>
        ) : null}
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
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Retour
          </Button>
          <Button
            type="button"
            disabled={busy || creditBlocked}
            onClick={validate}
            className="flex-[2]"
          >
            {busy ? "Enregistrement…" : "Valider & Encaisser [Entrée]"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
