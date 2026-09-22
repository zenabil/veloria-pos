// Veloria PoS — Tests : dashboard (schéma, garde période).
import { describe, it, expect } from "vitest";
import { dashboardSummarySchema } from "../../electron/ipc/validators.ts";

describe("Dashboard Zod schemas", () => {
  it("validates ranges", () => {
    const s = dashboardSummarySchema.parse({ from: "2026-09-01", to: "2026-09-30" });
    expect(s.from).toBe("2026-09-01");
    expect(() => dashboardSummarySchema.parse({ from: "nope", to: "2026-09-01" })).toThrow();
  });
});
