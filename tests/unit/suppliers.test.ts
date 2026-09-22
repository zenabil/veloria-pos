// Veloria PoS — Tests : fournisseurs (domaine, helpers UI, validateurs Zod).
import { describe, it, expect } from "vitest";
import {
  applySupplierPayment,
  formatSupplierCode,
  validateSupplierDraft,
} from "@domain/suppliers/supplier-rules.ts";
import {
  intakeNumber,
  isSupplierActive,
  supplierStatusLabel,
  supplierStatusTone,
  type Supplier,
} from "@features/suppliers/types.ts";
import {
  supplierCreateSchema,
  supplierDeleteManySchema,
  supplierSearchSchema,
} from "../../electron/ipc/validators.ts";

function makeSupplier(over: Partial<Supplier> = {}): Supplier {
  return {
    id: 1,
    uuid: "u1",
    code: "FOU-00001",
    name: "Moulin El Baraka",
    contact_person: null,
    phone: null,
    email: null,
    address: null,
    tax_number: null,
    commercial_register: null,
    notes: null,
    is_active: 1,
    initial_balance_minor: 0,
    outstanding_balance_minor: 0,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    deleted_at: null,
    ...over,
  };
}

describe("Supplier domain", () => {
  it("formats stable supplier codes", () => {
    expect(formatSupplierCode(1)).toBe("FOU-00001");
    expect(formatSupplierCode(42)).toBe("FOU-00042");
    expect(() => formatSupplierCode(0)).toThrow();
  });

  it("validates drafts in French", () => {
    expect(() => validateSupplierDraft({ name: "  " })).toThrow("Nom de fournisseur");
    expect(() => validateSupplierDraft({ name: "AB", email: "pas-un-email" })).toThrow("Email");
    expect(() =>
      validateSupplierDraft({ name: "AB", email: "contact@moulin.dz", notes: "x".repeat(501) }),
    ).toThrow("Notes");
    expect(() =>
      validateSupplierDraft({ name: "Moulin", email: "contact@moulin.dz" }),
    ).not.toThrow();
  });

  it("applies payments bounded by debt", () => {
    expect(applySupplierPayment(5000, 2000)).toBe(3000);
    expect(() => applySupplierPayment(5000, 6000)).toThrow("dépasse la dette");
    expect(() => applySupplierPayment(5000, 0)).toThrow();
  });
});

describe("Supplier UI helpers", () => {
  it("labels status", () => {
    expect(supplierStatusLabel(makeSupplier())).toBe("Actif");
    expect(supplierStatusTone(makeSupplier())).toBe("green");
    expect(supplierStatusLabel(makeSupplier({ outstanding_balance_minor: 1000 }))).toBe(
      "Dette en cours",
    );
    expect(supplierStatusTone(makeSupplier({ is_active: 0 }))).toBe("grey");
    expect(isSupplierActive(makeSupplier({ is_active: 0 }))).toBe(false);
  });

  it("numbers intakes", () => {
    expect(
      intakeNumber({
        id: 7,
        uuid: "i",
        invoice_number: null,
        invoice_date: null,
        subtotal_minor: 0,
        shipping_cost_minor: 0,
        total_minor: 100,
        status: "committed",
        notes: null,
        created_at: "2026-01-01",
      }),
    ).toBe("BON-00007");
  });
});

describe("Supplier Zod schemas", () => {
  it("accepts enriched create/update payloads", () => {
    const parsed = supplierCreateSchema.parse({
      operationId: "123e4567-e89b-12d3-a456-426614174000",
      name: "Moulin",
      email: "c@m.dz",
      isActive: false,
    });
    expect(parsed.isActive).toBe(false);
    expect(() => supplierCreateSchema.parse({ name: "x" })).toThrow();
    // operationId requis (migration 0022) : rejet sans UUID.
    expect(() => supplierCreateSchema.parse({ name: "Moulin" })).toThrow();
  });

  it("validates search filters and bulk delete", () => {
    const search = supplierSearchSchema.parse({
      statusFilter: "active",
      paymentFilter: "with_debt",
      sort: "purchases_desc",
    });
    expect(search.page).toBe(1);
    expect(() => supplierSearchSchema.parse({ sort: "nope" })).toThrow();
    // M-2 : operationId du caller requis (retry-safe).
    expect(
      supplierDeleteManySchema.parse({
        ids: [1, 2],
        operationId: "123e4567-e89b-12d3-a456-426614174000",
      }).ids,
    ).toEqual([1, 2]);
    expect(() => supplierDeleteManySchema.parse({ ids: [1, 2] })).toThrow();
    expect(() => supplierDeleteManySchema.parse({ ids: [] })).toThrow();
    expect(() =>
      supplierDeleteManySchema.parse({ ids: Array.from({ length: 101 }, (_, i) => i + 1) }),
    ).toThrow();
  });
});
