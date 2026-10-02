import { describe, it, expect } from "vitest";
import {
  fromDzd,
  parseDzdInputStrict,
  formatDzd,
  minorToInput,
  percentOfMinor,
  multiplyMinorByQuantity,
  sumSignedMinors,
} from "@/domain/money/money.ts";

describe("Money (DZD minor units)", () => {
  it("converts DZD to centimes without float error", () => {
    expect(fromDzd(100)).toBe(10000);
    expect(fromDzd(19.99)).toBe(1999);
    expect(multiplyMinorByQuantity(1999, 3)).toBe(5997);
  });

  it("computes percent discounts deterministically", () => {
    expect(percentOfMinor(10000, 10)).toBe(1000);
    expect(percentOfMinor(999, 10)).toBe(100); // rounded
  });

  it("parses French form input strict (comma supported, never NaN)", () => {
    expect(parseDzdInputStrict("12,5")).toBe(1250);
    expect(parseDzdInputStrict(" 10.25 ")).toBe(1025);
    expect(parseDzdInputStrict("0")).toBe(0);
    // P1-5/P1-8 : invalide = erreur FR contrôlée, jamais NaN.
    expect(() => parseDzdInputStrict("")).toThrow("vide");
    expect(() => parseDzdInputStrict("abc")).toThrow("non numérique");
    expect(() => parseDzdInputStrict("-5")).toThrow("négatif");
  });

  it("formats French DZD", () => {
    const s = formatDzd(81000);
    expect(s).toContain("810");
    expect(s).toContain("DZD");
  });

  it("minorToInput: identical to legacy pattern + round-trip strict", () => {
    // Identique à `(m / 100).toString().replace(".", ",")` pour tout entier sûr.
    for (const m of [0, 1, 5, 50, 99, 100, 101, 1250, 10000, 1999, 100000, 1_000_000_000]) {
      expect(minorToInput(m)).toBe((m / 100).toString().replace(".", ","));
      expect(parseDzdInputStrict(minorToInput(m))).toBe(m);
    }
    expect(minorToInput(1250)).toBe("12,5");
    expect(() => minorToInput(NaN)).toThrow();
    expect(() => minorToInput(-1)).toThrow();
  });

  it("sums signed minors (discounts + surcharges bounded)", () => {
    expect(sumSignedMinors([2000, -500, 0])).toBe(1500);
    expect(sumSignedMinors([])).toBe(0);
    expect(() => sumSignedMinors([100_000_000_001])).toThrow();
    expect(() => sumSignedMinors([100_000_000_000, 1])).toThrow();
    expect(() => sumSignedMinors([NaN])).toThrow();
  });
});
