// Veloria PoS — Tests : use-case CreateSale PUR (P0-7).
// `buildSalePayload` ne touche jamais l'IPC et ne génère jamais d'UUID :
// operationId absent = refus explicite (le dialogue d'encaissement le fige).
import { describe, it, expect } from "vitest";
import { buildSalePayload, totalsOf, type SaleDraft } from "@/application/sales/create-sale.ts";

const OP = "123e4567-e89b-12d3-a456-426614174000";

function draft(): SaleDraft {
  return {
    lines: [
      {
        key: "l1",
        productId: 7,
        productName: "Huile 5L",
        unitCode: "PIECE",
        originalUnitPriceMinor: 10000,
        unitPriceMinor: 9000,
        purchasePriceMinor: 8000,
        quantity: 1,
      },
    ],
    deliveryFeeMinor: 0,
    amountPaidMinor: 9000,
    customerId: null,
    paymentMethod: "cash" as const,
    operationId: OP,
  };
}

describe("buildSalePayload (P0-7, pur)", () => {
  it("construit la charge avec l'operationId de l'appelant (rejoué tel quel)", () => {
    const p = buildSalePayload(draft());
    expect(p.operationId).toBe(OP);
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]).toMatchObject({
      originalUnitPriceMinor: 10000,
      unitPriceMinor: 9000,
    });
    expect(p.totals.subtotalMinor).toBe(10000);
    expect(p.totals.discountAmountMinor).toBe(1000);
    expect(p.totals.totalMinor).toBe(9000);
    expect(p.totals.remainingMinor).toBe(0);
  });

  it("refuse sans operationId (jamais de génération silencieuse)", () => {
    const d = draft();
    expect(() => buildSalePayload({ ...d, operationId: "" })).toThrow();
    expect(() => buildSalePayload({ ...d, operationId: "   " })).toThrow();
  });

  it("totalsOf reste une fonction pure de calcul", () => {
    const t = totalsOf({ lines: draft().lines, deliveryFeeMinor: 0, amountPaidMinor: 0 });
    expect(t.totalMinor).toBe(9000);
    expect(t.paymentStatus).toBe("unpaid");
  });
});
