// Veloria PoS — Tests : formatDzdSigned (affichage signé, jamais de throw).
// Pertes (marge/resultat negatifs) : "-500,00 DZD" au lieu du crash formatDzd.
import { describe, it, expect } from "vitest";
import { formatDzd } from "@/domain/money/money.ts";
import { formatDzdSigned } from "@shared/formatters/format.ts";

describe("formatDzdSigned", () => {
  it("formats positives like formatDzd", () => {
    expect(formatDzdSigned(125000)).toBe(formatDzd(125000));
    expect(formatDzdSigned(0)).toBe(formatDzd(0));
  });
  it("prefixes negatives instead of throwing", () => {
    expect(formatDzdSigned(-50000)).toBe(`-${formatDzd(50000)}`);
    expect(() => formatDzdSigned(-1)).not.toThrow();
  });
  it("rounds and degrades corrupt input to em-dash", () => {
    expect(formatDzdSigned(10.6)).toBe(formatDzd(11));
    for (const bad of [NaN, Infinity, -Infinity, "abc", null, undefined]) {
      expect(formatDzdSigned(bad)).toBe("—");
    }
  });
});
