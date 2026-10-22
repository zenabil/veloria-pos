// Veloria PoS — Régression ADR-132 : la ligne facturée au MONTANT SAISI est
// VERROUILLÉE (quantité + prix) et n'est jamais fusionnée.
//
// Symptôme couvert (revue UI du 2026-10-22) : pressing « + » sur une ligne
// « montant saisi » (50,00 DZD à 700 DZD/kg, poids 0,071 kg) recalculait la
// référence prix × quantité ⇒ le montant saisi devenait incohérent ⇒
// `computeBilledTotal` levait au RENDU ⇒ error boundary ⇒ « Écran
// momentanément indisponible » : la caisse était morte. La fusion de deux
// lignes à montant saisi perdait en plus 50,00 DZD.
import { describe, it, expect, beforeEach } from "vitest";
import { useCartsStore } from "@features/sales/cart-store.ts";
import { isBilledByAmount } from "@domain/sales/sale-rules.ts";
import { bumpLastQty } from "@/features/sales/sell/sell-finalize.ts";
import type { CartLine } from "@/application/sales/create-sale.ts";

function amountLine(key: string, billedTotalMinor = 5000): CartLine {
  return {
    key,
    productId: 1,
    productName: "Bil",
    unitCode: "KG",
    originalUnitPriceMinor: 70000,
    unitPriceMinor: 70000,
    purchasePriceMinor: 43000,
    quantity: 0.071,
    billedTotalMinor,
  };
}

function pieceLine(key: string): CartLine {
  return {
    key,
    productId: 2,
    productName: "Sucre",
    unitCode: "PIECE",
    originalUnitPriceMinor: 5000,
    unitPriceMinor: 5000,
    purchasePriceMinor: 4000,
    quantity: 1,
  };
}

function state(): ReturnType<typeof useCartsStore.getState> {
  return useCartsStore.getState();
}

function activeLines(): CartLine[] {
  const s = state();
  return s.tabs.find((t) => t.id === s.activeId)?.lines ?? [];
}

describe("Ligne « montant saisi » verrouillée (ADR-132)", () => {
  beforeEach(() => {
    const s = useCartsStore.getState();
    for (const t of [...s.tabs]) s.closeTab(t.id);
  });

  it("isBilledByAmount : vrai seulement si un montant saisi est porté", () => {
    expect(isBilledByAmount(amountLine("a"))).toBe(true);
    expect(isBilledByAmount(pieceLine("b"))).toBe(false);
    expect(isBilledByAmount({ ...pieceLine("c"), billedTotalMinor: null })).toBe(false);
  });

  it("setQty : la quantité d'une ligne à montant saisi ne change pas", () => {
    state().addLine(amountLine("a"));
    state().setQty("a", 1.5);
    const line = activeLines()[0];
    expect(line?.quantity).toBe(0.071);
    // La ligne reste cohérente ⇒ le montant saisi reste facturable.
    expect(line?.billedTotalMinor).toBe(5000);
  });

  it("setLinePrice : le prix d'une ligne à montant saisi ne change pas", () => {
    state().addLine(amountLine("a"));
    state().setLinePrice("a", 1234);
    const line = activeLines()[0];
    expect(line?.unitPriceMinor).toBe(70000);
  });

  it("les lignes ordinaires restent modifiables", () => {
    state().addLine(pieceLine("b"));
    state().setQty("b", 3);
    state().setLinePrice("b", 4500);
    const line = activeLines()[0];
    expect(line?.quantity).toBe(3);
    expect(line?.unitPriceMinor).toBe(4500);
  });

  it("deux lignes à montant saisi ne sont JAMAIS fusionnées", () => {
    state().addLine(amountLine("a", 5000));
    state().addLine(amountLine("b", 5000));
    expect(activeLines()).toHaveLength(2);
    expect(activeLines()[0]?.quantity).toBe(0.071);
    expect(activeLines()[1]?.quantity).toBe(0.071);
  });

  it("une ligne à montant saisi n'est pas fusionnée avec une ligne au prix", () => {
    state().addLine(amountLine("a", 5000));
    state().addLine({ ...pieceLine("b"), productId: 1, unitPriceMinor: 70000 });
    expect(activeLines()).toHaveLength(2);
  });

  it("bumpLastQty ne touche à AUCUNE autre ligne quand la dernière est verrouillée", () => {
    // Le raccourci vise la DERNIÈRE ligne, jamais une ligne antérieure :
    // avant ce garde-fou, « + » modifiait le produit précédent et « − »
    // pouvait le retirer silencieusement.
    state().addLine(pieceLine("b"));
    state().addLine(amountLine("a"));
    const cart = {
      lines: activeLines(),
      setQty: state().setQty,
    } as never;
    bumpLastQty(cart, 1);
    const lines = activeLines();
    expect(lines[0]?.quantity).toBe(1);
    expect(lines[1]?.quantity).toBe(0.071);
  });

  it("bumpLastQty modifie bien la dernière ligne ordinaire", () => {
    state().addLine(amountLine("a"));
    state().addLine(pieceLine("b"));
    const cart = {
      lines: activeLines(),
      setQty: state().setQty,
    } as never;
    bumpLastQty(cart, 1);
    const lines = activeLines();
    expect(lines[0]?.quantity).toBe(0.071);
    expect(lines[1]?.quantity).toBe(2);
  });
});
