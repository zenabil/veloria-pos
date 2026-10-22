// Veloria PoS — Caisse : dialogue de changement de prix (extrait de CartPanel).
// La remise vit UNIQUEMENT dans le prix unitaire ; vente sous coût = confirmation explicite.
import { formatDzd, parseDzdInputStrict } from "@domain/money/money.ts";
import { Button, Field, Modal, TextInput, cn } from "@shared/ui/primitives.tsx";

export interface PriceTarget {
  key: string;
  name: string;
  purchaseMinor: number;
  originalMinor: number;
  currentMinor: number;
}

export function PriceDialog({
  priceFor,
  priceText,
  setPriceText,
  priceBelowCostAck,
  setPriceBelowCostAck,
  onClose,
  onSubmit,
}: {
  priceFor: PriceTarget;
  priceText: string;
  setPriceText: (v: string) => void;
  priceBelowCostAck: boolean;
  setPriceBelowCostAck: (v: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
}): React.JSX.Element {
  return (
    <Modal label="Modifier le prix" title={`Prix — ${priceFor.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
          <div className="flex justify-between text-slate-300">
            <dt>Prix catalogue</dt>
            <dd className="font-semibold tabular-nums">{formatDzd(priceFor.originalMinor)}</dd>
          </div>
          <div className="flex justify-between text-slate-300">
            <dt>Prix actuel</dt>
            <dd className="font-semibold tabular-nums">{formatDzd(priceFor.currentMinor)}</dd>
          </div>
          {priceFor.purchaseMinor > 0 ? (
            <div className="flex justify-between text-slate-300">
              <dt>Coût d&apos;achat</dt>
              <dd className="font-semibold tabular-nums">{formatDzd(priceFor.purchaseMinor)}</dd>
            </div>
          ) : null}
        </dl>
        <Field label="Nouveau prix (DZD)">
          <TextInput
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            aria-label="Nouveau prix unitaire"
          />
        </Field>
        {(() => {
          let parsed: number | null = null;
          try {
            parsed = parseDzdInputStrict(priceText, "x");
          } catch {
            parsed = null;
          }
          const below =
            parsed != null && priceFor.purchaseMinor > 0 && parsed < priceFor.purchaseMinor;
          // Majoration (prix > prix catalogue) : autorisée (remise signée,
          // migration 0051) mais ANNONCÉE + tracée dans l'audit de la vente.
          const above =
            parsed != null && priceFor.originalMinor > 0 && parsed > priceFor.originalMinor;
          if (!below && !above) return null;
          return (
            <div
              className={cn(
                "space-y-2 rounded-xl border p-4 text-sm",
                below ? "border-red-400/30 bg-red-500/10" : "border-amber-400/30 bg-amber-400/10",
              )}
            >
              {below ? (
                <p role="alert" className="font-bold text-red-300">
                  Attention : ce prix passe SOUS le coût d&apos;achat (
                  {formatDzd(priceFor.purchaseMinor)}). La vente sera tracée dans l&apos;audit.
                </p>
              ) : (
                <p role="alert" className="font-bold text-amber-200">
                  Majoration : ce prix dépasse le prix catalogue (
                  {formatDzd(priceFor.originalMinor)}). L&apos;écart sera tracé dans l&apos;audit.
                </p>
              )}
              {below ? (
                <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                  <input
                    type="checkbox"
                    checked={priceBelowCostAck}
                    onChange={(e) => setPriceBelowCostAck(e.target.checked)}
                  />
                  Je confirme explicitement la vente sous coût.
                </label>
              ) : null}
            </div>
          );
        })()}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" className="flex-[2]">
            Appliquer le prix
          </Button>
        </div>
      </form>
    </Modal>
  );
}
