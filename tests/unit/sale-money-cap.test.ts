// Veloria PoS — Frontières IPC de la vente : total payé et 500 lignes.
import { describe, it, expect } from "vitest";
import { cartsSaveSchema, saleCreateSchema } from "../../electron/ipc/validators.sales.ts";
import { recordPaymentSchema } from "../../electron/ipc/validators.finance.ts";

const OP = "11111111-1111-4111-8111-111111111111";

function line(): Record<string, unknown> {
  return {
    key: "k1",
    productId: 1,
    productName: "Article",
    unitCode: "PIECE",
    originalUnitPriceMinor: 1000,
    unitPriceMinor: 1000,
    purchasePriceMinor: 500,
    quantity: 1,
  };
}

describe("frontières de vente", () => {
  it("accepte un paiement total au-delà de 10M DZD", () => {
    const parsed = saleCreateSchema.parse({
      operationId: OP,
      amountPaidMinor: 1_500_000_000,
      lines: [line()],
    });
    expect(parsed.amountPaidMinor).toBe(1_500_000_000);
    expect(() =>
      saleCreateSchema.parse({
        operationId: OP,
        amountPaidMinor: 100_000_000_001,
        lines: [line()],
      }),
    ).toThrow();
  });

  it("accepte 500 lignes et refuse la 501e", () => {
    expect(() =>
      saleCreateSchema.parse({
        operationId: OP,
        amountPaidMinor: 0,
        lines: Array.from({ length: 500 }, line),
      }),
    ).not.toThrow();
    expect(() =>
      saleCreateSchema.parse({
        operationId: OP,
        amountPaidMinor: 0,
        lines: Array.from({ length: 501 }, line),
      }),
    ).toThrow();
  });

  it("accepte un règlement de dette au-delà de 10M DZD", () => {
    const parsed = recordPaymentSchema.parse({
      operationId: OP,
      customerId: 1,
      amountMinor: 1_500_000_000,
      method: "cash",
    });
    expect(parsed.amountMinor).toBe(1_500_000_000);
  });

  it("accepte le montant payé d'un brouillon de caisse au-delà de 10M DZD", () => {
    const parsed = cartsSaveSchema.parse({
      tabs: [
        {
          tabId: 1,
          name: "Panier 1",
          lines: [line()],
          amountPaidMinor: 1_500_000_000,
        },
      ],
    });
    expect(parsed.tabs[0]?.amountPaidMinor).toBe(1_500_000_000);
  });
});
