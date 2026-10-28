// Veloria PoS — Tests P3-b : unités, codes-barres, marges.
import { describe, it, expect } from "vitest";
import { convertQuantity, normalizeUnitCodeStrict } from "@/domain/units/units.ts";
import { barcodeKind, validateBarcode } from "@/domain/barcode/barcode-rules.ts";
import { evaluateMargin } from "@/domain/pricing/price-rules.ts";

describe("P3-b : units", () => {
  it("valide les codes et convertit le métrique", () => {
    expect(normalizeUnitCodeStrict("kg")).toBe("KG");
    expect(() => normalizeUnitCodeStrict("XYZ")).toThrow();
    expect(convertQuantity(2, "KG", "G")).toBe(2000);
    expect(convertQuantity(1500, "G", "KG")).toBe(1.5);
    expect(convertQuantity(1, "L", "ML")).toBe(1000);
    expect(convertQuantity(1, "CARTON", "PIECE")).toBe(null);
    expect(convertQuantity(1, "KG", "L")).toBe(null);
    expect(convertQuantity(-1, "KG", "G")).toBe(null);
  });
});

describe("P3-b : barcode EAN", () => {
  it("contrôle EAN-8/13, tolère les autres", () => {
    expect(barcodeKind("96385074")).toBe("ean8");
    expect(barcodeKind("6111250223456")).toBe("ean13");
    expect(barcodeKind("619001")).toBe("other");
    expect(validateBarcode("619001").kind).toBe("other");
    // EAN-13 valide : 5901234123457 (clé 7).
    expect(validateBarcode("5901234123457").kind).toBe("ean13");
    expect(() => validateBarcode("5901234123456")).toThrow("clé de contrôle");
    expect(() => validateBarcode("")).toThrow();
    expect(() => validateBarcode("x".repeat(65))).toThrow();
  });
});

describe("P3-b : price-rules", () => {
  it("expose marge + alerte sous-coût (sans rejeter)", () => {
    expect(evaluateMargin(8000, 10000)).toMatchObject({
      marginMinor: 2000,
      marginPct: 25,
      belowCost: false,
    });
    expect(evaluateMargin(8000, 7000).belowCost).toBe(true);
    expect(evaluateMargin(0, 5000)).toMatchObject({ marginPct: null, belowCost: false });
  });
});
