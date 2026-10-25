// Veloria PoS — TOTAUX de période : plafond MAX_MINOR_TOTAL + signe.
import { describe, it, expect } from "vitest";
import {
  formatDzd,
  formatDzdTotal,
  formatDzdTotalSigned,
  minorToInputTotal,
  MAX_MINOR_SINGLE,
  MAX_MINOR_TOTAL,
  parseDzdInputTotal,
} from "../../src/domain/money/money.ts";

const plain = (s: string): string => s.replace(/\u202f/g, " ").replace(/\u00a0/g, " ");

describe("formatDzdTotal", () => {
  it("accepte un total au-delà du plafond d'une valeur unitaire", () => {
    expect(formatDzd(MAX_MINOR_SINGLE + 1)).toBe("—");
    expect(plain(formatDzdTotal(1_500_000_000))).toBe("15 000 000,00 DZD");
    expect(formatDzdTotal(MAX_MINOR_TOTAL)).not.toBe("—");
  });

  it("rejette les totaux hors bornes et les non-entiers", () => {
    expect(formatDzdTotal(-1)).toBe("—");
    expect(formatDzdTotal(MAX_MINOR_TOTAL + 1)).toBe("—");
    expect(formatDzdTotal(Number.NaN)).toBe("—");
    expect(formatDzdTotal(10.6)).toBe("—");
  });

  it("signe les pertes sans les masquer", () => {
    expect(formatDzdTotalSigned(-50000)).toBe(`-${formatDzdTotal(50000)}`);
    expect(formatDzdTotalSigned(-MAX_MINOR_TOTAL)).not.toBe("—");
    expect(formatDzdTotalSigned(50000)).toBe(formatDzdTotal(50000));
  });

  it("parse et pré-remplit un paiement au-delà du plafond unitaire", () => {
    expect(parseDzdInputTotal("15000000,00")).toBe(1_500_000_000);
    expect(minorToInputTotal(1_500_000_000)).toBe("15000000");
    expect(() => parseDzdInputTotal(String(MAX_MINOR_TOTAL / 100 + 1))).toThrow();
  });
});
