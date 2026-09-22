import { describe, it, expect } from "vitest";
import { computeLineDiscount, computeSaleTotals } from "@/domain/sales/sale-rules.ts";

describe("CreateSale invariants (P0-7 : remise par prix unitaire)", () => {
  const line = {
    productId: 1,
    productName: "Coca",
    unitCode: "PIECE",
    originalUnitPriceMinor: 10000,
    unitPriceMinor: 9000,
    purchasePriceMinor: 8000,
    quantity: 2,
  };

  it("computes subtotal(original)/discount/total/remaining", () => {
    const t = computeSaleTotals({
      lines: [line],
      deliveryFeeMinor: 500,
      amountPaidMinor: 10000,
    });
    // Original : 2×10000 = 20000 ; facturé : 2×9000 = 18000 ; remise 2000.
    expect(t.subtotalMinor).toBe(20000);
    expect(t.discountAmountMinor).toBe(2000);
    expect(t.lineTotalsMinor).toEqual([18000]);
    expect(t.lineDiscountsMinor).toEqual([2000]);
    expect(t.totalMinor).toBe(18500);
    expect(t.remainingMinor).toBe(8500);
    expect(t.paymentStatus).toBe("partial");
    expect(t.hasBelowCostLine).toBe(false);
  });

  it("flags below-cost lines (final < purchase)", () => {
    const d = computeLineDiscount({ ...line, unitPriceMinor: 7000 });
    expect(d.belowCost).toBe(true);
    expect(d.discountMinor).toBe(6000);
    const t = computeSaleTotals({
      lines: [{ ...line, unitPriceMinor: 7000 }],
      deliveryFeeMinor: 0,
      amountPaidMinor: 0,
    });
    expect(t.hasBelowCostLine).toBe(true);
    expect(t.totalMinor).toBe(14000);
  });

  it("supports price increase (negative discount = majoration)", () => {
    const t = computeSaleTotals({
      lines: [{ ...line, unitPriceMinor: 12000 }],
      deliveryFeeMinor: 0,
      amountPaidMinor: 24000,
    });
    expect(t.discountAmountMinor).toBe(-4000);
    expect(t.totalMinor).toBe(24000);
    expect(t.paymentStatus).toBe("paid");
  });

  it("rejects empty cart", () => {
    expect(() =>
      computeSaleTotals({
        lines: [],
        deliveryFeeMinor: 0,
        amountPaidMinor: 0,
      }),
    ).toThrow();
  });

  it("rejects overpayment", () => {
    expect(() =>
      computeSaleTotals({
        lines: [line],
        deliveryFeeMinor: 0,
        amountPaidMinor: 999999,
      }),
    ).toThrow();
  });

  it("supports full credit sale", () => {
    const t = computeSaleTotals({
      lines: [{ ...line, unitPriceMinor: 10000, originalUnitPriceMinor: 10000 }],
      deliveryFeeMinor: 0,
      amountPaidMinor: 0,
    });
    expect(t.discountAmountMinor).toBe(0);
    expect(t.paymentStatus).toBe("unpaid");
    expect(t.remainingMinor).toBe(20000);
  });
});
