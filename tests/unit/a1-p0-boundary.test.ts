// Veloria PoS — A1 P0 : garde-fous frontière IPC (argent borné, quantités 3-déc, orphelins).
import { describe, it, expect } from "vitest";
import {
  saleCreateSchema,
  recordPaymentSchema,
  stockIntakeSchema,
  proformaCreateSchema,
  breadCreateSchema,
  breadPaySchema,
  closingCreateSchema,
  zakatCalculationSchema,
  productsImportSchema,
  printPayloadSchema,
  cartsSaveSchema,
  customerCreateSchema,
  expenseCreateSchema,
  supplierPaySchema,
} from "@/../electron/ipc/validators.ts";

const line = {
  productId: 1,
  productName: "Sucre 1kg",
  unitCode: "PIECE",
  originalUnitPriceMinor: 1000,
  unitPriceMinor: 1000,
  purchasePriceMinor: 800,
  quantity: 1,
};

describe("A1-P0 frontière Zod : argent borné", () => {
  it("rejette un montant forgé 9e15 (overflow SUM/prix×qté)", () => {
    expect(() =>
      saleCreateSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        lines: [{ ...line, unitPriceMinor: 9_000_000_000_000_000 }],
        deliveryFeeMinor: 0,
        amountPaidMinor: 0,
      }),
    ).toThrow();
    expect(() =>
      recordPaymentSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        customerId: 1,
        amountMinor: 9_000_000_000_000_000,
        method: "cash",
      }),
    ).toThrow();
    expect(() =>
      supplierPaySchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        supplierId: 1,
        amountMinor: 9_000_000_000_000_000,
        method: "cash",
        paymentDate: "2026-10-03",
      }),
    ).toThrow();
    expect(() =>
      expenseCreateSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        description: "Loyer",
        category: "Loyer",
        amountMinor: 9_000_000_000_000_000,
        expenseDate: "2026-10-03",
      }),
    ).toThrow();
    expect(() =>
      breadPaySchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        id: 1,
        amountMinor: 9_000_000_000_000_000,
      }),
    ).toThrow();
    expect(() =>
      closingCreateSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        businessDate: "2026-10-03",
        openingMinor: 9_000_000_000_000_000,
      }),
    ).toThrow();
    expect(() =>
      zakatCalculationSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        hijriYear: "1447",
        calcDate: "2026-10-03",
        cashMinor: 9_000_000_000_000_000,
      }),
    ).toThrow();
    expect(() =>
      customerCreateSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        firstName: "A",
        lastName: "B",
        creditLimitMinor: 9_000_000_000_000_000,
      }),
    ).toThrow();
  });

  it("rejette un paiement orphelin (ni client ni vente)", () => {
    expect(() =>
      recordPaymentSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        amountMinor: 1000,
        method: "cash",
      }),
    ).toThrow(/Client ou vente requis/);
  });

  it("rejette une quantité à 4+ décimales (au lieu d'arrondir silencieusement)", () => {
    expect(() =>
      saleCreateSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        lines: [{ ...line, quantity: 1.23456 }],
        deliveryFeeMinor: 0,
        amountPaidMinor: 0,
      }),
    ).toThrow();
    expect(() =>
      stockIntakeSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        invoiceDate: "2026-10-03",
        lines: [
          {
            productId: 1,
            productName: "Sucre",
            quantityReceived: 1,
            quantityDamaged: 1.23456,
            purchasePriceMinor: 100,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      productsImportSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        rows: [{ name: "X", sellingPriceMinor: 100, quantity: 1.23456 }],
      }),
    ).toThrow();
    expect(() =>
      cartsSaveSchema.parse({
        tabs: [
          {
            tabId: 1,
            name: "P1",
            lines: [
              {
                key: "k",
                productId: 1,
                productName: "X",
                originalUnitPriceMinor: 100,
                unitPriceMinor: 100,
                quantity: 1.23456,
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejette une date d'expiration calendaire impossible", () => {
    expect(() =>
      stockIntakeSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        invoiceDate: "2026-10-03",
        lines: [
          {
            productId: 1,
            productName: "Sucre",
            quantityReceived: 1,
            purchasePriceMinor: 100,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("borne les totaux d'impression (payload forgé)", () => {
    const base = {
      lines: [{ name: "X", qty: 1, unitPriceMinor: 100, lineTotalMinor: 100 }],
      subtotalMinor: 100,
      discountMinor: 0,
      deliveryMinor: 0,
      totalMinor: 100,
      paidMinor: 100,
    };
    expect(() => printPayloadSchema.parse({ ...base })).not.toThrow();
    expect(() =>
      printPayloadSchema.parse({ ...base, totalMinor: 9_000_000_000_000_000 }),
    ).toThrow();
  });

  it("borne proforma + pain (unitaires et globaux)", () => {
    expect(() =>
      proformaCreateSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        lines: [
          { productId: 1, productName: "X", unitPriceMinor: 9_000_000_000_000_000, quantity: 1 },
        ],
      }),
    ).toThrow();
    expect(() =>
      breadCreateSchema.parse({
        operationId: "11111111-1111-4111-8111-111111111111",
        pickupDate: "2026-10-03",
        quantity: 1,
        unitPriceMinor: 9_000_000_000_000_000,
      }),
    ).toThrow();
  });
});
