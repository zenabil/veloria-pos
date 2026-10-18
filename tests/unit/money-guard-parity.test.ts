// Veloria PoS — Tests R7 : parité money-guard (main) / domaine.
// Fail-closed : tout écart de bornes ou d'arithmétique entre
// `electron/ipc/money-guard.ts` et `src/domain/money/money.ts` casse ici
// AVANT la production (cause racine D2).
import { describe, it, expect } from "vitest";
import {
  MONEY_MAX_SINGLE_MINOR,
  MONEY_MAX_TOTAL_MINOR,
  priceLine,
  percentOfTotal,
} from "../../electron/ipc/money-guard.ts";
import {
  MAX_MINOR_SINGLE,
  MAX_MINOR_TOTAL,
  multiplyMinorByQuantity,
  percentOfMinor,
} from "@/domain/money/money.ts";

describe("R7 : bornes main/domaine identiques", () => {
  it("plafonds miroirs", () => {
    expect(MONEY_MAX_SINGLE_MINOR).toBe(MAX_MINOR_SINGLE);
    expect(MONEY_MAX_TOTAL_MINOR).toBe(MAX_MINOR_TOTAL);
  });
});

describe("R7 : priceLine(main) = domaine(multiplyMinorByQuantity)", () => {
  const vectors = [
    { unit: 1500, original: 1500, qty: 2 },
    { unit: 1200, original: 1500, qty: 3 },
    { unit: 0, original: 500, qty: 1 },
    { unit: 199, original: 199, qty: 0.5 },
  ];
  for (const v of vectors) {
    it(`unit=${v.unit} original=${v.original} qty=${v.qty}`, () => {
      const main = priceLine({
        unitPriceMinor: v.unit,
        originalUnitPriceMinor: v.original,
        quantity: v.qty,
      });
      expect(main.charged).toBe(multiplyMinorByQuantity(v.unit, v.qty));
      expect(main.original).toBe(multiplyMinorByQuantity(v.original, v.qty));
      expect(main.discount).toBe(
        multiplyMinorByQuantity(v.original, v.qty) - multiplyMinorByQuantity(v.unit, v.qty),
      );
    });
  }
  it("rejette les mêmes hors-bornes", () => {
    expect(() =>
      priceLine({ unitPriceMinor: -1, originalUnitPriceMinor: 0, quantity: 1 }),
    ).toThrow();
    expect(() =>
      priceLine({
        unitPriceMinor: MONEY_MAX_SINGLE_MINOR + 1,
        originalUnitPriceMinor: 0,
        quantity: 1,
      }),
    ).toThrow();
    expect(() =>
      priceLine({ unitPriceMinor: 100, originalUnitPriceMinor: 100, quantity: 0 }),
    ).toThrow();
  });
});

describe("R7 : percentOfTotal(main) = percentOfMinor(domaine)", () => {
  for (const [net, rate] of [
    [55000, 2.5],
    [100000, 2.5],
    [1, 100],
  ] as Array<[number, number]>) {
    it(`net=${net} taux=${rate}`, () => {
      expect(percentOfTotal(net, rate)).toBe(percentOfMinor(net, rate));
    });
  }
});
