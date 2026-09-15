import { describe, it, expect } from "vitest";
import { computeSaleTotals } from "@/domain/sales/sale-rules.ts";

describe("CreateSale invariants", () => {
  const line = {
    productId: 1,
    productName: "Coca",
    unitCode: "PIECE",
    unitPriceMinor: 10000,
    purchasePriceMinor: 8000,
    quantity: 2,
  };

  it("computes subtotal/discount/total/remaining", () => {
    const t = computeSaleTotals({
      lines: [line],
      discountType: "percent",
      discountValueMinor: 10,
      deliveryFeeMinor: 500,
      amountPaidMinor: 10000,
    });
    expect(t.subtotalMinor).toBe(20000);
    expect(t.discountAmountMinor).toBe(2000);
    expect(t.totalMinor).toBe(18500);
    expect(t.remainingMinor).toBe(8500);
    expect(t.paymentStatus).toBe("partial");
  });

  it("rejects empty cart", () => {
    expect(() =>
      computeSaleTotals({
        lines: [],
        discountType: "none",
        discountValueMinor: 0,
        deliveryFeeMinor: 0,
        amountPaidMinor: 0,
      }),
    ).toThrow();
  });

  it("rejects overpayment", () => {
    expect(() =>
      computeSaleTotals({
        lines: [line],
        discountType: "none",
        discountValueMinor: 0,
        deliveryFeeMinor: 0,
        amountPaidMinor: 999999,
      }),
    ).toThrow();
  });

  it("supports full credit sale", () => {
    const t = computeSaleTotals({
      lines: [line],
      discountType: "none",
      discountValueMinor: 0,
      deliveryFeeMinor: 0,
      amountPaidMinor: 0,
    });
    expect(t.paymentStatus).toBe("unpaid");
    expect(t.remainingMinor).toBe(20000);
  });
});
