// Veloria PoS — Tests : pain (helpers UI, cycle de statuts, validateurs Zod).
import { describe, it, expect } from "vitest";
import {
  NEXT_STATUSES,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
} from "@features/bread/types.ts";
import { breadCreateSchema, breadStatusSchema } from "../../electron/ipc/validators.ts";

describe("Bread UI helpers", () => {
  it("labels the 6-state lifecycle", () => {
    expect(orderStatusLabel("new")).toBe("Nouvelle");
    expect(orderStatusLabel("preparing")).toBe("En préparation");
    expect(orderStatusTone("ready")).toBe("amber");
    expect(orderStatusTone("delivered")).toBe("green");
    expect(paymentStatusLabel("partial")).toBe("Partielle");
    expect(Object.keys(NEXT_STATUSES)).toEqual([
      "new",
      "confirmed",
      "preparing",
      "ready",
      "delivered",
      "cancelled",
    ]);
    expect(NEXT_STATUSES["new"]).toEqual(["confirmed", "cancelled"]);
    expect(NEXT_STATUSES["delivered"]).toEqual([]);
  });
});

describe("Bread Zod schemas", () => {
  it("validates enriched creation", () => {
    const c = breadCreateSchema.parse({
      operationId: "123e4567-e89b-12d3-a456-426614174000",
      breadType: "Pain maison",
      pickupDate: "2026-09-20",
      quantity: 10,
      unitPriceMinor: 1500,
    });
    expect(c.paymentMethod).toBe(undefined);
    expect(() =>
      breadCreateSchema.parse({
        operationId: "123e4567-e89b-12d3-a456-426614174000",
        breadType: "x",
        pickupDate: "2026-09-20",
        quantity: 1,
        unitPriceMinor: 0,
      }),
    ).toThrow();
  });

  it("validates status transitions", () => {
    const op = { operationId: "123e4567-e89b-12d3-a456-426614174000" };
    expect(breadStatusSchema.parse({ ...op, id: 1, to: "confirmed" }).to).toBe("confirmed");
    expect(() => breadStatusSchema.parse({ ...op, id: 1, to: "pending" })).toThrow();
    // P0-1 : operationId obligatoire (mutation idempotente).
    expect(() => breadStatusSchema.parse({ id: 1, to: "confirmed" })).toThrow();
  });
});
