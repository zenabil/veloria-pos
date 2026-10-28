// Veloria PoS — Tests : helpers clients (statuts, nom complet, tri).
import { describe, it, expect } from "vitest";
import { customerCreateSchema } from "../../electron/ipc/validators.ts";
import {
  debtLabel,
  debtTone,
  fullName,
  splitFullName,
  type EnrichedCustomer,
} from "@features/customers/types.ts";

function makeClient(
  over: Partial<EnrichedCustomer> & { id: number; first_name: string; last_name: string },
): EnrichedCustomer {
  return {
    phone: null,
    address: null,
    credit_limit_minor: 0,
    outstanding_balance_minor: 0,
    debt_status: "none",
    is_over_limit: 0,
    credit_allowed: 0,
    settlement_day: null,
    notes: null,
    created_at: "2026-01-01",
    deleted_at: null,
    invoiceCount: 0,
    totalPurchasesMinor: 0,
    lastSaleAt: null,
    ...over,
  };
}

describe("Clients helpers", () => {
  it("labels debt status in French", () => {
    expect(debtLabel(makeClient({ id: 1, first_name: "A", last_name: "B" }))).toBe("À jour");
    expect(debtTone(makeClient({ id: 1, first_name: "A", last_name: "B" }))).toBe("green");
    expect(
      debtLabel(
        makeClient({ id: 2, first_name: "A", last_name: "B", outstanding_balance_minor: 500 }),
      ),
    ).toBe("Endetté");
    expect(
      debtLabel(
        makeClient({
          id: 3,
          first_name: "A",
          last_name: "B",
          outstanding_balance_minor: 500,
          is_over_limit: 1,
        }),
      ),
    ).toBe("Dépassement");
    expect(
      debtTone(
        makeClient({
          id: 3,
          first_name: "A",
          last_name: "B",
          outstanding_balance_minor: 500,
          is_over_limit: 1,
        }),
      ),
    ).toBe("red");
    expect(
      debtLabel(makeClient({ id: 4, first_name: "A", last_name: "B", deleted_at: "2026-01-02" })),
    ).toBe("Archivé");
  });

  it("splits a full name (last word = family name)", () => {
    expect(splitFullName("Amine Benali")).toEqual({ firstName: "Amine", lastName: "Benali" });
    expect(splitFullName("  Jean Pierre Martin ")).toEqual({
      firstName: "Jean Pierre",
      lastName: "Martin",
    });
    expect(splitFullName("Solo")).toEqual({ firstName: "Solo", lastName: "Solo" });
    expect(fullName({ first_name: "Amine", last_name: "Benali" })).toBe("Amine Benali");
  });
});

describe("Création client (garde-fous)", () => {
  const base = {
    operationId: "123e4567-e89b-12d3-a456-426614174000",
    firstName: "Amine",
    lastName: "Benali",
  };
  it("rejette un solde initial négatif (aucun clamp silencieux)", () => {
    expect(() => customerCreateSchema.parse({ ...base, initialBalanceMinor: -1 })).toThrow();
    expect(
      customerCreateSchema.parse({ ...base, initialBalanceMinor: 5000 }).initialBalanceMinor,
    ).toBe(5000);
    // operationId requis (migration 0022) : rejet sans UUID.
    expect(() => customerCreateSchema.parse({ firstName: "Amine", lastName: "Benali" })).toThrow();
  });
});
