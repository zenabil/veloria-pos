// Veloria PoS — Tests : dettes (helpers UI, validateurs Zod).
import { describe, it, expect } from "vitest";
import {
  debtStatusLabel,
  debtStatusTone,
  debtTypeLabel,
  dueLabel,
  rowKey,
} from "@features/debts/types.ts";
import {
  debtTargetSchema,
  debtsListSchema,
  saleDueDateSchema,
} from "../../electron/ipc/validators.ts";

describe("Debt UI helpers", () => {
  it("labels types, statuses and due dates", () => {
    expect(debtTypeLabel("customer")).toBe("Client");
    expect(debtTypeLabel("supplier")).toBe("Fournisseur");
    expect(debtStatusLabel("overdue")).toBe("En retard");
    expect(debtStatusLabel("due")).toBe("À régler");
    expect(debtStatusTone("overdue")).toBe("red");
    expect(dueLabel(null)).toBe("—");
    expect(dueLabel("2026-09-20T00:00:00.000Z")).toBe("20/09/2026");
    expect(dueLabel("2026-09-20")).toBe("20/09/2026");
    expect(dueLabel("nimporte")).toBe("—");
    expect(
      rowKey({
        debt_type: "supplier",
        entity_id: 3,
        ref: "Compte",
        party_name: "Moulin",
        party_phone: null,
        original_minor: 0,
        paid_minor: 0,
        remaining_minor: 500,
        due_date: null,
        created_at: "2026-01-01",
        status: "due",
        settlement_day: null,
        next_settle: null,
        settle_band: "none",
      }),
    ).toBe("supplier:3");
  });
});

describe("Debt Zod schemas", () => {
  it("validates list filters", () => {
    const parsed = debtsListSchema.parse({
      typeFilter: "customer",
      statusFilter: "overdue",
      dueFilter: "today",
      sort: "remaining_desc",
    });
    expect(parsed.page).toBe(1);
    expect(() => debtsListSchema.parse({ op: "nope" })).not.toThrow();
    expect(() => debtsListSchema.parse({ statusFilter: "paid" })).toThrow();
  });

  it("validates detail and due-date payloads", () => {
    expect(debtTargetSchema.parse({ debtType: "supplier", id: 2 }).id).toBe(2);
    expect(() => debtTargetSchema.parse({ debtType: "client", id: 1 })).toThrow();
    expect(saleDueDateSchema.parse({ id: 1, dueDate: null }).dueDate).toBe(null);
    expect(() => saleDueDateSchema.parse({ id: 1, dueDate: "20/09/2026" })).toThrow();
  });
});
