// Veloria PoS — Tests : flux factures (requêtes 1-4).
// Clé proforma stable, enrichissement client, schéma filePath PDF.
import { describe, it, expect } from "vitest";
import { proformaOperationKey } from "@/features/sales/proforma-op.ts";
import {
  enrichCustomer,
  type Customer,
  type CustomerStatement,
} from "@/features/customers/types.ts";
import { pdfFilePathSchema } from "../../electron/ipc/validators";

function customer(): Customer {
  return {
    id: 7,
    first_name: "Amine",
    last_name: "Benali",
    phone: "0550",
    address: null,
    credit_limit_minor: 0,
    outstanding_balance_minor: 5000,
    debt_status: "due",
    is_over_limit: 0,
    credit_allowed: 1,
    settlement_day: null,
    notes: null,
    created_at: "2026-01-01",
    deleted_at: null,
  };
}

function statement(): CustomerStatement {
  return {
    customer: customer(),
    sales: [
      {
        id: 1,
        invoice_number: "FAC-2026-00001",
        total_minor: 20000,
        amount_paid_minor: 15000,
        remaining_balance_minor: 5000,
        payment_status: "partial",
        is_cancelled: 0,
        created_at: "2026-02-01T10:00:00.000Z",
      },
      {
        id: 2,
        invoice_number: "FAC-2026-00002",
        total_minor: 10000,
        amount_paid_minor: 10000,
        remaining_balance_minor: 0,
        payment_status: "paid",
        is_cancelled: 1,
        created_at: "2026-03-01T10:00:00.000Z",
      },
    ],
    payments: [],
  };
}

describe("M-1 : clé proforma stable par contenu", () => {
  const lines = [{ productId: 1, productName: "Farine", unitPriceMinor: 5000, quantity: 2 }];
  it("même panier => même clé (retry = même operationId)", () => {
    expect(proformaOperationKey(7, lines)).toBe(proformaOperationKey(7, lines));
  });
  it("panier modifié => nouvelle clé", () => {
    expect(proformaOperationKey(7, lines)).not.toBe(proformaOperationKey(8, lines));
    expect(proformaOperationKey(7, lines)).not.toBe(
      proformaOperationKey(7, [
        { productId: 1, productName: "Farine", unitPriceMinor: 5000, quantity: 3 },
      ]),
    );
  });
});

describe("enrichCustomer (fiche caisse + clients)", () => {
  it("compte les non-annulées, cumule, retient la dernière vente", () => {
    const e = enrichCustomer(customer(), statement());
    expect(e.invoiceCount).toBe(1);
    expect(e.totalPurchasesMinor).toBe(20000);
    expect(e.lastSaleAt).toBe("2026-02-01T10:00:00.000Z");
    expect(e.outstanding_balance_minor).toBe(5000);
  });
  it("sans relevé : zéros, sans crash", () => {
    const e = enrichCustomer(customer(), null);
    expect(e.invoiceCount).toBe(0);
    expect(e.totalPurchasesMinor).toBe(0);
    expect(e.lastSaleAt).toBeNull();
  });
});

describe("pdfFilePathSchema (requête 4)", () => {
  it("absent/null accepté (dialogue natif)", () => {
    expect(pdfFilePathSchema.safeParse({}).success).toBe(true);
    expect(pdfFilePathSchema.safeParse({ filePath: null }).success).toBe(true);
  });
  it("chemin .pdf accepté (validation dossier côté main)", () => {
    expect(pdfFilePathSchema.safeParse({ filePath: "C:/tmp/facture.pdf" }).success).toBe(true);
  });
  it("trop long / non-chaîne rejeté", () => {
    expect(pdfFilePathSchema.safeParse({ filePath: `C:/${"a".repeat(2000)}.pdf` }).success).toBe(
      false,
    );
    expect(pdfFilePathSchema.safeParse({ filePath: 42 }).success).toBe(false);
  });
});
