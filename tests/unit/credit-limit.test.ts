// Veloria PoS — Tests : plafond de crédit bloquant (solde + reste > plafond = refus,
// sauf accord vendeur explicite). Défense en profondeur : domaine + use-case.
import { describe, it, expect } from "vitest";
import {
  assertCreditLimitNotExceeded,
  assertCreditSaleAllowed,
} from "@/domain/customer/debt-rules.ts";
import { buildSalePayload, type SaleDraft } from "@/application/sales/create-sale.ts";

const OP = "123e4567-e89b-12d3-a456-426614174000";

function draft(over: Partial<SaleDraft> = {}): SaleDraft {
  return {
    lines: [
      {
        key: "l1",
        productId: null,
        productName: "Huile 5L",
        unitCode: "PIECE",
        originalUnitPriceMinor: 10000,
        unitPriceMinor: 10000,
        purchasePriceMinor: 8000,
        quantity: 1,
      },
    ],
    deliveryFeeMinor: 0,
    amountPaidMinor: 0,
    customerId: 7,
    customerCreditAllowed: true,
    customerOutstandingMinor: 9000,
    customerCreditLimitMinor: 10000,
    paymentMethod: "cash",
    operationId: OP,
    ...over,
  };
}

describe("assertCreditLimitNotExceeded (domaine)", () => {
  it("refuse solde + reste > plafond sans accord vendeur", () => {
    expect(() =>
      assertCreditLimitNotExceeded({
        outstandingMinor: 9000,
        creditLimitMinor: 10000,
        remainingMinor: 50000,
      }),
    ).toThrow(/Plafond de crédit dépassé/);
  });

  it("accepte sous le plafond", () => {
    expect(() =>
      assertCreditLimitNotExceeded({
        outstandingMinor: 9000,
        creditLimitMinor: 100000,
        remainingMinor: 50000,
      }),
    ).not.toThrow();
  });

  it("plafond 0 = sans limite explicite", () => {
    expect(() =>
      assertCreditLimitNotExceeded({
        outstandingMinor: 900000,
        creditLimitMinor: 0,
        remainingMinor: 50000,
      }),
    ).not.toThrow();
  });

  it("accord vendeur = dépassement autorisé", () => {
    expect(() =>
      assertCreditLimitNotExceeded({
        outstandingMinor: 9000,
        creditLimitMinor: 10000,
        remainingMinor: 50000,
        limitOverrideApproved: true,
      }),
    ).not.toThrow();
  });

  it("comptant (reste 0) : jamais de contrôle plafond", () => {
    expect(() =>
      assertCreditSaleAllowed({
        customerId: 7,
        creditAllowed: true,
        remainingMinor: 0,
        outstandingMinor: 999999,
        creditLimitMinor: 10000,
      }),
    ).not.toThrow();
  });
});

describe("buildSalePayload (plafond vendeur)", () => {
  it("refuse le dépassement sans accord vendeur", () => {
    expect(() => buildSalePayload(draft())).toThrow(/Plafond de crédit dépassé/);
  });

  it("accepte le dépassement avec accord vendeur + trace le flag", () => {
    const p = buildSalePayload(draft({ limitOverrideApproved: true }));
    expect(p.limitOverrideApproved).toBe(true);
  });

  it("double-submit même operationId = charge rejouable (idempotence portée par le main)", () => {
    const a = buildSalePayload(draft({ limitOverrideApproved: true }));
    const b = buildSalePayload(draft({ limitOverrideApproved: true }));
    expect(a.operationId).toBe(b.operationId);
    expect(a.limitOverrideApproved).toBe(true);
  });
});
