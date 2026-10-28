// Veloria PoS — Tests : retours (domaine, helpers UI, validateurs Zod).
import { describe, it, expect } from "vitest";
import {
  RETURN_REASONS,
  computeReturnStatus,
  formatReturnNumber,
} from "@domain/returns/return-rules.ts";
import { returnStatusLabel, returnStatusTone } from "@features/returns/types.ts";
import {
  returnCreateSchema,
  returnListSchema,
  returnRefundSchema,
  returnTargetSchema,
} from "../../electron/ipc/validators.ts";

describe("Return domain", () => {
  it("numbers customer and supplier returns", () => {
    expect(formatReturnNumber("customer", 1)).toBe("RET-C-00001");
    expect(formatReturnNumber("supplier", 42)).toBe("RET-S-00042");
    expect(() => formatReturnNumber("customer", 0)).toThrow();
  });

  it("derives status from settled amount", () => {
    expect(computeReturnStatus(1000, 0)).toBe("validated");
    expect(computeReturnStatus(1000, 400)).toBe("partially_refunded");
    expect(computeReturnStatus(1000, 1000)).toBe("refunded");
    expect(() => computeReturnStatus(1000, 1200)).toThrow();
  });

  it("offers French reasons", () => {
    expect(RETURN_REASONS.length).toBeGreaterThanOrEqual(5);
    expect(RETURN_REASONS.includes("Défectueux")).toBe(true);
  });

  it("labels statuses", () => {
    expect(returnStatusLabel("partially_refunded")).toBe("Partiellement remboursé");
    expect(returnStatusTone("refunded")).toBe("green");
    expect(returnStatusTone("cancelled")).toBe("red");
  });
});

describe("Return Zod schemas", () => {
  it("validates creation payloads", () => {
    const op = "123e4567-e89b-12d3-a456-426614174000";
    const c = returnCreateSchema.parse({
      operationId: op,
      kind: "customer",
      saleId: 1,
      items: [{ productId: 2, quantity: 1, restocked: true, condition: "good" }],
      refundMinor: 100,
      refundMethod: "cash",
      reason: "Défectueux",
    });
    expect(c.kind).toBe("customer");
    // A16 (audit 2026-10-27) : `creditMinor` a quitté le contrat (ADR-138 impute
    // l'avoir automatiquement). Une charge héritée qui l'envoie encore est
    // stripped par Zod, jamais réinjectée dans le payload validé.
    expect("creditMinor" in c).toBe(false);
    const legacy = returnCreateSchema.parse({
      operationId: op,
      kind: "customer",
      saleId: 1,
      items: [{ productId: 2, quantity: 1, restocked: true, condition: "good" }],
      refundMinor: 100,
      creditMinor: 99,
      reason: "Défectueux",
    });
    expect("creditMinor" in legacy).toBe(false);
    const s = returnCreateSchema.parse({
      operationId: op,
      kind: "supplier",
      intakeId: 3,
      items: [{ productId: null, quantity: 2, condition: "defective" }],
      reason: "Périmé",
    });
    expect(s.kind).toBe("supplier");
    expect(s.items[0]?.condition).toBe("defective");
    expect(() => returnCreateSchema.parse({ kind: "customer", items: [], reason: "x" })).toThrow();
    expect(() => returnCreateSchema.parse({ kind: "nope", items: [], reason: "xxxx" })).toThrow();
  });

  it("validates list, target and refund payloads", () => {
    const list = returnListSchema.parse({ typeFilter: "supplier", statusFilter: "refunded" });
    expect(list.page).toBe(1);
    expect(() => returnListSchema.parse({ statusFilter: "pending" })).toThrow();
    expect(returnTargetSchema.parse({ kind: "supplier", id: 5 }).id).toBe(5);
    expect(
      returnRefundSchema.parse({
        operationId: "123e4567-e89b-12d3-a456-426614174000",
        kind: "customer",
        id: 1,
        amountMinor: 50,
        method: "cash",
      }).amountMinor,
    ).toBe(50);
    expect(() =>
      returnRefundSchema.parse({
        operationId: "123e4567-e89b-12d3-a456-426614174000",
        kind: "customer",
        id: 1,
        amountMinor: 0,
        method: "cash",
      }),
    ).toThrow();
  });
});
