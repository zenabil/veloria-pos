// Veloria PoS — Caisse : panneau panier (P4, extrait de SellScreen).
// La remise vit UNIQUEMENT dans le prix unitaire (clic sur le P.U. → PriceDialog).
import { useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { formatDzd, minorToInput, parseDzdInputStrict } from "@domain/money/money.ts";
import { computeLineTotal } from "@domain/sales/sale-rules.ts";
import { roundQuantity } from "@domain/common/quantity.ts";
import { frError } from "@shared/errors/fr-map.ts";
import type { ActiveCart } from "../cart-store.ts";
import { PriceDialog, type PriceTarget } from "./PriceDialog.tsx";
import { Button, Card, EmptyState, SectionTitle } from "@shared/ui/primitives.tsx";

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
  const [priceFor, setPriceFor] = useState<PriceTarget | null>(null);
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
    setPriceText(minorToInput(line.unitPriceMinor));
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
              <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
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
        <PriceDialog
          priceFor={priceFor}
          priceText={priceText}
          setPriceText={setPriceText}
          priceBelowCostAck={priceBelowCostAck}
          setPriceBelowCostAck={setPriceBelowCostAck}
          onClose={() => setPriceFor(null)}
          onSubmit={savePrice}
        />
      ) : null}
    </>
  );
}
