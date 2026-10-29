// Veloria PoS — Caisse : totaux + dernière vente (extrait de SellScreen, JSX pur).
import { Banknote, Printer } from "lucide-react";
import { formatDzdTotal } from "@domain/money/money.ts";
import { Button, Card, Field, SectionTitle, TextInput } from "@shared/ui/primitives.tsx";
import type { SellTotals } from "./useSellState.ts";
import type { LastSale } from "./sell-types.ts";

export function SellTotalsPanel({
  linesCount,
  totalQty,
  totals,
  totalsErr,
  raisedLineCount,
  deliveryText,
  setDeliveryText,
  deliveryError,
  deliveryFeeMinor,
  onOpenPay,
  preview,
  onPrint,
  onCancelLastSale,
  cancelBusy,
}: {
  linesCount: number;
  totalQty: number;
  totals: SellTotals | null;
  totalsErr: string;
  /**
   * Nombre de lignes facturées AU-DESSUS de leur prix catalogue (ADR-131).
   * Sert à distinguer la vraie majoration de prix de l'écart d'arrondi du
   * mode « Montant » (les deux donnent une remise négative).
   */
  raisedLineCount: number;
  deliveryText: string;
  setDeliveryText: (v: string) => void;
  deliveryError: string;
  deliveryFeeMinor: number;
  onOpenPay: () => void;
  preview: { sale: LastSale; text80: string } | null;
  onPrint: () => void;
  /** Annulation de la dernière vente (null = aucune vente annulable). */
  onCancelLastSale: (() => void) | null;
  cancelBusy: boolean;
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-auto">
      {/* D2 : total + encaissement collants en haut de colonne — visibles
          pendant le défilement de l'aperçu (dernière vente) ci-dessous. */}
      <div className="sticky top-0 z-10">
        <Card className="relative space-y-3 overflow-hidden border-[#fbbf24]/25 p-5 shadow-[0_12px_28px_-12px_rgba(2,6,13,0.8)]">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,transparent,#fbbf24,transparent)] opacity-80"
          />
          <div className="flex items-start justify-between gap-2">
            <SectionTitle title="Total à encaisser" hint="Montants en dinars (DZD)" />
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fbbf24]/10 text-[#fbbf24] ring-1 ring-[#fbbf24]/20">
              <Banknote size={16} aria-hidden="true" />
            </span>
          </div>
          {totalsErr ? (
            <p role="alert" className="text-sm font-semibold text-red-300">
              {totalsErr}
            </p>
          ) : null}
          <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
            <div className="flex justify-between text-slate-300">
              <dt>
                {linesCount} article{linesCount > 1 ? "s" : ""} ·{" "}
                {Math.round(totalQty * 1000) / 1000} unité(s)
              </dt>
              <dd className="tabular-nums">{formatDzdTotal(totals?.subtotalMinor ?? 0)}</dd>
            </div>
            {totals != null && totals.discountAmountMinor > 0 ? (
              <div className="flex justify-between font-semibold text-emerald-300">
                <dt>Remise</dt>
                <dd className="tabular-nums">−{formatDzdTotal(totals.discountAmountMinor)}</dd>
              </div>
            ) : null}
            {totals != null && totals.discountAmountMinor < 0 ? (
              <div className="flex justify-between font-semibold text-sky-300">
                <dt>
                  {raisedLineCount > 0 ? "Majoration" : "Écart au prix catalogue"}
                  {raisedLineCount > 1 ? ` (${raisedLineCount} lignes)` : ""}
                </dt>
                <dd className="tabular-nums">+{formatDzdTotal(-totals.discountAmountMinor)}</dd>
              </div>
            ) : null}
            {deliveryFeeMinor > 0 ? (
              <div className="flex justify-between text-slate-300">
                <dt>Livraison</dt>
                <dd className="tabular-nums">{formatDzdTotal(deliveryFeeMinor)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
              <dt className="text-xl font-extrabold">Total net à payer</dt>
              <dd className="font-mono-currency-hero tabular-nums text-amber-300">
                {formatDzdTotal(totals?.totalMinor ?? 0)}
              </dd>
            </div>
          </dl>
          <Field
            label="Livraison (DZD)"
            hint="Vide = sans livraison."
            {...(deliveryError !== "" ? { error: deliveryError } : {})}
          >
            <TextInput
              value={deliveryText}
              onChange={(e) => setDeliveryText(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Frais de livraison"
            />
          </Field>
          <Button
            onClick={onOpenPay}
            disabled={
              linesCount === 0 || totals == null || totalsErr !== "" || deliveryError !== ""
            }
            className="w-full py-3 text-base"
            title="Ouvrir l'encaissement [F10]"
          >
            <Banknote size={18} aria-hidden="true" />
            Encaisser
            <span
              aria-hidden="true"
              className="rounded bg-[#402d00]/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#402d00]"
            >
              F10
            </span>
          </Button>
        </Card>
      </div>

      {preview ? (
        <Card className="space-y-3 p-5">
          <SectionTitle
            title={`Dernière vente validée · ${preview.sale.invoice}`}
            hint={`${preview.sale.date} · Ticket 58/80 mm`}
            action={
              <div className="flex gap-2">
                {onCancelLastSale ? (
                  <Button
                    variant="danger"
                    onClick={onCancelLastSale}
                    disabled={cancelBusy}
                    title="Annuler cette vente (stock restauré)"
                  >
                    {cancelBusy ? "Annulation…" : "Annuler"}
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={onPrint} title="Imprimer le ticket">
                  <Printer size={16} aria-hidden="true" /> Imprimer
                </Button>
              </div>
            }
          />
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-mono text-xs leading-relaxed text-slate-200">
            {preview.text80}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
