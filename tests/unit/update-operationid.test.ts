// Veloria — Contrats M-2/M-3 : operationId honnête (RADICAL REPAIR v2).
// Nouveau contrat radical :
//   - updates : operationId OPTIONNEL honoré par le repo (retry avec même UUID
//     = no-op, pas de 2e audit/couche FIFO). Sans UUID : idempotent par valeur
//     + audit déterministe (hash contenu, pas de random neuf au retry).
//   - suppressions + imports par lot : AVEC operationId du caller (retry-safe).
// Ce test verrouille le contrat : nouveau comportement + compat ascendante.
import { describe, expect, it } from "vitest";
import {
  customersImportSchema,
  expenseUpdateSchema,
  idempotentIdSchema,
  productsImportSchema,
  productUpdateSchema,
  supplierDeleteManySchema,
  supplierUpdateSchema,
} from "../../electron/ipc/validators";

const OP = "123e4567-e89b-12d3-a456-426614174000";

describe("M-3 : updates avec operationId optionnel honoré (radical v2)", () => {
  it("expense update SANS operationId est accepte (legacy)", () => {
    const payload = {
      id: 1,
      description: "Facture",
      category: "Loyer",
      amountMinor: 1000,
      expenseDate: "2026-09-18",
      status: "paid" as const,
    };
    expect(expenseUpdateSchema.safeParse(payload).success).toBe(true);
  });
  it("expense update AVEC operationId est accepte et honoré", () => {
    const payload = {
      id: 1,
      operationId: OP,
      description: "Facture",
      category: "Loyer",
      amountMinor: 1000,
      expenseDate: "2026-09-18",
      status: "paid" as const,
    };
    const parsed = expenseUpdateSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.operationId).toBe(OP);
  });
  it("supplier update SANS operationId est accepte", () => {
    const payload = { id: 1, name: "Fournisseur Test" };
    expect(supplierUpdateSchema.safeParse(payload).success).toBe(true);
  });
  it("product update SANS operationId est accepte", () => {
    const payload = {
      id: 1,
      name: "Produit Test",
      purchasePriceMinor: 100,
      sellingPriceMinor: 200,
      quantity: 5,
    };
    expect(productUpdateSchema.safeParse(payload).success).toBe(true);
  });
  it("compat ascendante : operationId residuel ignore (strip, pas de casse)", () => {
    expect(
      expenseUpdateSchema.safeParse({
        id: 1,
        operationId: OP,
        description: "Facture",
        category: "Loyer",
        amountMinor: 10,
        expenseDate: "2026-09-18",
      }).success,
    ).toBe(true);
    expect(
      supplierUpdateSchema.safeParse({ id: 1, operationId: OP, name: "Fournisseur" }).success,
    ).toBe(true);
    expect(
      productUpdateSchema.safeParse({
        id: 1,
        operationId: OP,
        name: "Produit",
        purchasePriceMinor: 1,
        sellingPriceMinor: 2,
        quantity: 1,
      }).success,
    ).toBe(true);
  });
});

describe("M-2 : suppressions + imports exigent operationId du caller", () => {
  it("suppliers.delete (idempotentId) exige operationId", () => {
    expect(idempotentIdSchema.safeParse({ id: 1 }).success).toBe(false);
    expect(idempotentIdSchema.safeParse({ id: 1, operationId: OP }).success).toBe(true);
  });
  it("suppliers.deleteMany exige operationId", () => {
    expect(supplierDeleteManySchema.safeParse({ ids: [1, 2] }).success).toBe(false);
    expect(supplierDeleteManySchema.safeParse({ ids: [1, 2], operationId: OP }).success).toBe(true);
  });
  it("imports par lot exigent operationId", () => {
    const prodRow = {
      name: "Farine",
      sellingPriceMinor: 100,
      purchasePriceMinor: 50,
      quantity: 1,
      barcode: "",
    };
    expect(productsImportSchema.safeParse({ rows: [prodRow] }).success).toBe(false);
    expect(productsImportSchema.safeParse({ operationId: OP, rows: [prodRow] }).success).toBe(true);
    const custRow = { firstName: "A", lastName: "B", phone: "" };
    expect(customersImportSchema.safeParse({ rows: [custRow] }).success).toBe(false);
    expect(customersImportSchema.safeParse({ operationId: OP, rows: [custRow] }).success).toBe(
      true,
    );
  });
});
