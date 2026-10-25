// Veloria PoS — Domaine conditionnement : découpage, tarif carton, coûts.
import { describe, it, expect } from "vitest";
import {
  allocateUnitCostLayers,
  allocateUnitCosts,
  priceSaleLine,
  splitQuantityByCarton,
  toBaseQuantity,
} from "@domain/packaging/packaging-rules.ts";
import {
  expandSaleLine,
  packagingDisplay,
  saleLineTotal,
} from "@/application/sales/packaging-lines.ts";
import type { CartLine } from "@/application/sales/create-sale.ts";

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

  it("monotonicité : le total ne baisse jamais quand la quantité augmente", () => {
    for (const cartonPrice of [22000, 10000, 24000]) {
      let previous = 0;
      for (let qty = 1; qty <= 40; qty += 1) {
        const total = priceSaleLine({
          qty,
          unitPriceMinor: 2000,
          cartonPriceMinor: cartonPrice,
          factor: 12,
          auto: true,
        }).totalMinor;
        expect(total, `qty=${qty} carton=${cartonPrice}`).toBeGreaterThanOrEqual(previous);
        previous = total;
      }
    }
  });

  it("un prix carton trop bas (sous factor−1 pièces) est ignoré", () => {
    const r = priceSaleLine({
      qty: 12,
      unitPriceMinor: 2000,
      cartonPriceMinor: 10000,
      factor: 12,
      auto: true,
    });
    expect(r.cartonApplied).toBe(false);
    expect(r.totalMinor).toBe(24000);
  });
});

describe("toBaseQuantity", () => {
  it("convertit une quantité d'achat en unités de base", () => {
    expect(toBaseQuantity(3, 12)).toBe(36);
    expect(toBaseQuantity(1.5, 1)).toBe(1.5);
    expect(() => toBaseQuantity(1, 0)).toThrow(/Facteur/);
  });
});

describe("allocateUnitCosts / layers", () => {
  it("répartit au plus grand reste en 1 ou 2 paliers exacts", () => {
    expect(allocateUnitCosts(10000, 3)).toEqual([3333, 3334]);
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
    expect(allocateUnitCosts(0, 4)).toEqual([0]);
    expect(allocateUnitCostLayers(0, 4)).toEqual([{ quantity: 4, unitCostMinor: 0 }]);
  });

  it("refuse un total ou une quantité invalide", () => {
    expect(() => allocateUnitCosts(-1, 3)).toThrow();
    expect(() => allocateUnitCosts(100, 0)).toThrow();
    expect(() => allocateUnitCosts(1.5, 3)).toThrow();
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
