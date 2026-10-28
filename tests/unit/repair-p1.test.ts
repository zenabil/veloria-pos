// Veloria POS — P1 regression: M-1 proforma key + M-6 stock single source.
import { describe, it, expect } from "vitest";
import { proformaOperationKey } from "@/features/sales/proforma-op.ts";
import { computeAdjustmentNewStock } from "@/domain/inventory/stock-rules.ts";

describe("M-1 : stable proforma operation key", () => {
  const lines = [
    { productId: 1, productName: "Farine", unitPriceMinor: 5000, quantity: 2 },
    { productId: null, productName: "Article libre", unitPriceMinor: 1000, quantity: 1 },
  ];
  it("même panier => même clé (retry rejoue le même operationId)", () => {
    expect(proformaOperationKey(7, lines)).toBe(proformaOperationKey(7, lines));
  });
  it("panier modifié => nouvelle clé (nouvelle opération)", () => {
    expect(proformaOperationKey(7, lines)).not.toBe(
      proformaOperationKey(7, [
        ...lines,
        { productId: 2, productName: "X", unitPriceMinor: 1, quantity: 1 },
      ]),
    );
    expect(proformaOperationKey(7, lines)).not.toBe(proformaOperationKey(8, lines));
    expect(proformaOperationKey(7, lines)).not.toBe(
      proformaOperationKey(7, [
        { productId: 1, productName: "Farine", unitPriceMinor: 5000, quantity: 3 },
      ]),
    );
  });
});

describe("M-6 : source unique du stock négatif", () => {
  it("computeAdjustmentNewStock refuse le négatif (fail closed)", () => {
    expect(computeAdjustmentNewStock({ currentQty: 10, kind: "out", quantity: 4 })).toBe(6);
    expect(() => computeAdjustmentNewStock({ currentQty: 2, kind: "out", quantity: 5 })).toThrow(
      /négatif/,
    );
  });
});
