// Veloria PoS — Tests : contrats de réponse IPC (renderer).
// `callChecked` doit accepter les formes main réelles et rejeter les dérives
// (champ manquant, type faux) avec un message FR — jamais de crash de rendu.
import { describe, it, expect } from "vitest";
import {
  callChecked,
  closingsListSchema,
  enrichedCustomerSearchSchema,
  paymentAckSchema,
  productsMatchBatchSchema,
} from "@shared/types/ipc-contracts.ts";

const customerRow = {
  id: 3,
  first_name: "Amine",
  last_name: "Benali",
  phone: null,
  address: null,
  credit_limit_minor: 0,
  outstanding_balance_minor: 12000,
  debt_status: "due",
  is_over_limit: 0,
  credit_allowed: 1,
  settlement_day: null,
  notes: null,
  created_at: "2026-09-01T10:00:00.000Z",
  deleted_at: null,
  invoice_count: 2,
  total_purchases_minor: 45000,
  last_sale_at: "2026-09-10T10:00:00.000Z",
};

describe("Contrats IPC renderer", () => {
  it("valide la recherche client enrichie (1 requête)", () => {
    const parsed = enrichedCustomerSearchSchema.parse({ rows: [customerRow], total: 1 });
    expect(parsed.rows[0]?.invoice_count).toBe(2);
    expect(() =>
      enrichedCustomerSearchSchema.parse({
        rows: [{ ...customerRow, invoice_count: -1 }],
        total: 1,
      }),
    ).toThrow();
    expect(() => enrichedCustomerSearchSchema.parse({ rows: [customerRow] })).toThrow();
  });

  it("valide l'appariement OCR par lot", () => {
    const hit = {
      id: 7,
      name: "Farine 1kg",
      selling_price_minor: 5000,
      purchase_price_minor: 4000,
      quantity: 10,
      unit_code: "KG",
    };
    const parsed = productsMatchBatchSchema.parse({
      results: [
        { barcodeHit: hit, candidates: [] },
        { barcodeHit: null, candidates: [hit] },
      ],
    });
    expect(parsed.results).toHaveLength(2);
    expect(() => productsMatchBatchSchema.parse({ results: [{ barcodeHit: null }] })).toThrow();
  });

  it("valide les accusés de paiement idempotents", () => {
    expect(paymentAckSchema.parse({ recorded: true, paymentId: 9 }).paymentId).toBe(9);
    expect(() => paymentAckSchema.parse({ recorded: true })).toThrow();
  });

  it("valide la liste des clôtures Z", () => {
    const parsed = closingsListSchema.parse({
      rows: [
        {
          business_date: "2026-09-18",
          opening_balance_minor: 50000,
          cash_sales_minor: 120000,
          customer_collections_minor: 10000,
          expenses_minor: 8000,
          refunds_minor: 0,
          closing_balance_minor: 172000,
        },
      ],
    });
    expect(parsed.rows[0]?.business_date).toBe("2026-09-18");
  });

  it("callChecked rejette les dérives avec un message FR", async () => {
    // `call` exige le pont `window.veloria` : stub minimal (le stub n'est
    // jamais appelé, les lambdas court-circuitent le bridge).
    const g = globalThis as unknown as { window?: unknown };
    const prev = g.window;
    g.window = { veloria: {} };
    try {
      await expect(
        callChecked(
          () => Promise.resolve({ ok: true as const, data: { rows: [] } }),
          paymentAckSchema,
        ),
      ).rejects.toThrow("Réponse inattendue");
      await expect(
        callChecked(
          () => Promise.resolve({ ok: true as const, data: { recorded: true, paymentId: 4 } }),
          paymentAckSchema,
        ),
      ).resolves.toMatchObject({ paymentId: 4 });
      await expect(
        callChecked(
          () => Promise.resolve({ ok: false as const, code: "X", message: "Non." }),
          paymentAckSchema,
        ),
      ).rejects.toThrow("Non.");
    } finally {
      g.window = prev;
    }
  });
});
