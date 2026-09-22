// Veloria PoS — Tests : entrée fournisseur + prix de vente par ligne.
// Domaine (framework-free) + validateurs Zod à la frontière IPC.
import { describe, it, expect } from "vitest";
import {
  computeIntakeTotals,
  resolveIntakeSellingPrice,
  validateIntakeLine,
} from "@domain/inventory/intake-rules.ts";
import { stockIntakeSchema } from "../../electron/ipc/validators.ts";

const OP = "123e4567-e89b-42d3-a456-426614174000";

describe("Intake selling price (domain)", () => {
  it("Test 4 : prix vide conserve l'actuel, prix explicite (dont 0) s'applique", () => {
    expect(resolveIntakeSellingPrice(10000, null)).toBe(10000);
    expect(resolveIntakeSellingPrice(10000, undefined)).toBe(10000);
    expect(resolveIntakeSellingPrice(10000, 11000)).toBe(11000);
    expect(resolveIntakeSellingPrice(10000, 0)).toBe(0);
  });

  it("valide les lignes : quantité > 0, achat >= 0, vente >= 0 ou vide", () => {
    expect(() =>
      validateIntakeLine({
        productId: 1,
        productName: "Coca Cola 1L",
        quantityReceived: 10,
        quantityDamaged: 0,
        purchasePriceMinor: 8500,
        sellingPriceMinor: 11000,
      }),
    ).not.toThrow();
    // Vente vide autorisée (conservation).
    expect(() =>
      validateIntakeLine({
        productId: 1,
        productName: "Coca Cola 1L",
        quantityReceived: 10,
        quantityDamaged: 0,
        purchasePriceMinor: 8500,
        sellingPriceMinor: null,
      }),
    ).not.toThrow();
    // Vente négative refusée, achat négatif refusé, quantité nulle refusée, sans nom refusé.
    expect(() =>
      validateIntakeLine({
        productId: 1,
        productName: "A",
        quantityReceived: 10,
        quantityDamaged: 0,
        purchasePriceMinor: 8500,
        sellingPriceMinor: -100,
      }),
    ).toThrow("Prix de vente invalide");
    expect(() =>
      validateIntakeLine({
        productId: 1,
        productName: "A",
        quantityReceived: 10,
        quantityDamaged: 0,
        purchasePriceMinor: -1,
        sellingPriceMinor: null,
      }),
    ).toThrow("Coût d'achat invalide");
    expect(() =>
      validateIntakeLine({
        productId: 1,
        productName: "A",
        quantityReceived: 0,
        quantityDamaged: 0,
        purchasePriceMinor: 100,
        sellingPriceMinor: null,
      }),
    ).toThrow();
    expect(() =>
      validateIntakeLine({
        productId: null,
        productName: "   ",
        quantityReceived: 1,
        quantityDamaged: 0,
        purchasePriceMinor: 100,
        sellingPriceMinor: null,
      }),
    ).toThrow("Nom de produit requis");
  });

  it("rejette la valeur non numérique côté domaine (NaN)", () => {
    expect(() =>
      validateIntakeLine({
        productId: 1,
        productName: "A",
        quantityReceived: Number.NaN,
        quantityDamaged: 0,
        purchasePriceMinor: 100,
        sellingPriceMinor: null,
      }),
    ).toThrow();
  });

  it("totaux : sous-total = Σ(achat × net), total = sous-total + port", () => {
    const t = computeIntakeTotals(
      [
        {
          productId: 1,
          productName: "A",
          quantityReceived: 10,
          quantityDamaged: 0,
          purchasePriceMinor: 8000,
          sellingPriceMinor: 10000,
        },
        {
          productId: 2,
          productName: "B",
          quantityReceived: 5,
          quantityDamaged: 1,
          purchasePriceMinor: 12000,
          sellingPriceMinor: 15000,
        },
      ],
      500,
    );
    // A: 10×8000=80000 ; B: 4×12000=48000 ; sous-total 128000 ; total 128500.
    expect(t.subtotalMinor).toBe(128000);
    expect(t.totalMinor).toBe(128500);
  });
});

describe("Intake Zod schema (IPC)", () => {
  const baseLine = {
    productId: 1,
    productName: "Produit A",
    quantityReceived: 10,
    quantityDamaged: 0,
    purchasePriceMinor: 8000,
    sellingPriceMinor: 10000,
  };

  it("accepte une facture multi-produits avec prix de vente distincts + operationId", () => {
    const p = stockIntakeSchema.parse({
      operationId: OP,
      supplierId: 1,
      invoiceNumber: "FAC-FOU-001",
      invoiceDate: "2026-09-17",
      shippingMinor: 0,
      notes: null,
      lines: [
        baseLine,
        { ...baseLine, productId: 2, productName: "Produit B", sellingPriceMinor: 15000 },
      ],
    });
    expect(p.lines[0]?.sellingPriceMinor).toBe(10000);
    expect(p.lines[1]?.sellingPriceMinor).toBe(15000);
  });

  it("accepte la vente vide (null/omise) = conservation", () => {
    const p = stockIntakeSchema.parse({
      operationId: OP,
      invoiceDate: "2026-09-17",
      lines: [{ ...baseLine, sellingPriceMinor: null }],
    });
    expect(p.lines[0]?.sellingPriceMinor).toBe(null);
    const q = stockIntakeSchema.parse({
      operationId: OP,
      invoiceDate: "2026-09-17",
      lines: [{ ...baseLine, sellingPriceMinor: undefined }],
    });
    expect(q.lines[0]?.sellingPriceMinor).toBe(undefined);
  });

  it("exige operationId UUID (anti-doublon)", () => {
    expect(() =>
      stockIntakeSchema.parse({ invoiceDate: "2026-09-17", lines: [baseLine] }),
    ).toThrow();
    expect(() =>
      stockIntakeSchema.parse({
        operationId: "pas-un-uuid",
        invoiceDate: "2026-09-17",
        lines: [baseLine],
      }),
    ).toThrow();
  });

  it("refuse : quantité 0, achat négatif, vente négative, ligne sans produit, facture vide", () => {
    expect(() =>
      stockIntakeSchema.parse({
        operationId: OP,
        invoiceDate: "2026-09-17",
        lines: [{ ...baseLine, quantityReceived: 0 }],
      }),
    ).toThrow();
    expect(() =>
      stockIntakeSchema.parse({
        operationId: OP,
        invoiceDate: "2026-09-17",
        lines: [{ ...baseLine, purchasePriceMinor: -1 }],
      }),
    ).toThrow();
    expect(() =>
      stockIntakeSchema.parse({
        operationId: OP,
        invoiceDate: "2026-09-17",
        lines: [{ ...baseLine, sellingPriceMinor: -5 }],
      }),
    ).toThrow();
    expect(() =>
      stockIntakeSchema.parse({
        operationId: OP,
        invoiceDate: "2026-09-17",
        lines: [{ ...baseLine, productName: "" }],
      }),
    ).toThrow();
    expect(() =>
      stockIntakeSchema.parse({ operationId: OP, invoiceDate: "2026-09-17", lines: [] }),
    ).toThrow();
  });
});
