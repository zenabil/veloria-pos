// Veloria PoS — Caisse : totaux + dernière vente (extrait de SellScreen, JSX pur).
import { Printer } from "lucide-react";
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, Field, SectionTitle, TextInput } from "@shared/ui/primitives.tsx";
import type { SellTotals } from "./useSellState.ts";
import type { LastSale } from "./sell-types.ts";

export function SellTotalsPanel({
  linesCount,
  totalQty,
  totals,
  totalsErr,
  deliveryText,
  setDeliveryText,
  deliveryFeeMinor,
  onOpenPay,
  preview,
  printMode,
  onPrint,
  onCancelLastSale,
  cancelBusy,
}: {
  linesCount: number;
  totalQty: number;
  totals: SellTotals | null;
  totalsErr: string;
  deliveryText: string;
  setDeliveryText: (v: string) => void;
  deliveryFeeMinor: number;
  onOpenPay: () => void;
  preview: { sale: LastSale; text80: string; htmlA4: string } | null;
  printMode: "80mm" | "A4";
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
        <Card className="space-y-3 border-[#fbbf24]/25 p-5 shadow-[0_12px_28px_-12px_rgba(2,6,13,0.8)]">
          <SectionTitle title="Total à encaisser" hint="Montants en dinars (DZD)" />
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
              <dd className="tabular-nums">{formatDzd(totals?.subtotalMinor ?? 0)}</dd>
            </div>
            {totals != null && totals.discountAmountMinor > 0 ? (
              <div className="flex justify-between font-semibold text-emerald-300">
                <dt>Remise</dt>
                <dd className="tabular-nums">−{formatDzd(totals.discountAmountMinor)}</dd>
              </div>
            ) : null}
            {totals != null && totals.discountAmountMinor < 0 ? (
              <div className="flex justify-between font-semibold text-sky-300">
                <dt>Majoration</dt>
                <dd className="tabular-nums">+{formatDzd(-totals.discountAmountMinor)}</dd>
              </div>
            ) : null}
            {deliveryFeeMinor > 0 ? (
              <div className="flex justify-between text-slate-300">
                <dt>Livraison</dt>
                <dd className="tabular-nums">{formatDzd(deliveryFeeMinor)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
              <dt className="text-xl font-extrabold">Total net à payer</dt>
              <dd className="font-mono-currency-hero tabular-nums text-amber-300">
                {formatDzd(totals?.totalMinor ?? 0)}
              </dd>
            </div>
          </dl>
          <Field label="Livraison (DZD)" hint="Vide = sans livraison.">
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
            disabled={linesCount === 0 || totals == null || totalsErr !== ""}
            className="w-full py-3 text-base"
            title="Ouvrir l'encaissement [F10]"
          >
            Encaisser
          </Button>
        </Card>
      </div>

      {preview ? (
        <Card className="space-y-3 p-5">
          <SectionTitle
            title={`Dernière vente validée · ${preview.sale.invoice}`}
            hint={`${preview.sale.date} · Ticket 80mm / Facture A4 (format [F2])`}
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
          {printMode === "A4" ? (
            <iframe
              sandbox=""
              srcDoc={preview.htmlA4}
              title={`Aperçu facture ${preview.sale.invoice}`}
              className="h-72 w-full rounded-xl border border-white/10 bg-white"
            />
          ) : (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-mono text-xs leading-relaxed text-slate-200">
              {preview.text80}
            </pre>
          )}
        </Card>
      ) : null}
    </div>
  );
}
