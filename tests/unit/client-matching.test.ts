// Veloria PoS — Tests P2 : rapprochement 360 (pur, extrait de ClientDialogs).
import { describe, it, expect } from "vitest";
import {
  normFr,
  asMinor,
  asCreatedAt,
  matchClient,
  keepClient,
} from "@/features/customers/client-matching.ts";

describe("client-matching (rapprochement 360)", () => {
  it("normFr: accents/casse/ponctuation neutralisés", () => {
    expect(normFr("Amine Benali")).toBe("amine benali");
    expect(normFr("Hôtel-Café  L'Atlas")).toBe("hotel cafe l atlas");
    expect(normFr(null)).toBe("");
    expect(normFr(undefined)).toBe("");
  });

  it("asMinor: entier sûr, jamais NaN", () => {
    expect(asMinor(1250)).toBe(1250);
    expect(asMinor(12.9)).toBe(12);
    expect(asMinor("300")).toBe(300);
    expect(asMinor(NaN)).toBe(0);
    expect(asMinor(undefined)).toBe(0);
    expect(asMinor({})).toBe(0);
  });

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
