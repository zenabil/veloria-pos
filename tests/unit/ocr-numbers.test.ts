// Veloria PoS — Tests OCR : montants FR/DZ → centimes.
import { describe, it, expect } from "vitest";
import {
  parseOcrAmountToMinor,
  parseOcrDiscountPct,
  parseOcrQuantity,
} from "@domain/ocr/numbers.ts";

describe("OCR numbers", () => {
  it("montants FR standards", () => {
    expect(parseOcrAmountToMinor("145.00")).toBe(14500);
    expect(parseOcrAmountToMinor("145,00")).toBe(14500);
    expect(parseOcrAmountToMinor("12,5")).toBe(1250);
    expect(parseOcrAmountToMinor("0")).toBe(0);
  });
  it("milliers espacés ou pointés", () => {
    expect(parseOcrAmountToMinor("8 900.00")).toBe(890000);
    expect(parseOcrAmountToMinor("1 691.00")).toBe(169100);
    expect(parseOcrAmountToMinor("10 591.00")).toBe(1059100);
    expect(parseOcrAmountToMinor("1.234,56")).toBe(123456);
    expect(parseOcrAmountToMinor("1 234,56")).toBe(123456);
  });
  it("point + 3 chiffres final = milliers (pas de devinette décimale)", () => {
    expect(parseOcrAmountToMinor("1.450")).toBe(145000);
  });
  it("rejette l'illisible (null, jamais d'exception)", () => {
    expect(parseOcrAmountToMinor("")).toBe(null);
    expect(parseOcrAmountToMinor("abc")).toBe(null);
    expect(parseOcrAmountToMinor("12,3456")).toBe(null);
    expect(parseOcrAmountToMinor("--5")).toBe(null);
    expect(parseOcrAmountToMinor("12-34")).toBe(null);
  });
  it("quantités", () => {
    expect(parseOcrQuantity("20")).toBe(20);
    expect(parseOcrQuantity("12,5")).toBe(12.5);
    expect(parseOcrQuantity("0")).toBe(null);
    expect(parseOcrQuantity("-3")).toBe(null);
    expect(parseOcrQuantity("abc")).toBe(null);
  });
  it("remises", () => {
    expect(parseOcrDiscountPct("5%")).toBe(5);
    expect(parseOcrDiscountPct("-10 %")).toBe(10);
    expect(parseOcrDiscountPct("150%")).toBe(null);
    expect(parseOcrDiscountPct("10")).toBe(null);
  });
});
