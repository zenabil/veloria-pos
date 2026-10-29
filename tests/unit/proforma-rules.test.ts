// Veloria PoS — règles proforma : bornes et refus (branches défensives).
// Vitest 5/V8 compte les branches différemment de Vitest 3 : ces cas couvrent
// les gardes réellement exécutables (devis vide, >500 lignes, ligne sans nom,
// remise > sous-total) sans toucher aux seuils de couverture.
import { describe, it, expect } from "vitest";
import { allocateGlobalDiscount, computeProformaTotals } from "@domain/proforma/proforma-rules.ts";

interface ProformaLine {
  productId: null;
  productName: string;
  unitPriceMinor: number;
  quantity: number;
}

const line = (over: Partial<ProformaLine> = {}): ProformaLine => ({
  productId: null,
  productName: "Ligne",
  unitPriceMinor: 100,
  quantity: 1,
  ...over,
});

describe("proforma-rules — bornes", () => {
  it("refuse un devis vide (totaux et répartition)", () => {
    expect(() => computeProformaTotals([], 0, 0)).toThrow(/vide/i);
    expect(() => allocateGlobalDiscount([], 0)).toThrow(/vide/i);
  });

  it("refuse plus de 500 lignes", () => {
    const lines = Array.from({ length: 501 }, () => line());
    expect(() => computeProformaTotals(lines, 0, 0)).toThrow(/volumineux/i);
  });

  it("refuse une ligne sans nom", () => {
    expect(() => computeProformaTotals([line({ productName: "   " })], 0, 0)).toThrow(/sans nom/i);
  });

  it("refuse une remise supérieure au sous-total", () => {
    expect(() => computeProformaTotals([line()], 101, 0)).toThrow(/dépasse/i);
  });

  it("répartit exactement une remise sur des lignes de poids égal", () => {
    const parts = allocateGlobalDiscount([1, 1], 1);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(parts.every((p) => p >= 0 && p <= 1)).toBe(true);
  });
});
