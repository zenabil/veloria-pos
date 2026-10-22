// Veloria PoS — Domaine ventes : remise SIGNÉE (majoration) + montant facturé
// exact (mode « Montant » ADR-114) — régression des bugs caisse du 2026-10-21.
//
// 1) Une ligne facturée AU-DESSUS de son prix d'origine (majoration) donne
//    une remise NÉGATIVE : le domaine l'admet (migration 0051 : la base
//    l'admet aussi) — avant, la vente était refusée par la base
//    (« CHECK constraint failed: discount_amount_minor >= 0 »).
// 2) Le mode « Montant » facture le montant SAISI (50,00 DZD), pas le poids
//    arrondi × le prix (49,70 DZD) — le montant saisi est carried par la
//    ligne (`billedTotalMinor`) et validé (borne d'arrondi).
import { describe, it, expect } from "vitest";
import {
  billedAmountToleranceMinor,
  computeBilledTotal,
  computeLineDiscount,
  computeSaleTotals,
} from "@domain/sales/sale-rules.ts";

function line(
  over: Partial<Parameters<typeof computeLineDiscount>[0]> = {},
): Parameters<typeof computeLineDiscount>[0] {
  return {
    productId: null,
    productName: "Article",
    unitCode: "PIECE",
    originalUnitPriceMinor: 10000,
    unitPriceMinor: 10000,
    purchasePriceMinor: 0,
    quantity: 1,
    ...over,
  };
}

describe("remise de ligne SIGNÉE (majoration autorisée)", () => {
  it("prix facturé > prix d'origine : remise négative, total recomposé", () => {
    const l = line({ originalUnitPriceMinor: 500, unitPriceMinor: 50000 });
    const d = computeLineDiscount(l);
    expect(d.chargedMinor).toBe(50000);
    expect(d.discountMinor).toBe(-49500);
    const totals = computeSaleTotals({ lines: [l], deliveryFeeMinor: 0, amountPaidMinor: 0 });
    expect(totals.discountAmountMinor).toBe(-49500);
    expect(totals.totalMinor).toBe(50000);
    expect(totals.remainingMinor).toBe(50000);
  });

  it("remise classique (prixabaissé) : inchangée", () => {
    const d = computeLineDiscount(line({ originalUnitPriceMinor: 90000, unitPriceMinor: 70000 }));
    expect(d.discountMinor).toBe(20000);
  });

  it("prix d'origine invalide → refus FR (jamais de remise silencieuse)", () => {
    expect(() => computeLineDiscount(line({ originalUnitPriceMinor: -1 }))).toThrow(
      /Prix d'origine invalide/,
    );
  });
});

describe("montant facturé EXACT (mode « Montant » ADR-114)", () => {
  it("sans montant saisi : facturation prix × quantité (règle par défaut)", () => {
    expect(computeBilledTotal(line({ quantity: 2 }))).toBe(20000);
  });

  it("montant saisi : facturé tel quel (50,00 DZD à 700 DZD/kg)", () => {
    const l = line({
      unitCode: "KG",
      originalUnitPriceMinor: 70000,
      unitPriceMinor: 70000,
      quantity: 0.071,
      billedTotalMinor: 5000,
    });
    expect(computeBilledTotal(l)).toBe(5000);
    // La remise devient négative (le total facturé > total catalogue).
    expect(computeLineDiscount(l).discountMinor).toBe(4970 - 5000);
    const totals = computeSaleTotals({ lines: [l], deliveryFeeMinor: 0, amountPaidMinor: 5000 });
    expect(totals.totalMinor).toBe(5000);
    expect(totals.remainingMinor).toBe(0);
  });

  it("montant saisi hors tolérance (gonflement) → refus FR", () => {
    const l = line({
      originalUnitPriceMinor: 70000,
      unitPriceMinor: 70000,
      quantity: 0.071,
      billedTotalMinor: 90000,
    });
    expect(() => computeBilledTotal(l)).toThrow(/Montant facturé de ligne incohérent/);
  });

  it("montant saisi non entier / nul → refus FR", () => {
    expect(() => computeBilledTotal(line({ billedTotalMinor: 5000.5 }))).toThrow(
      /Montant facturé de ligne invalide/,
    );
    expect(() => computeBilledTotal(line({ billedTotalMinor: 0 }))).toThrow(
      /Montant facturé de ligne invalide/,
    );
  });

  it("tolérance = arrondi de la quantité à 3 décimales (0,0005 × prix + 1)", () => {
    expect(billedAmountToleranceMinor(70000)).toBe(36);
    expect(billedAmountToleranceMinor(45000)).toBe(24);
  });
});

describe("panier MIXTE (libre + poids + catalogue + remise) : le total se recompose", () => {
  it("quatre lignes : sous-total, remise signée et total cohérents", () => {
    const lines = [
      line({ productName: "Sachet", originalUnitPriceMinor: 10000, unitPriceMinor: 10000 }),
      line({
        productName: "Bil (KG)",
        unitCode: "KG",
        originalUnitPriceMinor: 70000,
        unitPriceMinor: 70000,
        quantity: 0.071,
        billedTotalMinor: 5000,
      }),
      line({ productName: "Huile", originalUnitPriceMinor: 5000, unitPriceMinor: 5000 }),
      line({ productName: "Sucre", originalUnitPriceMinor: 5000, unitPriceMinor: 4000 }),
    ];
    const totals = computeSaleTotals({ lines, deliveryFeeMinor: 0, amountPaidMinor: 0 });
    // sous-total = Σ origine × qté = 10000 + 4970 + 5000 + 5000
    expect(totals.subtotalMinor).toBe(24970);
    // remise = (10000-10000) + (4970-5000) + (5000-5000) + (5000-4000)
    //          = 0 + (-30) + 0 + 1000
    expect(totals.discountAmountMinor).toBe(970);
    // total = Σ facturé = 10000 + 5000 + 5000 + 4000
    expect(totals.totalMinor).toBe(24000);
    expect(totals.lineTotalsMinor).toEqual([10000, 5000, 5000, 4000]);
  });
});
