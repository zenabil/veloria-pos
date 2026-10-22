// Veloria PoS — Caisse : dialogue « quantité vendue » (ADR-114).
// Produits à unité continue (KG/G/L/ML/CL/M) : le vendeur saisit le POIDS
// (ou volume/longueur) OU le MONTANT de la quantité vendue — l'autre champ
// est calculé en direct. Le total affiché est toujours le total réellement
// facturé (arrondi exact, jamais le montant brut saisi).
import { useEffect, useRef, useState } from "react";
import { formatDzd } from "@domain/money/money.ts";
import { unitLabel } from "@domain/units/units.ts";
import { Button, Field, Modal, TextInput } from "@shared/ui/primitives.tsx";
import { formatQuantityFr } from "@domain/common/quantity.ts";
import {
  isFeminineQuantityUnit,
  quantityNoun,
  weightDialogPreview,
  type WeightMode,
} from "./sell-weight.ts";
import type { SearchRow } from "./sell-types.ts";

export function QuantityDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: SearchRow;
  onClose: () => void;
  /** Quantité (poids) + montant facturé EXACT (mode « Montant », ADR-114). */
  onConfirm: (quantity: number, billedTotalMinor: number | null) => void;
}): React.JSX.Element {
  const [mode, setMode] = useState<WeightMode>("quantity");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const noun = quantityNoun(row.unit_code);
  // Accord FR : « longueur vendue » (M) vs « poids vendu » (KG/G/L/ML/CL).
  const vendu = isFeminineQuantityUnit(row.unit_code) ? "vendue" : "vendu";
  const calcule = isFeminineQuantityUnit(row.unit_code) ? "calculée" : "calculé";
  const unit = unitLabel(row.unit_code);
  const unitLower = unit.toLowerCase();
  const priceMinor = row.selling_price_minor;
  const stockQty = Number.isFinite(row.quantity) ? row.quantity : null;
  const preview = weightDialogPreview(mode, text, priceMinor);
  const overStock = stockQty != null && preview != null && preview.qty > stockQty;

  // Le champ reprend le focus à chaque changement de mode (clavier d'abord).
  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  function switchMode(next: WeightMode): void {
    setMode(next);
    setText("");
    setError("");
  }

  function submit(): void {
    if (preview == null) {
      setError(
        mode === "quantity"
          ? `${noun} invalide : nombre entre 0,001 et 1 000 000 attendu (ex. 1,5).`
          : "Montant invalide : montant trop petit ou hors bornes pour ce prix.",
      );
      inputRef.current?.focus();
      return;
    }
    // Mode « Montant » : le montant SAISI est facturé tel quel (la quantité
    // reste l'unité de stock) — mode « poids » : facturation prix × poids.
    onConfirm(preview.qty, mode === "amount" ? preview.totalMinor : null);
  }

  return (
    <Modal label="Quantité vendue" title={`Quantité vendue — ${row.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
          <div className="flex justify-between gap-3 text-slate-300">
            <dt>Prix unitaire</dt>
            <dd className="text-right font-semibold tabular-nums text-amber-300">
              {formatDzd(priceMinor)} / {unitLower}
            </dd>
          </div>
          <div className="flex justify-between gap-3 text-slate-300">
            <dt>Stock actuel</dt>
            <dd className="text-right font-semibold tabular-nums">
              {stockQty == null ? "—" : `${formatQuantityFr(stockQty)} ${unitLower}`}
            </dd>
          </div>
        </dl>

        {/* Saisie au choix : quantité (poids/volume/longueur) OU montant. */}
        <div role="group" aria-label="Mode de saisie" className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === "quantity" ? "primary" : "secondary"}
            aria-pressed={mode === "quantity"}
            onClick={() => switchMode("quantity")}
          >
            {noun} ({unit})
          </Button>
          <Button
            type="button"
            variant={mode === "amount" ? "primary" : "secondary"}
            aria-pressed={mode === "amount"}
            onClick={() => switchMode("amount")}
          >
            Montant (DZD)
          </Button>
        </div>

        <Field
          label={mode === "quantity" ? `${noun} ${vendu} (${unitLower})` : "Montant vendu (DZD)"}
          {...(error !== "" ? { error } : {})}
          {...(mode === "amount"
            ? {
                hint: "Le montant saisi est facturé tel quel ; le poids (arrondi au gramme) sert au stock.",
              }
            : {})}
        >
          <TextInput
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError("");
            }}
            inputMode="decimal"
            placeholder={mode === "quantity" ? "0,000" : "0,00"}
            aria-label={mode === "quantity" ? `${noun} vendu` : "Montant vendu"}
            autoComplete="off"
          />
        </Field>

        {/* Aperçu calculé en direct : toujours le total réellement facturé. */}
        <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm">
          {preview == null ? (
            <p className="text-slate-500">
              {text.trim() === ""
                ? "Saisissez la quantité ou le montant : le total à facturer s\u2019affichera ici."
                : "Saisie invalide ou insuffisante — corrigez la valeur, le total s\u2019affichera ici."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {mode === "amount" ? (
                <div className="flex justify-between gap-3 text-slate-300">
                  <span>
                    {noun} {calcule}
                  </span>
                  <span className="text-right font-semibold tabular-nums">
                    {formatQuantityFr(preview.qty)} {unitLower}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between gap-3 text-slate-300">
                  <span>
                    {noun} {vendu}
                  </span>
                  <span className="text-right font-semibold tabular-nums">
                    {formatQuantityFr(preview.qty)} {unitLower}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-3 text-slate-200">
                <span>Total à facturer</span>
                <span className="text-right font-bold tabular-nums text-amber-300">
                  {formatDzd(preview.totalMinor)}
                </span>
              </div>
            </div>
          )}
          {overStock ? (
            <p role="alert" className="mt-2 font-semibold text-amber-300">
              Attention : quantité supérieure au stock ({formatQuantityFr(stockQty)} {unitLower}).
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" className="flex-[2]">
            Ajouter au panier
          </Button>
        </div>
      </form>
    </Modal>
  );
}
