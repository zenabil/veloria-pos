// Veloria PoS — Zakat : dialogue de calcul (saisie + résultat + sauvegarde).
import { useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd, minorToInput, parseDzdInputStrict } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { todayUtcDate } from "@shared/dates/dates.ts";
import { Button, Field, Modal, TextArea, TextInput } from "@shared/ui/primitives.tsx";
import { computeZakat } from "@domain/zakat/zakat-rules.ts";
import type { ZakatSources } from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

function parseDzd(text: string): number | null {
  if (text.trim() === "") return 0;
  try {
    return parseDzdInputStrict(text, "Montant");
  } catch {
    return null;
  }
}

export function ZakatCalculationDialog({
  hijriYear,
  sources,
  onClose,
  onSaved,
  notify,
}: {
  hijriYear: string;
  sources: ZakatSources;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [cash, setCash] = useState("");
  const [bank, setBank] = useState("");
  const [stock, setStock] = useState(minorToInput(sources.inventory.v));
  const [receivables, setReceivables] = useState(minorToInput(sources.customerDebts.d));
  const [other, setOther] = useState("");
  const [liabilities, setLiabilities] = useState(
    sources.supplierDebts.d > 0 ? minorToInput(sources.supplierDebts.d) : "",
  );
  const [nisab, setNisab] = useState(
    sources.params.nisabMinor > 0 ? minorToInput(sources.params.nisabMinor) : "",
  );
  const [rate, setRate] = useState(String(sources.params.ratePercent).replace(".", ","));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = {
    cashMinor: parseDzd(cash),
    bankMinor: parseDzd(bank),
    stockMinor: parseDzd(stock),
    receivablesMinor: parseDzd(receivables),
    otherMinor: parseDzd(other),
    liabilitiesMinor: parseDzd(liabilities),
    nisabMinor: parseDzd(nisab),
    ratePercent: rate.trim() === "" ? NaN : Number(rate.replace(",", ".")),
  };
  const allValid =
    parsed.cashMinor != null &&
    parsed.bankMinor != null &&
    parsed.stockMinor != null &&
    parsed.receivablesMinor != null &&
    parsed.otherMinor != null &&
    parsed.liabilitiesMinor != null &&
    parsed.nisabMinor != null &&
    Number.isFinite(parsed.ratePercent) &&
    parsed.ratePercent >= 0.1 &&
    parsed.ratePercent <= 100;
  // H-1 fail-safe display: out-of-cap prefill (DB) shows no result, never crashes.
  let result: { net: number; zakat: number; above: boolean } | null = null;
  if (allValid) {
    try {
      result = computeZakat({
        cashMinor: parsed.cashMinor as number,
        bankMinor: parsed.bankMinor as number,
        stockMinor: parsed.stockMinor as number,
        receivablesMinor: parsed.receivablesMinor as number,
        otherMinor: parsed.otherMinor as number,
        liabilitiesMinor: parsed.liabilitiesMinor as number,
        nisabMinor: parsed.nisabMinor as number,
        ratePercent: parsed.ratePercent,
      });
    } catch {
      result = null;
    }
  }

  async function save(): Promise<void> {
    if (!allValid || !result) {
      notify("Montants invalides.", "err");
      return;
    }
    if (notes.trim().length > 500) {
      notify("Notes trop longues (500 max).", "err");
      return;
    }
    setBusy(true);
    try {
      await api.zakatSaveCalc({
        operationId: newOperationId(),
        hijriYear,
        calcDate: todayUtcDate(),
        cashMinor: parsed.cashMinor,
        bankMinor: parsed.bankMinor,
        stockMinor: parsed.stockMinor,
        receivablesMinor: parsed.receivablesMinor,
        otherMinor: parsed.otherMinor,
        liabilitiesMinor: parsed.liabilitiesMinor,
        nisabMinor: parsed.nisabMinor,
        ratePercent: Math.round(parsed.ratePercent * 100) / 100,
        notes: notes.trim() === "" ? null : notes.trim(),
      });
      notify(`Calcul enregistré : zakat ${formatDzd(result.zakat)}.`, "ok");
      onSaved();
    } catch (e) {
      notify(frError(e, "Enregistrement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  const money = (
    label: string,
    value: string,
    set: (v: string) => void,
    hint = "",
  ): React.JSX.Element => (
    <Field label={label} hint={hint}>
      <TextInput
        value={value}
        onChange={(e) => set(e.target.value)}
        inputMode="decimal"
        placeholder="0,00"
        aria-label={label}
      />
    </Field>
  );

  return (
    <Modal label="Calcul zakat" title={`Calcul zakat — ${hijriYear} H`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {money("Espèces (DZD)", cash, setCash, "Caisse comptée.")}
          {money("Banque (DZD)", bank, setBank)}
          {money("Stock (DZD)", stock, setStock, "Pré-rempli (valeur d'achat).")}
          {money("Créances (DZD)", receivables, setReceivables, "Pré-rempli (clients).")}
          {money("Autres biens (DZD)", other, setOther)}
          {money("Dettes (DZD)", liabilities, setLiabilities, "Pré-rempli (fournisseurs).")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {money("Nisab (DZD)", nisab, setNisab)}
          <Field label="Taux (%)">
            <TextInput
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              placeholder="2,5"
              aria-label="Taux"
            />
          </Field>
        </div>

        <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Net zakatable</dt>
            <dd className="font-bold tabular-nums">{result ? formatDzd(result.net) : "—"}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
            <dt className="font-extrabold">Zakat estimée</dt>
            <dd className="text-xl font-extrabold tabular-nums text-amber-300">
              {result ? formatDzd(result.zakat) : "—"}
            </dd>
          </div>
          <div className="text-xs text-slate-500">
            {result
              ? result.above
                ? "Au-dessus du nisab."
                : "Sous le nisab : aucune zakat."
              : "—"}
          </div>
        </dl>

        <Field label="Notes" hint="Optionnel (500 max).">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Hypothèses, références…"
            aria-label="Notes"
          />
        </Field>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button onClick={() => void save()} disabled={busy || !allValid} className="flex-[2]">
            {busy ? "Enregistrement…" : "Enregistrer le calcul"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
