import { describe, it, expect } from "vitest";
import { computeDebtStatus, applyPaymentToBalance } from "@/domain/customer/debt-rules.ts";
import { applyStockDelta, assertReturnQuantity } from "@/domain/inventory/stock-rules.ts";
import { validateProductDraft } from "@/domain/product/product-rules.ts";

describe("Debt rules", () => {
  it("flags over-limit", () => {
    expect(computeDebtStatus({ outstandingMinor: 50000, creditLimitMinor: 20000 }).status).toBe(
      "over_limit",
    );
    expect(computeDebtStatus({ outstandingMinor: 0, creditLimitMinor: 0 }).status).toBe("none");
  });
  it("applies payment without overpay", () => {
    expect(applyPaymentToBalance(10000, 4000)).toBe(6000);
    expect(() => applyPaymentToBalance(1000, 2000)).toThrow();
  });
});

describe("Stock rules", () => {
  it("applies deltas", () => {
    expect(applyStockDelta(10, -3)).toBe(7);
  });
  it("validates return eligibility", () => {
    expect(() => assertReturnQuantity(5, 2, 4)).toThrow();
    expect(() => assertReturnQuantity(5, 2, 3)).not.toThrow();
  });
});

describe("Product rules", () => {
  it("rejects negative price", () => {
    expect(() =>
      validateProductDraft({
        name: "X1",
        categoryId: null,
        unitCode: "PIECE",
        purchasePriceMinor: -1,
        sellingPriceMinor: 0,
        quantity: 0,
        minStockLevel: 0,
        expirationDate: null,
        supplierId: null,
        barcodes: [],
      }),
    ).toThrow();
  });
});
