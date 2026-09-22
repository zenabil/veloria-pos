// Veloria PoS — Tests : zakat (calcul local, paramètres, historique).
import { describe, it, expect } from "vitest";
import { HIJRI_YEARS, nisabMethodLabel } from "@features/zakat/types.ts";
import { computeZakat } from "@domain/zakat/zakat-rules.ts";
import { zakatCalculationSchema, zakatParamsSchema } from "../../electron/ipc/validators.ts";

describe("Zakat helpers", () => {
  it("computes net and zakat", () => {
    expect(
      computeZakat({
        cashMinor: 100000,
        bankMinor: 0,
        stockMinor: 500000,
        receivablesMinor: 200000,
        otherMinor: 0,
        liabilitiesMinor: 100000,
        nisabMinor: 500000,
        ratePercent: 2.5,
      }),
    ).toEqual({ net: 700000, zakat: 17500, above: true });
    expect(
      computeZakat({
        cashMinor: 0,
        bankMinor: 0,
        stockMinor: 100000,
        receivablesMinor: 0,
        otherMinor: 0,
        liabilitiesMinor: 0,
        nisabMinor: 500000,
        ratePercent: 2.5,
      }).above,
    ).toBe(false);
    expect(HIJRI_YEARS.includes("1448")).toBe(true);
    expect(nisabMethodLabel("silver")).toBe("Argent");
  });
});

describe("Zakat Zod schemas", () => {
  it("validates params and calculations", () => {
    const OP = "123e4567-e89b-12d3-a456-426614174000";
    const p = zakatParamsSchema.parse({ ratePercent: 2.5, nisabMinor: 0, nisabMethod: "gold" });
    expect(p.hawlDate).toBe(undefined);
    expect(() => zakatParamsSchema.parse({ ratePercent: 0, nisabMinor: 0 })).toThrow();
    const c = zakatCalculationSchema.parse({
      operationId: OP,
      hijriYear: "1448",
      calcDate: "2026-09-16",
      cashMinor: 100000,
      nisabMinor: 500000,
    });
    expect(c.ratePercent).toBe(2.5);
    expect(() =>
      zakatCalculationSchema.parse({ hijriYear: "48", calcDate: "2026-09-16" }),
    ).toThrow();
    // P1-6 : operationId obligatoire.
    expect(() =>
      zakatCalculationSchema.parse({ hijriYear: "1448", calcDate: "2026-09-16" }),
    ).toThrow();
  });
});
