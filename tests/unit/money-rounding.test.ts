// Veloria PoS — E-34 : arrondi monétaire « half away from zero » exact.
// Avant : `Math.round(10.005 * 100)` = Math.round(1000.4999999999999) = 1000
// ⇒ un centime perdu sur une saisie à 3 décimales.
// Après : la conversion passe par la chaîne décimale (jamais de float binaire).
import { describe, it, expect } from "vitest";
import { fromDzd, parseDzdInputStrict, MINOR_PER_MAJOR } from "@domain/money/money.ts";

describe("E-34 : arrondi au centime supérieur (half away from zero)", () => {
  it("10.005 → 1001 (et non 1000)", () => {
    expect(parseDzdInputStrict("10.005")).toBe(1001);
    expect(fromDzd(10.005)).toBe(1001);
  });

  it("2.675 → 268 (cas classique du float binaire)", () => {
    expect(parseDzdInputStrict("2.675")).toBe(268);
    expect(fromDzd(2.675)).toBe(268);
  });

  it("valeurs à 2 décimales : inchangées", () => {
    expect(parseDzdInputStrict("12,5")).toBe(1250);
    expect(parseDzdInputStrict("19.99")).toBe(1999);
    expect(parseDzdInputStrict("0.01")).toBe(1);
    expect(parseDzdInputStrict("0")).toBe(0);
    expect(fromDzd(19.99)).toBe(1999);
  });

  it("arrondi au centime inférieur si la 4ᵉ décimale < 5", () => {
    expect(parseDzdInputStrict("10.004")).toBe(1000);
    expect(parseDzdInputStrict("10.000")).toBe(1000);
  });

  it("arrondi cohérent pour les grandes valeurs (100 DZD = 10000 centimes)", () => {
    expect(fromDzd(100)).toBe(100 * MINOR_PER_MAJOR);
    expect(parseDzdInputStrict("100")).toBe(100 * MINOR_PER_MAJOR);
  });

  it("saisie invalide toujours refusée (jamais de NaN silencieux)", () => {
    expect(() => parseDzdInputStrict("abc")).toThrow();
    expect(() => parseDzdInputStrict("")).toThrow();
    expect(() => parseDzdInputStrict("-1")).toThrow();
  });
});
