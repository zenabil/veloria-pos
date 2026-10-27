import { describe, it, expect } from "vitest";
import { computeDebtStatus, applyPaymentToBalance } from "@/domain/customer/debt-rules.ts";
import { applyStockDelta, assertReturnQuantity } from "@/domain/inventory/stock-rules.ts";
import { validateProductDraft } from "@/domain/product/product-rules.ts";
import { computeReturnSettlement } from "@/domain/returns/return-rules.ts";

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

describe("Return settlement (dette d'abord)", () => {
  it("impute la dette puis n'autorise que l'excédent en espèces", () => {
    expect(
      computeReturnSettlement({
        totalReturnMinor: 10000,
        outstandingMinor: 6000,
        requestedRefundMinor: 4000,
      }),
    ).toEqual({
      creditAppliedMinor: 6000,
      cashRefundMinor: 4000,
      maxCashRefundMinor: 4000,
      unsettledMinor: 0,
    });
  });

  it("plafonne l'avoir à la dette et refuse un remboursement au-delà", () => {
    expect(
      computeReturnSettlement({
        totalReturnMinor: 5000,
        outstandingMinor: 12000,
        requestedRefundMinor: 0,
      }),
    ).toEqual({
      creditAppliedMinor: 5000,
      cashRefundMinor: 0,
      maxCashRefundMinor: 0,
      unsettledMinor: 0,
    });
    expect(() =>
      computeReturnSettlement({
        totalReturnMinor: 10000,
        outstandingMinor: 6000,
        requestedRefundMinor: 4001,
      }),
    ).toThrow(/non imputé/);
  });

  it("sans dette, tout le retour peut être remboursé en espèces", () => {
    expect(
      computeReturnSettlement({
        totalReturnMinor: 7000,
        outstandingMinor: 0,
        requestedRefundMinor: 7000,
      }),
    ).toEqual({
      creditAppliedMinor: 0,
      cashRefundMinor: 7000,
      maxCashRefundMinor: 7000,
      unsettledMinor: 0,
    });
  });

  it("laisse un reliquat non réglé si les espèces sont inférieures au maximum", () => {
    expect(
      computeReturnSettlement({
        totalReturnMinor: 7000,
        outstandingMinor: 0,
        requestedRefundMinor: 2000,
      }),
    ).toEqual({
      creditAppliedMinor: 0,
      cashRefundMinor: 2000,
      maxCashRefundMinor: 7000,
      unsettledMinor: 5000,
    });
  });

  it("rejette les montants invalides", () => {
    expect(() =>
      computeReturnSettlement({
        totalReturnMinor: -1,
        outstandingMinor: 0,
        requestedRefundMinor: 0,
      }),
    ).toThrow();
    expect(() =>
      computeReturnSettlement({
        totalReturnMinor: 1000,
        outstandingMinor: 0,
        requestedRefundMinor: -1,
      }),
    ).toThrow();
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
