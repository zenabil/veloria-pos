// Veloria PoS — Tests : stock (domaine, helpers UI, validateurs Zod).
import { describe, it, expect } from "vitest";
import { adjustmentReasonCode, computeAdjustmentNewStock } from "@domain/inventory/stock-rules.ts";
import { adjustmentReasonFr } from "@shared/formatters/format.ts";
import {
  maxStockLabel,
  parseQtyInput,
  stockStatusLabel,
  stockStatusTone,
  suggestIntakeInvoiceNumber,
} from "@features/stock/types.ts";
import {
  inventoryApplySchema,
  productCreateSchema,
  stockMovementsSchema,
  stockProductsSchema,
} from "../../electron/ipc/validators.ts";

describe("Stock adjustment domain", () => {
  it("computes entry / exit / set", () => {
    expect(computeAdjustmentNewStock({ currentQty: 10, kind: "in", quantity: 5 })).toBe(15);
    expect(computeAdjustmentNewStock({ currentQty: 10, kind: "out", quantity: 4 })).toBe(6);
    expect(computeAdjustmentNewStock({ currentQty: 10, kind: "set", quantity: 3 })).toBe(3);
  });

  it("never goes negative on exit", () => {
    expect(() => computeAdjustmentNewStock({ currentQty: 2, kind: "out", quantity: 5 })).toThrow(
      "négatif",
    );
  });

  it("rejects empty entry/exit quantities", () => {
    expect(() => computeAdjustmentNewStock({ currentQty: 2, kind: "in", quantity: 0 })).toThrow();
  });

  it("prefixes reasons (code domaine + libellé FR partagé)", () => {
    expect(adjustmentReasonFr(adjustmentReasonCode("in", "adjust"))).toBe("Entrée");
    expect(adjustmentReasonFr(adjustmentReasonCode("set", "adjust"))).toBe("Correction");
    expect(adjustmentReasonFr(adjustmentReasonCode("out", "inventory"))).toBe("Inventaire");
    expect(adjustmentReasonCode("out", "adjust")).toBe("exit");
  });
});

describe("Stock UI helpers", () => {
  it("parses French quantities", () => {
    expect(parseQtyInput("12,5")).toBe(12.5);
    expect(parseQtyInput("")).toBe(0);
    expect(parseQtyInput("-3")).toBe(null);
    expect(parseQtyInput("abc")).toBe(null);
  });

  it("labels status and max", () => {
    expect(stockStatusLabel("low_stock")).toBe("Stock bas");
    expect(stockStatusTone("out_of_stock")).toBe("red");
    expect(maxStockLabel(0)).toBe("—");
    expect(maxStockLabel(50)).toBe("50");
  });
});

describe("Stock Zod schemas", () => {
  it("validates stock page filters", () => {
    // P30: pagination unifiée (200 max partout).
    const search = stockProductsSchema.parse({
      stockStatus: "low_stock",
      movementType: "sale_out",
      sort: "value_desc",
      pageSize: 200,
    });
    expect(search.page).toBe(1);
    expect(() => stockProductsSchema.parse({ sort: "nope" })).toThrow();
    expect(() => stockProductsSchema.parse({ pageSize: 201 })).toThrow();
  });

  it("validates movements and inventory payloads", () => {
    expect(stockMovementsSchema.parse({ productId: 1, types: ["sale_out"] }).types).toEqual([
      "sale_out",
    ]);
    expect(() => stockMovementsSchema.parse({ productId: 0 })).toThrow();
    const inv = inventoryApplySchema.parse({
      operationId: "123e4567-e89b-12d3-a456-426614174000",
      items: [{ productId: 1, actualQty: 5 }],
      reason: "Inventaire mensuel",
    });
    expect(inv.items.length).toBe(1);
    expect(() =>
      inventoryApplySchema.parse({
        operationId: "123e4567-e89b-12d3-a456-426614174000",
        items: [],
        reason: "x",
      }),
    ).toThrow();
  });

  it("defaults max stock to zero", () => {
    expect(
      productCreateSchema.parse({
        operationId: "123e4567-e89b-12d3-a456-426614174000",
        name: "Lait",
        purchasePriceMinor: 0,
        sellingPriceMinor: 0,
        quantity: 0,
      }).maxStockLevel,
    ).toBe(0);
    // operationId requis (migration 0022) : rejet sans UUID.
    expect(() =>
      productCreateSchema.parse({
        name: "Lait",
        purchasePriceMinor: 0,
        sellingPriceMinor: 0,
        quantity: 0,
      }),
    ).toThrow();
  });

  it("suggests an intake invoice number from the supplier code", () => {
    expect(suggestIntakeInvoiceNumber("FOU-00001", new Date(2026, 8, 18))).toBe(
      "BL-FOU-00001-20260918",
    );
    expect(suggestIntakeInvoiceNumber(null, new Date(2026, 8, 18))).toBe("BL-FRS-20260918");
    expect(suggestIntakeInvoiceNumber("  ", new Date(2026, 8, 18))).toBe("BL-FRS-20260918");
  });
});
