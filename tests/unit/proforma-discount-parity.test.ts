// Veloria PoS — E-20 : parité de la répartition d'une remise GLOBALE de devis
// entre le DOMAINE (src/domain/proforma/proforma-rules.ts) et le MIROIR MAIN
// (electron/ipc/handlers/amount-allocation.ts).
// electron/ ne peut pas importer src/ (rootDir — ADR-062, STRUCTURE §8.3) :
// la parité est donc prouvée par ce test (fail-closed au moindre écart).
import { describe, it, expect } from "vitest";
import { allocateGlobalDiscount } from "@domain/proforma/proforma-rules.ts";
import { allocateAmountByWeights } from "../../electron/ipc/handlers/amount-allocation";

const VECTORS: { weights: number[]; amount: number }[] = [
  { weights: [2000], amount: 500 },
  { weights: [2000], amount: 2000 },
  { weights: [2000], amount: 0 },
  { weights: [1000, 1000], amount: 1 },
  { weights: [1000, 1000], amount: 999 },
  { weights: [333, 333, 334], amount: 100 },
  { weights: [10000, 5000, 2500], amount: 1234 },
  { weights: [1, 1, 1], amount: 2 },
  { weights: [7], amount: 3 },
  { weights: [12345, 6789, 4321], amount: 9999 },
  { weights: [500, 1500], amount: 777 },
];

describe("E-20 : parité domaine ↔ main de la répartition de remise", () => {
  for (const v of VECTORS) {
    it(`Σ exacte pour ${JSON.stringify(v.weights)} / ${v.amount}`, () => {
      const domain = allocateGlobalDiscount(v.weights, v.amount);
      const main = allocateAmountByWeights(v.weights, v.amount);
      expect(main).toEqual(domain);
      // Invariant central : la somme des parts vaut EXACTEMENT le montant.
      expect(domain.reduce((a, b) => a + b, 0)).toBe(v.amount);
      // Chaque part reste dans les bornes de sa ligne.
      domain.forEach((part, i) => {
        expect(part).toBeGreaterThanOrEqual(0);
        expect(part).toBeLessThanOrEqual(v.weights[i] ?? 0);
      });
    });
  }

  it("remise > sous-total : refus des deux côtés", () => {
    expect(() => allocateGlobalDiscount([1000], 1001)).toThrow();
    expect(() => allocateAmountByWeights([1000], 1001)).toThrow();
  });

  it("montant négatif ou non entier : refus des deux côtés", () => {
    expect(() => allocateGlobalDiscount([1000], -1)).toThrow();
    expect(() => allocateAmountByWeights([1000], -1)).toThrow();
    expect(() => allocateAmountByWeights([1000], 1.5)).toThrow();
  });
});
