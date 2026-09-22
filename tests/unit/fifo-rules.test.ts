// Veloria PoS — Tests : allocation FIFO pure (domaine, sans Electron).
// Montants en centimes (mineurs DZD). Règle : FIFO = coût, jamais prix de vente.
import { describe, it, expect } from "vitest";
import { allocateFifo, grossProfitOf, oversellCost } from "@domain/inventory/fifo-rules.ts";

describe("FIFO allocation (domain)", () => {
  it("Test 1 : 10×20, vente 3×25 → COGS 60, revenu 75, profit 15", () => {
    const alloc = allocateFifo([{ id: 1, remainingQty: 10, unitCostMinor: 2000 }], 3);
    expect(alloc.shortQty).toBe(0);
    expect(alloc.cogsMinor).toBe(6000);
    expect(alloc.consumptions).toHaveLength(1);
    expect(alloc.consumptions[0]).toMatchObject({ layerId: 1, quantity: 3, unitCostMinor: 2000 });
    expect(grossProfitOf(7500, alloc.cogsMinor)).toBe(1500);
  });

  it("Test 2 : 10×20 puis 10×24, vente 3×30 → coût 20 (première couche)", () => {
    const alloc = allocateFifo(
      [
        { id: 1, remainingQty: 10, unitCostMinor: 2000 },
        { id: 2, remainingQty: 10, unitCostMinor: 2400 },
      ],
      3,
    );
    expect(alloc.cogsMinor).toBe(6000);
    expect(alloc.consumptions).toHaveLength(1);
    expect(alloc.consumptions[0]?.layerId).toBe(1);
    expect(grossProfitOf(9000, alloc.cogsMinor)).toBe(3000);
  });

  it("Tests 3+14 : 10×20 puis 10×24, vente 15×30 → 10×20 + 5×24 = 320, profit 130", () => {
    const alloc = allocateFifo(
      [
        { id: 1, remainingQty: 10, unitCostMinor: 2000 },
        { id: 2, remainingQty: 10, unitCostMinor: 2400 },
      ],
      15,
    );
    expect(alloc.shortQty).toBe(0);
    expect(alloc.consumptions).toHaveLength(2);
    expect(alloc.cogsMinor).toBe(10 * 2000 + 5 * 2400);
    expect(grossProfitOf(15 * 3000, alloc.cogsMinor)).toBe(45000 - 32000);
  });

  it("saute les couches vides et signale le manque sans consommer partiellement", () => {
    const alloc = allocateFifo(
      [
        { id: 1, remainingQty: 0, unitCostMinor: 2000 },
        { id: 2, remainingQty: 2, unitCostMinor: 2000 },
      ],
      5,
    );
    expect(alloc.shortQty).toBe(3);
    expect(alloc.cogsMinor).toBe(4000);
    expect(alloc.consumptions).toHaveLength(1);
  });

  it("quantités fractionnaires (kg, 3 décimales) sans dérive", () => {
    const alloc = allocateFifo([{ id: 1, remainingQty: 2.5, unitCostMinor: 199 }], 1.1);
    expect(alloc.shortQty).toBe(0);
    expect(alloc.cogsMinor).toBe(Math.round(199 * 1.1));
    expect(alloc.consumptions[0]?.quantity).toBeCloseTo(1.1, 9);
  });

  it("survente : coût de substitution explicite (dernière couche connue)", () => {
    const alloc = allocateFifo([{ id: 1, remainingQty: 2, unitCostMinor: 2000 }], 5);
    expect(alloc.shortQty).toBe(3);
    const extra = oversellCost({ shortQty: alloc.shortQty, fallbackUnitCostMinor: 2400 });
    expect(extra.costMinor).toBe(7200);
    expect(alloc.cogsMinor + extra.costMinor).toBe(4000 + 7200);
  });

  it("seuil 1e14 : coût unitaire 1e9 × quantité 5 passe (5e9 ≤ 1e11)", () => {
    const alloc = allocateFifo([{ id: 1, remainingQty: 10, unitCostMinor: 1_000_000_000 }], 5);
    expect(alloc.shortQty).toBe(0);
    expect(alloc.cogsMinor).toBe(5_000_000_000);
  });

  it("seuil 1e14 : coût unitaire 1e9 × quantité 101 rejeté (1,01e14 > 1e14)", () => {
    expect(() =>
      allocateFifo([{ id: 1, remainingQty: 200, unitCostMinor: 1_000_000_000 }], 101),
    ).toThrow();
  });

  it("rejette : quantité invalide, couche à coût négatif, trop de décimales", () => {
    expect(() => allocateFifo([{ id: 1, remainingQty: 5, unitCostMinor: 100 }], 0)).toThrow();
    expect(() => allocateFifo([{ id: 1, remainingQty: 5, unitCostMinor: -1 }], 2)).toThrow();
    expect(() => allocateFifo([{ id: 1, remainingQty: 5, unitCostMinor: 100 }], 1.00005)).toThrow();
    expect(() => grossProfitOf(-5, 10)).toThrow();
    expect(() => grossProfitOf(10, -5)).toThrow();
    expect(() => oversellCost({ shortQty: -1, fallbackUnitCostMinor: 10 })).toThrow();
  });
});
