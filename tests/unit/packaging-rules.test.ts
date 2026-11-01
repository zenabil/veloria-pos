// Veloria PoS — Domaine conditionnement : découpage, tarif carton, coûts.
import { describe, it, expect } from "vitest";
import {
  allocateUnitCostLayers,
  priceSaleLine,
  splitQuantityByCarton,
} from "@domain/packaging/packaging-rules.ts";
import {
  expandSaleLine,
  packagingDisplay,
  saleLineTotal,
} from "@/application/sales/packaging-lines.ts";
import type { CartLine } from "@/application/sales/create-sale.ts";
import { proformaOperationKey } from "@features/sales/proforma-op.ts";

function cartLine(over: Partial<CartLine> = {}): CartLine {
  return {
    key: "l1",
    productId: 1,
    productName: "Coca 1L",
    unitCode: "PIECE",
    originalUnitPriceMinor: 2000,
    unitPriceMinor: 2000,
    purchasePriceMinor: 1500,
    quantity: 15,
    packagingId: 7,
    packagingLabelFr: "Carton de 12",
    packagingFactor: 12,
    packagingSellingPriceMinor: 22000,
    packagingAutoCartonPricing: true,
    packagingPriceOverridden: false,
    ...over,
  };
}

describe("splitQuantityByCarton", () => {
  it("découpe les cartons complets et le reste en pièces", () => {
    expect(splitQuantityByCarton(0, 12)).toEqual({ cartons: 0, pieces: 0 });
    expect(splitQuantityByCarton(11, 12)).toEqual({ cartons: 0, pieces: 11 });
    expect(splitQuantityByCarton(12, 12)).toEqual({ cartons: 1, pieces: 0 });
    expect(splitQuantityByCarton(15, 12)).toEqual({ cartons: 1, pieces: 3 });
    expect(splitQuantityByCarton(24, 12)).toEqual({ cartons: 2, pieces: 0 });
    expect(splitQuantityByCarton(15.5, 12)).toEqual({ cartons: 1, pieces: 3.5 });
  });

  it("refuse un facteur non entier ou ≤ 1 et une quantité négative", () => {
    expect(() => splitQuantityByCarton(10, 1)).toThrow(/Taille du carton/);
    expect(() => splitQuantityByCarton(10, 2.5)).toThrow(/Taille du carton/);
    expect(() => splitQuantityByCarton(-1, 12)).toThrow(/Quantité/);
  });
});

describe("priceSaleLine", () => {
  it("sous le seuil : une seule ligne pièce", () => {
    const r = priceSaleLine({
      qty: 11,
      unitPriceMinor: 2000,
      cartonPriceMinor: 22000,
      factor: 12,
      auto: true,
    });
    expect(r.cartonApplied).toBe(false);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ quantity: 11, unitFactor: 1, unitPriceMinor: 2000 });
    expect(r.totalMinor).toBe(22000);
  });

  it("au seuil : 1 carton au tarif carton, reste au prix pièce", () => {
    const r = priceSaleLine({
      qty: 15,
      unitPriceMinor: 2000,
      cartonPriceMinor: 22000,
      factor: 12,
      auto: true,
    });
    expect(r.cartonApplied).toBe(true);
    expect(r.cartons).toBe(1);
    expect(r.pieces).toBe(3);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({
      quantity: 1,
      unitFactor: 12,
      unitPriceMinor: 22000,
      originalUnitPriceMinor: 24000,
      isCarton: true,
    });
    expect(r.lines[1]).toMatchObject({
      quantity: 3,
      unitFactor: 1,
      unitPriceMinor: 2000,
      originalUnitPriceMinor: 2000,
      isCarton: false,
    });
    expect(r.totalMinor).toBe(28000);
    expect(r.pieceTotalMinor).toBe(30000);
    expect(r.savingsMinor).toBe(2000);
  });

  it("plusieurs cartons : total exact et économie multipliée", () => {
    const r = priceSaleLine({
      qty: 24,
      unitPriceMinor: 2000,
      cartonPriceMinor: 22000,
      factor: 12,
      auto: true,
    });
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]?.quantity).toBe(2);
    expect(r.totalMinor).toBe(44000);
    expect(r.savingsMinor).toBe(4000);
  });

  it("auto=false ou prix carton non avantageux : aucune règle carton", () => {
    const disabled = priceSaleLine({
      qty: 15,
      unitPriceMinor: 2000,
      cartonPriceMinor: 22000,
      factor: 12,
      auto: false,
    });
    expect(disabled.cartonApplied).toBe(false);
    expect(disabled.totalMinor).toBe(30000);

    const equal = priceSaleLine({
      qty: 15,
      unitPriceMinor: 2000,
      cartonPriceMinor: 24000,
      factor: 12,
      auto: true,
    });
    expect(equal.cartonApplied).toBe(false);
    expect(equal.totalMinor).toBe(30000);
  });

  it("tarif de gros réel sous (facteur−1) × pièce : appliqué (ADR-141)", () => {
    // Cas propriétaire : œufs 25 DZD/pièce, carton de 30 à 650 DZD.
    // 29 pièces = 725 DZD, mais 30 pièces = 650 DZD : la baisse au seuil est
    // le tarif de gros voulu, pas une anomalie.
    const at29 = priceSaleLine({
      qty: 29,
      unitPriceMinor: 2500,
      cartonPriceMinor: 65000,
      factor: 30,
      auto: true,
    });
    expect(at29.cartonApplied).toBe(false);
    expect(at29.totalMinor).toBe(72500);

    const at30 = priceSaleLine({
      qty: 30,
      unitPriceMinor: 2500,
      cartonPriceMinor: 65000,
      factor: 30,
      auto: true,
    });
    expect(at30.cartonApplied).toBe(true);
    expect(at30.cartons).toBe(1);
    expect(at30.pieces).toBe(0);
    expect(at30.totalMinor).toBe(65000);
    expect(at30.savingsMinor).toBe(10000);

    const at34 = priceSaleLine({
      qty: 34,
      unitPriceMinor: 2500,
      cartonPriceMinor: 65000,
      factor: 30,
      auto: true,
    });
    expect(at34.cartonApplied).toBe(true);
    expect(at34.totalMinor).toBe(75000); // 650 + 4 × 25
    expect(at34.savingsMinor).toBe(10000); // vs 34 × 25 = 850
  });

  it("un carton aussi cher ou plus cher qu'un plein au prix pièce est ignoré", () => {
    for (const cartonPrice of [24000, 25000]) {
      const r = priceSaleLine({
        qty: 12,
        unitPriceMinor: 2000,
        cartonPriceMinor: cartonPrice,
        factor: 12,
        auto: true,
      });
      expect(r.cartonApplied, `carton=${cartonPrice}`).toBe(false);
      expect(r.totalMinor).toBe(24000);
    }
  });
});

describe("allocation des coûts par paliers", () => {
  it("répartit au plus grand reste en 1 ou 2 paliers exacts", () => {
    expect(allocateUnitCostLayers(10000, 3)).toEqual([
      { quantity: 2, unitCostMinor: 3333 },
      { quantity: 1, unitCostMinor: 3334 },
    ]);
    const sum = allocateUnitCostLayers(10000, 3).reduce(
      (a, t) => a + t.quantity * t.unitCostMinor,
      0,
    );
    expect(sum).toBe(10000);
  });

  it("total exact sur quantités décimales et total nul", () => {
    const layers = allocateUnitCostLayers(100000, 35.5);
    expect(layers.reduce((a, t) => a + t.quantity * t.unitCostMinor, 0)).toBe(100000);
    expect(allocateUnitCostLayers(0, 4)).toEqual([{ quantity: 4, unitCostMinor: 0 }]);
  });

  it("refuse un total ou une quantité invalide", () => {
    expect(() => allocateUnitCostLayers(-1, 3)).toThrow();
    expect(() => allocateUnitCostLayers(100, 0)).toThrow();
    expect(() => allocateUnitCostLayers(1.5, 3)).toThrow();
  });
});

describe("projection caisse (packaging-lines)", () => {
  it("éclate 15 pièces en 1 carton + 3 pièces, avec prix d'achat par unité", () => {
    const lines = expandSaleLine(cartLine());
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      quantity: 1,
      unitFactor: 12,
      packagingId: 7,
      unitCode: "Carton de 12",
      unitPriceMinor: 22000,
      originalUnitPriceMinor: 24000,
      purchasePriceMinor: 18000,
      isCarton: true,
    });
    expect(lines[1]).toMatchObject({
      quantity: 3,
      unitFactor: 1,
      packagingId: null,
      unitCode: "PIÈCE",
      unitPriceMinor: 2000,
      purchasePriceMinor: 1500,
    });
    expect(saleLineTotal(cartLine())).toBe(28000);
    expect(packagingDisplay(cartLine())).toMatchObject({
      cartons: 1,
      pieces: 3,
      cartonApplied: true,
      manualPrice: false,
      savingsMinor: 2000,
    });
  });

  it("prix manuel : règle carton désactivée et badge explicite", () => {
    const line = cartLine({ unitPriceMinor: 1900, packagingPriceOverridden: true });
    expect(expandSaleLine(line)).toHaveLength(1);
    expect(saleLineTotal(line)).toBe(28500);
    const display = packagingDisplay(line);
    expect(display?.cartonApplied).toBe(false);
    expect(display?.manualPrice).toBe(true);
  });

  it("mode Montant : jamais de découpage carton", () => {
    const line = cartLine({ billedTotalMinor: 28000 });
    const lines = expandSaleLine(line);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.billedTotalMinor).toBe(28000);
    expect(lines[0]?.quantity).toBe(15);
  });

  it("sous le seuil : une seule ligne pièce", () => {
    expect(expandSaleLine(cartLine({ quantity: 5 }))).toHaveLength(1);
    expect(saleLineTotal(cartLine({ quantity: 5 }))).toBe(10000);
  });
});

describe("proformaOperationKey", () => {
  it("change dès qu'un réglage carton change (jamais de devis périmé rejoué)", () => {
    const base = cartLine();
    const same = proformaOperationKey(null, [cartLine()]);
    expect(proformaOperationKey(null, [base])).toBe(same);
    expect(proformaOperationKey(null, [cartLine({ packagingSellingPriceMinor: 23000 })])).not.toBe(
      same,
    );
    expect(proformaOperationKey(null, [cartLine({ packagingFactor: 6 })])).not.toBe(same);
    expect(proformaOperationKey(null, [cartLine({ packagingPriceOverridden: true })])).not.toBe(
      same,
    );
  });
});
