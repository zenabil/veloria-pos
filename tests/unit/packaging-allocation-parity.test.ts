// Veloria PoS — Parité allocation de coût (domaine ↔ main).
// electron/ ne peut pas importer src/ : le miroir est verrouillé ici.
import { describe, it, expect } from "vitest";
import { allocateUnitCostLayers as domainLayers } from "@domain/packaging/packaging-rules.ts";
import { allocateUnitCostLayers as mainLayers } from "../../electron/ipc/handlers/cost-allocation.ts";

describe("Parité allocation des coûts d'achat", () => {
  const cases: [number, number][] = [
    [0, 1],
    [10000, 3],
    [67000, 34],
    [100000, 35.5],
    [999, 7],
    [1, 1],
    [123456789, 97],
  ];

  it("mêmes paliers que le domaine", () => {
    for (const [total, qty] of cases) {
      expect(mainLayers(total, qty), `layers ${total}/${qty}`).toEqual(domainLayers(total, qty));
    }
  });

  it("somme exacte dans les deux implémentations", () => {
    for (const [total, qty] of cases) {
      for (const layers of [domainLayers(total, qty), mainLayers(total, qty)]) {
        const sum = Math.round(layers.reduce((a, t) => a + t.quantity * t.unitCostMinor, 0));
        expect(sum).toBe(total);
      }
    }
  });
});
