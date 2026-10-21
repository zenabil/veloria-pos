// Veloria PoS — Tests P3-b : unités, codes-barres, marges, crédit, comptage.
import { describe, it, expect } from "vitest";
import { convertQuantity, normalizeUnitCodeStrict } from "@/domain/units/units.ts";
import { barcodeKind, validateBarcode } from "@/domain/barcode/barcode-rules.ts";
import { evaluateMargin } from "@/domain/pricing/price-rules.ts";
import { daysOverdue, settlementDueThisMonth } from "@/domain/customer/credit-policy.ts";
import { countCash } from "@/domain/closings/cash-count.ts";

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

describe("P3-b : credit-policy", () => {
  // W7 (E-30) : `agingBucket` (tranches d'ancienneté) a été supprimé — code
  // mort : aucun écran ne l'utilisait. L'état « en retard » est désormais
  // produit par la règle E-30 (vente ouverte échue) côté main.
  it("retard calendaire + jour de règlement", () => {
    expect(daysOverdue("2026-09-01", "2026-09-20")).toBe(19);
    expect(daysOverdue("2026-09-20", "2026-09-20")).toBe(0);
    expect(daysOverdue("2026-09-25", "2026-09-20")).toBe(0);
    expect(settlementDueThisMonth(15, "2026-09-20")).toBe(true);
    expect(settlementDueThisMonth(25, "2026-09-20")).toBe(false);
    expect(settlementDueThisMonth(null, "2026-09-20")).toBe(false);
  });
  // W7 (D-06) : les branches d'erreur sont désormais couvertes (le seuil de
  // couverture par fichier est de 80 % des lignes / 75 % des branches).
  it("refuse les dates et les jours de règlement invalides (FR)", () => {
    expect(() => daysOverdue("pas-une-date", "2026-09-20")).toThrow();
    expect(() => daysOverdue("2026-09-01", "")).toThrow();
    expect(() => settlementDueThisMonth(0, "2026-09-20")).toThrow();
    expect(() => settlementDueThisMonth(32, "2026-09-20")).toThrow();
    expect(() => settlementDueThisMonth(15, "pas-une-date")).toThrow();
  });
});

describe("P3-b : cash-count", () => {
  const base = {
    expectedCashMinor: 100000,
    expectedChequeMinor: 20000,
    expectedTransferMinor: 0,
    countedCashMinor: 100000,
    countedChequeMinor: 20000,
    countedTransferMinor: 0,
  };
  it("équilibré → variance 0", () => {
    const r = countCash(base);
    expect(r).toMatchObject({
      expectedTotalMinor: 120000,
      countedTotalMinor: 120000,
      varianceMinor: 0,
      balanced: true,
    });
  });
  it("manquant → variance négative", () => {
    const r = countCash({ ...base, countedCashMinor: 99500 });
    expect(r.varianceMinor).toBe(-500);
    expect(r.balanced).toBe(false);
  });
  it("rejette les montants invalides", () => {
    expect(() => countCash({ ...base, countedCashMinor: -1 })).toThrow();
  });
});
