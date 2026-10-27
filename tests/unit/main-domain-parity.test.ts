// Veloria PoS — Tests P2 : parité main/domaine des règles dupliquées.
// Contexte : electron/ ne peut pas importer src/ (rootDir) — les doublons
// sont volontaires et documentés. Ce fichier PROUVE qu'ils se comportent
// pareil : toute dérive casse ici avant la production.
import { describe, it, expect } from "vitest";
import { isRealCalendarDate as mainIsRealCalendarDate } from "../../electron/ipc/validators.ts";
import { isRealCalendarDate as domainIsRealCalendarDate } from "@/domain/common/dates.ts";
import { isRealCalendarDate as sharedIsRealCalendarDate } from "@/shared/dates/dates.ts";
import { assertValidQuantity } from "@/domain/common/quantity.ts";
import { computeReturnSettlement } from "@/domain/returns/return-rules.ts";
import { splitReturnSettlement } from "../../electron/ipc/handlers/return-settlement.ts";
import { saleItemSchema, closingCreateSchema } from "../../electron/ipc/validators.ts";

const DATES = [
  "2026-09-20",
  "2024-02-29",
  "2023-02-29",
  "2026-02-31",
  "2026-13-01",
  "2026-00-10",
  "2026-04-31",
  "1999-12-31",
  "2100-02-29",
  "2026-9-5",
  "26-09-20",
  "2026/09/20",
  "",
  "pas-une-date",
];

describe("P2 : parité calendaire main/domaine", () => {
  it("mêmes verdicts sur tous les vecteurs", () => {
    for (const d of DATES) {
      expect(mainIsRealCalendarDate(d), `main:${d}`).toBe(domainIsRealCalendarDate(d));
    }
  });
  // G-15 (P1) : la troisième copie (partagée avec le License Manager) doit
  // rendre exactement le même verdict — sinon le Manager émet une licence
  // que le POS rejette (CORRUPTED_STATE).
  it("parité avec la copie partagée (Manager) sur les mêmes vecteurs", () => {
    for (const d of DATES) {
      expect(sharedIsRealCalendarDate(d), `shared:${d}`).toBe(domainIsRealCalendarDate(d));
      expect(sharedIsRealCalendarDate(d), `shared:${d}`).toBe(mainIsRealCalendarDate(d));
    }
  });
  it("businessDate rejette les impossibles", () => {
    const OP = "123e4567-e89b-12d3-a456-426614174000";
    expect(
      closingCreateSchema.parse({ operationId: OP, businessDate: "2026-09-20", openingMinor: 0 })
        .businessDate,
    ).toBe("2026-09-20");
    expect(() =>
      closingCreateSchema.parse({ operationId: OP, businessDate: "2026-02-31", openingMinor: 0 }),
    ).toThrow();
  });
});

const QUANTITIES: Array<{ q: number; ok: boolean }> = [
  { q: 1, ok: true },
  { q: 0.001, ok: true },
  { q: 1_000_000, ok: true },
  // ADR-114 : au-delà de ~16 384, `q*1000` dépasse 1e-9 d'écart flottant —
  // l'ancienne formule IPC rejetait cette quantité pourtant valide (3 déc.).
  { q: 16384.005, ok: true },
  { q: 0, ok: false },
  { q: -1, ok: false },
  { q: 1.00005, ok: false },
  { q: NaN, ok: false },
  { q: Infinity, ok: false },
  { q: 1_000_001, ok: false },
];

describe("P2 : parité quantité main/domaine", () => {
  it("mêmes verdicts (Zod main vs assertValidQuantity)", () => {
    for (const { q, ok } of QUANTITIES) {
      let domainOk = true;
      try {
        assertValidQuantity(q);
      } catch {
        domainOk = false;
      }
      let mainOk = true;
      try {
        saleItemSchema.parse({
          productId: null,
          productName: "X",
          originalUnitPriceMinor: 100,
          unitPriceMinor: 100,
          quantity: q,
        });
      } catch {
        mainOk = false;
      }
      expect(domainOk, `domain:${q}`).toBe(ok);
      expect(mainOk, `main:${q}`).toBe(ok);
    }
  });
});

const SETTLEMENTS: Array<{
  total: number;
  outstanding: number;
  requested: number;
}> = [
  { total: 10000, outstanding: 6000, requested: 4000 },
  { total: 5000, outstanding: 12000, requested: 0 },
  { total: 7000, outstanding: 0, requested: 7000 },
  { total: 7000, outstanding: 0, requested: 2000 },
  { total: 10000, outstanding: 6000, requested: 4001 },
  { total: 0, outstanding: 0, requested: 0 },
  { total: 1000, outstanding: -500, requested: 1000 },
  { total: -1, outstanding: 0, requested: 0 },
];

describe("P2 : parité règlement de retour main/domaine", () => {
  it("mêmes montants et mêmes refus", () => {
    for (const v of SETTLEMENTS) {
      let domainResult: unknown = null;
      let domainError = false;
      try {
        domainResult = computeReturnSettlement({
          totalReturnMinor: v.total,
          outstandingMinor: v.outstanding,
          requestedRefundMinor: v.requested,
        });
      } catch {
        domainError = true;
      }
      let mainResult: unknown = null;
      let mainError = false;
      try {
        mainResult = splitReturnSettlement({
          totalReturnMinor: v.total,
          outstandingMinor: v.outstanding,
          requestedRefundMinor: v.requested,
        });
      } catch {
        mainError = true;
      }
      const label = JSON.stringify(v);
      expect(mainError, `main:${label}`).toBe(domainError);
      if (!domainError) expect(mainResult, `main:${label}`).toEqual(domainResult);
    }
  });
});
