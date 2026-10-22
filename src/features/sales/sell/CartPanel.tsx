// Veloria PoS — Caisse : panneau panier (P4, extrait de SellScreen).
// La remise vit UNIQUEMENT dans le prix unitaire (clic sur le P.U. → PriceDialog).
import { useEffect, useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { formatDzd, minorToInput, parseDzdInputStrict } from "@domain/money/money.ts";
import { computeBilledTotal, isBilledByAmount } from "@domain/sales/sale-rules.ts";
import { roundQuantity } from "@domain/common/quantity.ts";
import { frError } from "@shared/errors/fr-map.ts";
import type { ActiveCart } from "../cart-store.ts";
import { PriceDialog, type PriceTarget } from "./PriceDialog.tsx";
import { Badge, Button, Card, EmptyState, SectionTitle } from "@shared/ui/primitives.tsx";

import type { Notify } from "@shared/ui/primitives.tsx";

/** Rendu progressif : au-delà, le tableau tronque + bouton « tout afficher ». */
const RENDER_LIMIT = 60;

/**
 * Montant affiché d'une ligne — JAMAIS d'exception pendant le rendu : une
 * exception de rendu tue l'écran de la caisse (error boundary). Une ligne
 * incohérente affiche « — » et le détail technique part en journal.
 */
export function safeLineTotal(line: Parameters<typeof computeBilledTotal>[0]): number | null {
  try {
    return computeBilledTotal(line);
  } catch (e) {
    console.error("[Veloria] total de ligne incalculable", e);
    return null;
  }
}

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
  // Grands paniers : rendu progressif (pas de lib de virtualisation — ADR requise).
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setShowAll(false);
  }, [cart.activeId]);
  const truncated = !showAll && cart.lines.length > RENDER_LIMIT + 20;
  const visibleLines = truncated ? cart.lines.slice(0, RENDER_LIMIT) : cart.lines;

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
        ? `Prix modifié sous coût (tracé dans le journal de la vente) : ${formatDzd(finalMinor)}.`
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
              glyph="cart"
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
                {visibleLines.map((l) => {
                  // ADR-132 : ligne facturée au MONTANT SAISI → quantité et
                  // prix VERROUILLÉS (le montant saisi fait foi).
                  const locked = isBilledByAmount(l);
                  const total = safeLineTotal(l);
                  const lockHintId = locked ? `verrou-${l.key}` : undefined;
                  return (
                    <tr
                      key={l.key}
                      className="border-t border-white/[0.06] [content-visibility:auto] [contain-intrinsic-size:auto_64px]"
                    >
                      <td className="px-3 py-2 font-medium">
                        {l.productName}
                        {l.stockQty != null ? (
                          l.stockQty <= 0 ? (
                            <div className="mt-1">
                              <Badge tone="red">Rupture</Badge>
                            </div>
                          ) : l.quantity > l.stockQty ? (
                            <div className="mt-1 text-[11px] font-bold text-red-300 tabular-nums">
                              Stock : {Math.round(l.stockQty * 1000) / 1000} — dépassement
                            </div>
                          ) : (
                            <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                              Stock : {Math.round(l.stockQty * 1000) / 1000}
                            </div>
                          )
                        ) : null}
                        {locked ? (
                          // Verrou EXPLIQUÉ à l'écran (pas seulement en
                          // infobulle : une caisse tactile n'a pas de survol).
                          // `aria-describedby` le relie aux contrôles désactivés.
                          <div
                            id={lockHintId}
                            className="mt-1 text-[11px] font-semibold text-amber-300/80"
                          >
                            Montant saisi — quantité et prix verrouillés. Retirez la ligne pour la
                            ressaisir.
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            aria-label={`Diminuer ${l.productName}`}
                            aria-describedby={lockHintId}
                            disabled={locked}
                            title={
                              locked
                                ? "Quantité verrouillée : montant saisi — supprimez la ligne pour la ressaisir."
                                : undefined
                            }
                            onClick={() => {
                              // P1-3 : arrondi unifié + 1→0 = confirmation
                              // explicite (jamais de suppression silencieuse).
                              const next = roundQuantity(l.quantity - 1);
                              if (next <= 0) {
                                void (async () => {
                                  if (
                                    await confirmAsync(`Retirer « ${l.productName} » du panier ?`)
                                  )
                                    cart.removeLine(l.key);
                                })();
                                return;
                              }
                              cart.setQty(l.key, next);
                            }}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          >
                            <Minus size={16} aria-hidden="true" />
                          </button>
                          <input
                            aria-label={
                              locked
                                ? `Quantité verrouillée — ${l.productName}`
                                : `Quantité ${l.productName}`
                            }
                            aria-describedby={lockHintId}
                            type="number"
                            min={0.001}
                            step="any"
                            value={l.quantity}
                            disabled={locked}
                            title={
                              locked
                                ? "Quantité verrouillée : montant saisi — supprimez la ligne pour la ressaisir."
                                : undefined
                            }
                            onChange={(e) => {
                              // Garde : une saisie vide ou invalide ne doit
                              // jamais supprimer la ligne (× fait cela).
                              // Virgule FR acceptée (clavier caisse).
                              const v = Number(e.target.value.replace(",", "."));
                              if (Number.isFinite(v) && v > 0) {
                                if (l.stockQty != null && roundQuantity(v) > l.stockQty) {
                                  notify(
                                    `Stock insuffisant : « ${l.productName} » — disponible ${Math.round(l.stockQty * 1000) / 1000}.`,
                                    "err",
                                  );
                                }
                                cart.setQty(l.key, v);
                              }
                            }}
                            className="w-[88px] min-h-[44px] rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-center text-base tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <button
                            type="button"
                            aria-label={`Augmenter ${l.productName}`}
                            aria-describedby={lockHintId}
                            disabled={locked}
                            title={
                              locked
                                ? "Quantité verrouillée : montant saisi — supprimez la ligne pour la ressaisir."
                                : undefined
                            }
                            onClick={() => {
                              const next = roundQuantity(l.quantity + 1);
                              if (l.stockQty != null && next > l.stockQty) {
                                notify(
                                  `Stock insuffisant : « ${l.productName} » — disponible ${Math.round(l.stockQty * 1000) / 1000}.`,
                                  "err",
                                );
                              }
                              cart.setQty(l.key, next);
                            }}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          >
                            <Plus size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <button
                          type="button"
                          title={
                            locked
                              ? "Prix verrouillé : montant saisi — supprimez la ligne pour la ressaisir."
                              : "Modifier le prix (remise)"
                          }
                          aria-label={
                            locked
                              ? `Prix verrouillé — ${l.productName}`
                              : `Modifier le prix de ${l.productName}`
                          }
                          aria-describedby={lockHintId}
                          disabled={locked}
                          onClick={() =>
                            openPrice({
                              key: l.key,
                              productName: l.productName,
                              purchasePriceMinor: l.purchasePriceMinor,
                              originalUnitPriceMinor: l.originalUnitPriceMinor,
                              unitPriceMinor: l.unitPriceMinor,
                            })
                          }
                          className="rounded-lg px-2 py-1 text-slate-300 underline decoration-dotted underline-offset-4 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
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
                        {total == null ? (
                          <span
                            title="Montant de ligne illisible — retirez la ligne."
                            aria-label="Montant de ligne illisible — retirez la ligne"
                            className="text-slate-500"
                          >
                            —
                          </span>
                        ) : (
                          formatDzd(total)
                        )}
                        {locked && total != null ? (
                          // La marque est SOUS le total (c'est le total qui est
                          // facturé) et rappelle le poids : 0,071 kg × 700,00 DZD
                          // ne fait pas 50,00 DZD — l'écart est visible.
                          <div
                            title={`Montant facturé tel que saisi : ${formatDzd(total)} (poids indicatif ${Math.round(l.quantity * 1000) / 1000} ${l.unitCode.toLowerCase()})`}
                            aria-label={`Montant facturé tel que saisi : ${formatDzd(total)}`}
                            className="text-xs font-semibold text-amber-300/90"
                          >
                            Montant saisi
                          </div>
                        ) : null}
                        {locked && total == null ? (
                          // Jamais de faux « 0,00 DZD » dans la voie de secours.
                          <div role="status" className="text-[11px] font-semibold text-amber-200">
                            Montant illisible — retirez la ligne
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          aria-label={`Retirer ${l.productName}`}
                          onClick={() => {
                            // Même garde que − jusqu'à 0 : jamais de suppression
                            // silencieuse (l'ancienne × supprimait sans confirm).
                            void (async () => {
                              if (await confirmAsync(`Retirer « ${l.productName} » du panier ?`))
                                cart.removeLine(l.key);
                            })();
                          }}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {truncated ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm font-bold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Afficher tout ({cart.lines.length} articles)
            </button>
          ) : null}
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
