// Veloria PoS — Tests : vente à crédit réservée aux clients autorisés.
import { describe, it, expect } from "vitest";
import { assertCreditSaleAllowed } from "@domain/customer/debt-rules.ts";

describe("Credit sale authorization", () => {
  it("allows cash sales for everyone", () => {
    expect(() =>
      assertCreditSaleAllowed({ customerId: null, creditAllowed: false, remainingMinor: 0 }),
    ).not.toThrow();
    expect(() =>
      assertCreditSaleAllowed({ customerId: 7, creditAllowed: false, remainingMinor: 0 }),
    ).not.toThrow();
  });

  it("allows credit for authorized customers", () => {
    expect(() =>
      assertCreditSaleAllowed({ customerId: 7, creditAllowed: true, remainingMinor: 500 }),
    ).not.toThrow();
  });

  it("rejects walk-in credit", () => {
    expect(() =>
      assertCreditSaleAllowed({ customerId: null, creditAllowed: false, remainingMinor: 500 }),
    ).toThrow("choisissez un client autorisé");
  });

  it("rejects credit for unauthorized customers", () => {
    expect(() =>
      assertCreditSaleAllowed({ customerId: 7, creditAllowed: false, remainingMinor: 500 }),
    ).toThrow("n'est pas autorisé");
  });

  it("rejects an invalid remaining amount", () => {
    expect(() =>
      assertCreditSaleAllowed({ customerId: 7, creditAllowed: true, remainingMinor: -1 }),
    ).toThrow();
  });
});
