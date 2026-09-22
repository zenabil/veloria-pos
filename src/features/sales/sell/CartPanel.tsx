// Veloria PoS — Caisse : panneau panier + dialogue prix (P4, extrait de SellScreen).
// La remise vit UNIQUEMENT dans le prix unitaire (clic sur le P.U.).
import { useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { formatDzd, parseDzdInputStrict } from "@domain/money/money.ts";
import { computeLineTotal } from "@domain/sales/sale-rules.ts";
import { roundQuantity } from "@domain/common/quantity.ts";
import { frError } from "@shared/errors/fr-map.ts";
import type { ActiveCart } from "../cart-store.ts";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  SectionTitle,
  TextInput,
} from "@shared/ui/primitives.tsx";

import type { Notify } from "@shared/ui/primitives.tsx";

export function CartPanel({
  cart,
  totalQty,
  clearActiveCart,
  confirmAsync,
  notify,
}: {
  cart: ActiveCart;
  totalQty: number;
  clearActiveCart: () => void;
  confirmAsync: (message: string) => Promise<boolean>;
  notify: Notify;
}): React.JSX.Element {
  // P0-7 : dialogue de changement de prix (ouvert par clic sur le P.U.).
  const [priceFor, setPriceFor] = useState<{
    key: string;
    name: string;
    purchaseMinor: number;
    originalMinor: number;
    currentMinor: number;
  } | null>(null);
  const [priceText, setPriceText] = useState("");
  const [priceBelowCostAck, setPriceBelowCostAck] = useState(false);

  /** P0-7 : ouvre le dialogue de changement de prix d'une ligne. */
  function openPrice(line: {
    key: string;
    productName: string;
    purchasePriceMinor: number;
    originalUnitPriceMinor: number;
    unitPriceMinor: number;
  }): void {
    setPriceFor({
      key: line.key,
      name: line.productName,
      purchaseMinor: line.purchasePriceMinor,
      originalMinor: line.originalUnitPriceMinor || line.unitPriceMinor,
      currentMinor: line.unitPriceMinor,
    });
    setPriceText((line.unitPriceMinor / 100).toString().replace(".", ","));
    setPriceBelowCostAck(false);
  }

  /** P0-7 : applique le nouveau prix facturé (avertissement + confirmation si sous coût). */
  function savePrice(): void {
    if (priceFor == null) return;
    let finalMinor = 0;
    try {
      finalMinor = parseDzdInputStrict(priceText, "Prix unitaire invalide");
    } catch (e) {
      notify(frError(e, "Prix unitaire invalide."), "err");
      return;
    }
    const belowCost = priceFor.purchaseMinor > 0 && finalMinor < priceFor.purchaseMinor;
    if (belowCost && !priceBelowCostAck) {
      notify(
        `Prix sous le coût d'achat (${formatDzd(priceFor.purchaseMinor)}) : cochez la confirmation explicite.`,
        "err",
      );
      return;
    }
    cart.setLinePrice(priceFor.key, finalMinor);
    setPriceFor(null);
    notify(
      belowCost
        ? `Prix modifié sous coût (audit tracé) : ${formatDzd(finalMinor)}.`
        : `Prix modifié : ${formatDzd(finalMinor)}.`,
      "ok",
    );
  }

  return (
    <>
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
          <SectionTitle
            title={`${cart.name} · ${cart.lines.length} article${cart.lines.length > 1 ? "s" : ""}`}
            hint={`${Math.round(totalQty * 1000) / 1000} unité(s) au total`}
          />
          {cart.lines.length > 0 ? (
            <Button variant="ghost" onClick={clearActiveCart} title="Vider le panier [F9]">
              <Trash2 size={16} aria-hidden="true" /> Vider [F9]
            </Button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {cart.lines.length === 0 ? (
            <EmptyState
              title="Caisse prête"
              hint="Scannez un code-barres ou recherchez un produit pour commencer la vente."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#111a2e] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Produit</th>
                  <th className="px-3 py-2 text-center">Qté</th>
                  <th className="px-3 py-2 text-right">P.U.</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {cart.lines.map((l) => (
                  <tr key={l.key} className="border-t border-white/[0.06]">
                    <td className="px-3 py-2 font-medium">{l.productName}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          aria-label={`Diminuer ${l.productName}`}
                          onClick={() => {
                            // P1-3 : arrondi unifié + 1→0 = confirmation
                            // explicite (jamais de suppression silencieuse).
                            const next = roundQuantity(l.quantity - 1);
                            if (next <= 0) {
                              void (async () => {
                                if (await confirmAsync(`Retirer « ${l.productName} » du panier ?`))
                                  cart.removeLine(l.key);
                              })();
                              return;
                            }
                            cart.setQty(l.key, next);
                          }}
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <Minus size={14} aria-hidden="true" />
                        </button>
                        <input
                          aria-label={`Quantité ${l.productName}`}
                          type="number"
                          min={0.001}
                          step="any"
                          value={l.quantity}
                          onChange={(e) => {
                            // Garde : une saisie vide ou invalide ne doit
                            // jamais supprimer la ligne (× fait cela).
                            const v = Number(e.target.value);
                            if (Number.isFinite(v) && v > 0) cart.setQty(l.key, v);
                          }}
                          className="w-[72px] rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-center text-sm tabular-nums"
                        />
                        <button
                          type="button"
                          aria-label={`Augmenter ${l.productName}`}
                          onClick={() => cart.setQty(l.key, roundQuantity(l.quantity + 1))}
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <Plus size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <button
                        type="button"
                        title="Modifier le prix (remise)"
                        aria-label={`Modifier le prix de ${l.productName}`}
                        onClick={() =>
                          openPrice({
                            key: l.key,
                            productName: l.productName,
                            purchasePriceMinor: l.purchasePriceMinor,
                            originalUnitPriceMinor: l.originalUnitPriceMinor,
                            unitPriceMinor: l.unitPriceMinor,
                          })
                        }
                        className="rounded-lg px-2 py-1 text-slate-300 underline decoration-dotted underline-offset-4 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        {formatDzd(l.unitPriceMinor)}
                      </button>
                      {l.originalUnitPriceMinor > l.unitPriceMinor ? (
                        <div className="text-[11px] text-slate-500 line-through tabular-nums">
                          {formatDzd(l.originalUnitPriceMinor)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {formatDzd(computeLineTotal(l.unitPriceMinor, l.quantity))}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        aria-label={`Retirer ${l.productName}`}
                        onClick={() => cart.removeLine(l.key)}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* P0-7 : changement du prix facturé (la remise vit ici uniquement) */}
      {priceFor ? (
        <Modal
          label="Modifier le prix"
          title={`Prix — ${priceFor.name}`}
          onClose={() => setPriceFor(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              savePrice();
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
                  <dd className="font-semibold tabular-nums">
                    {formatDzd(priceFor.purchaseMinor)}
                  </dd>
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
              if (!below) return null;
              return (
                <div className="space-y-2 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm">
                  <p role="alert" className="font-bold text-red-300">
                    Attention : ce prix passe SOUS le coût d&apos;achat (
                    {formatDzd(priceFor.purchaseMinor)}). La vente sera tracée dans l&apos;audit.
                  </p>
                  <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                    <input
                      type="checkbox"
                      checked={priceBelowCostAck}
                      onChange={(e) => setPriceBelowCostAck(e.target.checked)}
                    />
                    Je confirme explicitement la vente sous coût.
                  </label>
                </div>
              );
            })()}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPriceFor(null)}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button type="submit" className="flex-[2]">
                Appliquer le prix
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
