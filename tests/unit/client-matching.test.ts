// Veloria PoS — Tests P2 : rapprochement 360 (pur, extrait de ClientDialogs).
import { describe, it, expect } from "vitest";
import {
  normFr,
  asCreatedAt,
  matchClient,
  keepClient,
} from "@/features/customers/client-matching.ts";

describe("client-matching (rapprochement 360)", () => {
  it("normFr: accents/casse neutralisés (W7/E-29 : parité avec le main)", () => {
    expect(normFr("Amine Benali")).toBe("amine benali");
    expect(normFr("Hôtel-Café  L'Atlas")).toBe("hotel-cafe l'atlas");
    expect(normFr(null)).toBe("");
    expect(normFr(undefined)).toBe("");
  });

  // W7 (D-08) : `asMinor` a quitté ce module — la conversion de montant est
  // désormais `toMinorSafe` (`@domain/money/money.ts`), testée dans
  // `money-rule-convergence.test.ts`.

  it("asCreatedAt: chaîne sûre", () => {
    expect(asCreatedAt({ created_at: "2026-01-01" })).toBe("2026-01-01");
    expect(asCreatedAt({ created_at: 5 })).toBe("");
    expect(asCreatedAt({})).toBe("");
  });

  it("matchClient: nom vide = tout, mot >2 lettres suffit", () => {
    expect(matchClient("", ["X"])).toBe(true);
    expect(matchClient("amine", ["Amine Benali", "FAC-1"])).toBe(true);
    expect(matchClient("amine benali", ["Benali"])).toBe(true);
    expect(matchClient("amine", [""])).toBe(false);
    expect(matchClient("amine", ["Fournisseur Y"])).toBe(false);
  });

  it("keepClient: repli = toutes les lignes si aucun rapprochement", () => {
    const rows = [{ n: "A" }, { n: "B" }];
    expect(keepClient(rows, (r) => [r.n], normFr("A"))).toEqual([{ n: "A" }]);
    expect(keepClient(rows, (r) => [r.n], normFr("Zzz"))).toEqual(rows);
  });
});
