// Veloria POS — H-1 Money Safety Boundary regression tests.
// NORMAL + EDGE + FAILURE: caps, overflow, NaN/Infinity, negatives, 200+ lines.
import { describe, it, expect } from "vitest";
import {
  MAX_MINOR_SINGLE,
  MAX_MINOR_TOTAL,
  addSafeMinor,
  assertSafeMinor,
  assertSafeTotal,
  fromDzd,
  multiplyMinorByQuantity,
  parseDzdInputStrict,
  percentOfMinor,
  sumSafeMinors,
} from "@domain/money/money.ts";
import { computeSaleTotals } from "@domain/sales/sale-rules.ts";
import { computeProformaTotals } from "@domain/proforma/proforma-rules.ts";
import { computeIntakeTotals } from "@domain/inventory/intake-rules.ts";
import { computeDebtStatus } from "@domain/customer/debt-rules.ts";
import { computeClosingBalance } from "@domain/closings/closing-rules.ts";
import { computeZakat } from "@/domain/zakat/zakat-rules.ts";

describe("H-1 money safety boundary", () => {
  it("single cap: MAX ok, MAX+1 throws, unsafe/NaN/Infinity/negative throw", () => {
    expect(() => assertSafeMinor(MAX_MINOR_SINGLE)).not.toThrow();
    expect(() => assertSafeMinor(MAX_MINOR_SINGLE + 1)).toThrow();
    expect(() => assertSafeMinor(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(() => assertSafeMinor(NaN)).toThrow();
    expect(() => assertSafeMinor(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => assertSafeMinor(-1)).toThrow();
    expect(() => assertSafeTotal(MAX_MINOR_TOTAL)).not.toThrow();
    expect(() => assertSafeTotal(MAX_MINOR_TOTAL + 1)).toThrow();
  });

  it("fromDzd guards overflow before multiply", () => {
    expect(fromDzd(10)).toBe(1000);
    expect(() => fromDzd(1e16)).toThrow();
    expect(() => fromDzd(NaN)).toThrow();
    expect(() => fromDzd(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("multiply guards price*qty overflow", () => {
    expect(multiplyMinorByQuantity(100, 2)).toBe(200);
    // 1e9 * 1e6 = 1e15 > total cap => fail closed, never imprecise.
    expect(() => multiplyMinorByQuantity(1_000_000_000, 1_000_000)).toThrow();
    expect(() => multiplyMinorByQuantity(1_000_000_001, 1)).toThrow();
    expect(() => multiplyMinorByQuantity(100, -1)).toThrow();
  });

  it("percent + add + sum are overflow-safe", () => {
    expect(percentOfMinor(10000, 10)).toBe(1000);
    expect(() => percentOfMinor(MAX_MINOR_TOTAL + 1, 10)).toThrow();
    expect(addSafeMinor(100, 200)).toBe(300);
    expect(() => addSafeMinor(MAX_MINOR_TOTAL, 1)).toThrow();
    expect(sumSafeMinors([100, 200, 300])).toBe(600);
    expect(() => sumSafeMinors([MAX_MINOR_TOTAL, 1])).toThrow();
  });

  it("strict parser: valid -> money, invalid -> controlled error (never NaN)", () => {
    expect(parseDzdInputStrict("12,5")).toBe(1250);
    expect(parseDzdInputStrict("0")).toBe(0);
    for (const bad of ["abc", "", "-5", "999999999999"]) {
      let threw = false;
      try {
        parseDzdInputStrict(bad);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    }
  });

  it("sale: 200 normal lines ok, overflowing invoice fails closed", () => {
    const lines = Array.from({ length: 200 }, (_, i) => ({
      productId: i + 1,
      productName: `P${i + 1}`,
      unitCode: "PIECE",
      originalUnitPriceMinor: 10000,
      unitPriceMinor: 10000,
      purchasePriceMinor: 5000,
      quantity: 1,
    }));
    const ok = computeSaleTotals({
      lines,
      deliveryFeeMinor: 0,
      amountPaidMinor: 0,
    });
    expect(ok.subtotalMinor).toBe(200 * 10000);
    const huge = Array.from({ length: 200 }, (_, i) => ({
      productId: i + 1,
      productName: `P${i + 1}`,
      unitCode: "PIECE",
      originalUnitPriceMinor: 1_000_000_000,
      unitPriceMinor: 1_000_000_000,
      purchasePriceMinor: 1,
      quantity: 1000,
    }));
    expect(() =>
      computeSaleTotals({
        lines: huge,
        deliveryFeeMinor: 0,
        amountPaidMinor: 0,
      }),
    ).toThrow();
  });

  it("proforma/intake reject unsafe money", () => {
    expect(() =>
      computeProformaTotals(
        [{ productId: null, productName: "X", unitPriceMinor: MAX_MINOR_SINGLE + 1, quantity: 1 }],
        0,
        0,
      ),
    ).toThrow();
    expect(() =>
      computeIntakeTotals(
        [
          {
            productId: null,
            productName: "X",
            quantityReceived: 1,
            quantityDamaged: 0,
            purchasePriceMinor: MAX_MINOR_SINGLE + 1,
          },
        ],
        0,
      ),
    ).toThrow();
  });

  it("debt overdue implemented (due_date < businessDate)", () => {
    expect(computeDebtStatus({ outstandingMinor: 100, creditLimitMinor: 0 }).status).toBe("due");
    expect(
      computeDebtStatus({
        outstandingMinor: 100,
        creditLimitMinor: 0,
        dueDate: "2026-01-01",
        businessDate: "2026-06-01",
      }).status,
    ).toBe("overdue");
    expect(
      computeDebtStatus({
        outstandingMinor: 100,
        creditLimitMinor: 0,
        dueDate: "2026-06-01",
        businessDate: "2026-06-01",
      }).status,
    ).toBe("due");
    expect(computeDebtStatus({ outstandingMinor: 500, creditLimitMinor: 100 }).status).toBe(
      "over_limit",
    );
  });

  it("closing documents negative result but rejects overflow", () => {
    // Loss-making day is a valid (documented) negative result.
    expect(
      computeClosingBalance({
        openingMinor: 1000,
        cashSalesMinor: 0,
        customerCollectionsMinor: 0,
        expensesMinor: 5000,
        refundsMinor: 0,
      }),
    ).toBe(-4000);
    expect(() =>
      computeClosingBalance({
        openingMinor: MAX_MINOR_TOTAL + 1,
        cashSalesMinor: 0,
        customerCollectionsMinor: 0,
        expensesMinor: 0,
        refundsMinor: 0,
      }),
    ).toThrow();
  });

  it("zakat guarded (live path computeZakatLocal: overflow + rate)", () => {
    expect(
      computeZakat({
        cashMinor: 700000,
        bankMinor: 0,
        stockMinor: 0,
        receivablesMinor: 0,
        otherMinor: 0,
        liabilitiesMinor: 0,
        nisabMinor: 100000,
        ratePercent: 2.5,
      }).zakat,
    ).toBe(17500);
    expect(() =>
      computeZakat({
        cashMinor: MAX_MINOR_TOTAL + 1,
        bankMinor: 0,
        stockMinor: 0,
        receivablesMinor: 0,
        otherMinor: 0,
        liabilitiesMinor: 0,
        nisabMinor: 0,
        ratePercent: 2.5,
      }),
    ).toThrow();
    expect(() =>
      computeZakat({
        cashMinor: 1000,
        bankMinor: 0,
        stockMinor: 0,
        receivablesMinor: 0,
        otherMinor: 0,
        liabilitiesMinor: 0,
        nisabMinor: 0,
        ratePercent: 0,
      }),
    ).toThrow();
  });
});
