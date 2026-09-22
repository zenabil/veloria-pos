// Veloria PoS — Tests : dépenses (domaine, helpers UI, validateurs Zod).
import { describe, it, expect } from "vitest";
import { formatExpenseNumber } from "@domain/expenses/expense-rules.ts";
import {
  expenseNumber,
  expenseStatusLabel,
  expenseStatusTone,
  paymentMethodLabel,
} from "@features/expenses/types.ts";
import { expenseCreateSchema, expenseListSchema } from "../../electron/ipc/validators.ts";

describe("Expense domain", () => {
  it("numbers expenses", () => {
    expect(formatExpenseNumber(1)).toBe("DEP-00001");
    expect(formatExpenseNumber(42)).toBe("DEP-00042");
    expect(() => formatExpenseNumber(0)).toThrow();
  });

  it("labels statuses and methods", () => {
    expect(expenseStatusLabel("pending")).toBe("En attente");
    expect(expenseStatusLabel("paid")).toBe("Payée");
    expect(expenseStatusTone("pending")).toBe("amber");
    expect(expenseNumber(7)).toBe("DEP-00007");
    expect(paymentMethodLabel("cash")).toBe("Espèces");
    expect(paymentMethodLabel(null)).toBe("—");
  });
});

describe("Expense Zod schemas", () => {
  it("validates enriched payloads", () => {
    const c = expenseCreateSchema.parse({
      operationId: "123e4567-e89b-12d3-a456-426614174000",
      description: "Loyer janvier",
      category: "Loyer",
      amountMinor: 50000,
      expenseDate: "2026-01-05",
      status: "pending",
    });
    expect(c.status).toBe("pending");
    expect(c.paymentMethod).toBe(undefined);
    expect(() =>
      expenseCreateSchema.parse({
        operationId: "123e4567-e89b-12d3-a456-426614174000",
        description: "x",
        category: "y",
        amountMinor: 1,
        expenseDate: "2026-13-45",
      }),
    ).toThrow();
    expect(() =>
      expenseCreateSchema.parse({
        operationId: "123e4567-e89b-12d3-a456-426614174000",
        description: "ok",
        category: "y",
        amountMinor: 0,
        expenseDate: "2026-01-05",
      }),
    ).toThrow();
    // operationId requis (migration 0022) : rejet sans UUID.
    expect(() =>
      expenseCreateSchema.parse({
        description: "ok",
        category: "y",
        amountMinor: 1,
        expenseDate: "2026-01-05",
      }),
    ).toThrow();
  });

  it("validates list filters", () => {
    const list = expenseListSchema.parse({ statusFilter: "pending", sort: "amount_desc" });
    expect(list.page).toBe(1);
    expect(() => expenseListSchema.parse({ methodFilter: "nope" })).toThrow();
  });
});
