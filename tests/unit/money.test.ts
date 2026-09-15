import { describe, it, expect } from "vitest";
import {
  fromDzd,
  formatDzd,
  percentOfMinor,
  multiplyMinorByQuantity,
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

  it("formats French DZD", () => {
    const s = formatDzd(81000);
    expect(s).toContain("810");
    expect(s).toContain("DZD");
  });
});
