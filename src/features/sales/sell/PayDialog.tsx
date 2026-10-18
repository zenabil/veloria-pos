// Veloria PoS — Caisse : encaissement en UNE SEULE ÉTAPE.
// Montant + moyen + échéance (si crédit) + validation sur le même écran.
// Le paiement reste atomique + idempotent (finalize du parent).
import { formatDzd, minorToInput } from "@domain/money/money.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { Button, Field, Modal, TextInput } from "@shared/ui/primitives.tsx";
import { AmountMethodFields } from "./AmountMethodFields.tsx";
import { isValidDueDate } from "./sell-totals.ts";

import type { Notify } from "@shared/ui/primitives.tsx";

/** Billets rapides (DZD) : ajout au montant saisi, tactile 44px. */
const QUICK_AMOUNTS_DZD = [1000, 2000, 5000, 10000];

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
  outstandingMinor,
  creditLimitMinor,
  projectedMinor,
  limitExceeded,
  limitOverride,
  onToggleOverride,
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
  outstandingMinor: number | null;
  creditLimitMinor: number | null;
  projectedMinor: number | null;
  limitExceeded: boolean;
  limitOverride: boolean;
  onToggleOverride: (v: boolean) => void;
  onClose: () => void;
  onValidate: () => void;
  notify: Notify;
}): React.JSX.Element {
  const needsCredit = totals.remainingMinor > 0 && changeMinor <= 0;

  function addQuick(dzd: number): void {
    let base = 0;
    try {
      const cur = strictOrNeg(paidText.trim() === "" ? "0" : paidText, "Montant");
      base = Number.isFinite(cur) && cur > 0 ? cur : 0;
    } catch {
      // Saisie en cours invalide : repli bénin à 0 avant l'ajout (pas d'échec utilisateur).
      base = 0;
    }
    setPaidText(minorToInput(base + dzd * 100));
  }

  function validate(): void {
    // L'échéance n'a de sens qu'en crédit : refus FR tôt au lieu d'un commit
    // voué à l'échec (le parent re-vérifie, défense en profondeur).
    if (needsCredit && dueDate !== "" && !isValidDueDate(dueDate)) {
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
            <dt className="font-extrabold">Total net à payer</dt>
            <dd className="font-mono-currency-lg font-extrabold tabular-nums text-amber-300">
              {formatDzd(totals.totalMinor)}
            </dd>
          </div>
          {changeMinor > 0 ? (
            <div className="flex items-center justify-between font-bold text-emerald-300">
              <dt>Monnaie à rendre</dt>
              <dd className="font-mono-currency-xl tabular-nums">{formatDzd(changeMinor)}</dd>
            </div>
          ) : totals.remainingMinor > 0 ? (
            <div className="flex justify-between font-bold text-sky-300">
              <dt>Reste (crédit client)</dt>
              <dd className="tabular-nums">{formatDzd(totals.remainingMinor)}</dd>
            </div>
          ) : null}
        </dl>
        <AmountMethodFields
          amountLabel="Montant donné (DZD)"
          amountAria="Montant donné"
          amountValue={paidText}
          onAmountChange={setPaidText}
          methodValue={paymentMethod ?? defaultMethod}
          onMethodChange={setPaymentMethod}
        />
        <div className="flex flex-wrap gap-2" aria-label="Montants rapides">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPaidText(minorToInput(totals.totalMinor))}
            title="Montant exact du total"
            className="min-h-[44px]"
          >
            Appoint
          </Button>
          {QUICK_AMOUNTS_DZD.map((d) => (
            <Button
              key={d}
              type="button"
              variant="secondary"
              onClick={() => addQuick(d)}
              title={`Ajouter ${d} DZD`}
              className="min-h-[44px]"
            >
              +{d}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setPaidText("")}
            title="Effacer"
            className="min-h-[44px]"
          >
            Effacer
          </Button>
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
        {needsCredit && outstandingMinor != null ? (
          <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
            <div className="flex justify-between text-slate-300">
              <dt>Solde actuel</dt>
              <dd className="tabular-nums font-semibold">{formatDzd(outstandingMinor)}</dd>
            </div>
            {creditLimitMinor != null && creditLimitMinor > 0 ? (
              <>
                <div className="flex justify-between text-slate-300">
                  <dt>Plafond</dt>
                  <dd className="tabular-nums font-semibold">{formatDzd(creditLimitMinor)}</dd>
                </div>
                {projectedMinor != null ? (
                  <div className="flex justify-between text-slate-300">
                    <dt>Solde après vente</dt>
                    <dd className="tabular-nums font-semibold">{formatDzd(projectedMinor)}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
          </dl>
        ) : null}
        {limitExceeded ? (
          <label className="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm">
            <input
              type="checkbox"
              checked={limitOverride}
              onChange={(e) => onToggleOverride(e.target.checked)}
              aria-label="Dépassement autorisé par le vendeur"
              className="mt-1 h-4 w-4 shrink-0"
            />
            <span>
              <strong className="font-bold text-red-200">
                Dépassement de plafond — accord vendeur
              </strong>
              <br />
              <span className="text-xs text-red-200/80">
                Je confirme autoriser cette vente malgré le dépassement (tracé en audit).
              </span>
            </span>
          </label>
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
            {busy ? "Enregistrement…" : "Valider et encaisser [Entrée]"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
