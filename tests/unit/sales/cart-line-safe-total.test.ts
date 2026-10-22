// Veloria PoS — ADR-132 : le panier ne lève JAMAIS pendant le rendu.
//
// Symptôme couvert (revue UI du 2026-10-22) : une ligne « montant saisi »
// devenue incohérente (brouillon enregistré avant le verrou, données
// importées, édition ancienne) faisait lever `computeBilledTotal` PENDANT le
// rendu React ⇒ error boundary ⇒ écran de caisse mort. La voie de secours
// doit afficher « — » (jamais un faux 0,00 DZD) et journaliser le détail.
import { describe, it, expect, vi, afterEach } from "vitest";
import { safeLineTotal } from "@features/sales/sell/CartPanel.tsx";
import type { CartLine } from "@/application/sales/create-sale.ts";

function amountLine(billedTotalMinor: number): CartLine {
  return {
    key: "l1",
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("safeLineTotal (ADR-132)", () => {
  it("calcule le montant d'une ligne cohérente", () => {
    expect(safeLineTotal(amountLine(5000))).toBe(5000);
  });

  it("renvoie null SANS lever pour une ligne incohérente, et journalise", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // 5 000 000 centimes pour 0,071 kg à 700,00 DZD : hors tolérance.
    expect(safeLineTotal(amountLine(5_000_000))).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("renvoie null sans lever pour un montant non entier", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(safeLineTotal(amountLine(5000.5))).toBeNull();
    expect(spy).toHaveBeenCalled();
  });
});
