// Veloria PoS — Tests : strictOrNeg (jamais NaN, sentinelle -1).
import { describe, it, expect } from "vitest";
import { strictOrNeg } from "@shared/money/parse.ts";

describe("strictOrNeg (P1-5)", () => {
  it("vide → 0, valide → centimes, invalide → -1 (jamais NaN)", () => {
    expect(strictOrNeg("")).toBe(0);
    expect(strictOrNeg("   ")).toBe(0);
    expect(strictOrNeg("12,5")).toBe(1250);
    expect(strictOrNeg("abc")).toBe(-1);
    expect(strictOrNeg("-5")).toBe(-1);
    expect(strictOrNeg("99999999999")).toBe(-1);
    expect(Number.isNaN(strictOrNeg("xyz"))).toBe(false);
  });
});
