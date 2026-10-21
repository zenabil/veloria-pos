// Veloria PoS — W7 : convergence des règles financières et de quantité.
//
// L'audit intégral 2026-10-19 a relevé des règles DUPLIQUÉES (D-02 → D-08)
// : deux parseurs de quantité, deux formateurs de quantité, deux calculs
// d'écart en jours, deux parseurs stricts, une conversion de montant, et
// des multiplications « prix × quantité » sans garde de capacité.
//
// Ce fichier verrouille les règles uniques ET prouve qu'elles se
// comportent comme les copies remplacées (pour les valeurs valides : le
// comportement doit être IDENTIQUE, sinon la convergence changeait la
// production en silence).
import { describe, it, expect } from "vitest";
import { formatQuantityFr, parseQuantityInput, roundQuantity } from "@domain/common/quantity.ts";
import { daysBetween } from "@domain/common/dates.ts";
import {
  multiplyMinorByQuantity,
  multiplyMinorByQuantitySafe,
  percentOfMinor,
  toMinorSafe,
} from "@domain/money/money.ts";
import { strictOrNeg, strictOrNum } from "@shared/money/parse.ts";

describe("W7 (D-02) : une seule règle de saisie de quantité", () => {
  it("virgule FR, 3 décimales, bornes", () => {
    expect(parseQuantityInput("12,5")).toBe(12.5);
    expect(parseQuantityInput(" 2 ")).toBe(2);
    expect(parseQuantityInput("1,2345")).toBe(1.235);
    expect(parseQuantityInput("1000000")).toBe(1000000);
    expect(parseQuantityInput("1000001")).toBeNull();
  });

  it("rejette ce que Number() aurait accepté (saisie de caisse)", () => {
    expect(parseQuantityInput("")).toBeNull();
    expect(parseQuantityInput("abc")).toBeNull();
    expect(parseQuantityInput("-3")).toBeNull();
    expect(parseQuantityInput("1e3")).toBeNull();
    expect(parseQuantityInput("0x10")).toBeNull();
    expect(parseQuantityInput("+5")).toBeNull();
  });

  it("le 0 n'est valide que si on le demande (stock, seuil)", () => {
    expect(parseQuantityInput("0")).toBeNull();
    expect(parseQuantityInput("0", { allowZero: true })).toBe(0);
  });
});

describe("W7 (D-03) : un seul formatage de quantité (FR)", () => {
  it("virgule décimale, zéros parasites retirés", () => {
    expect(formatQuantityFr(1.5)).toBe("1,5");
    expect(formatQuantityFr(1.235)).toBe("1,235");
    expect(formatQuantityFr(2)).toBe("2");
    expect(formatQuantityFr(0.001)).toBe("0,001");
  });

  it("identique à l'ancien arrondi (3 décimales)", () => {
    for (const q of [0, 1, 1.5, 1.2345, 12.3456, 999.9999]) {
      expect(formatQuantityFr(q)).toBe(String(roundQuantity(q)).replace(".", ","));
    }
  });
});

describe("W7 (D-06) : un seul écart en jours", () => {
  it("positif, négatif et bornes", () => {
    expect(daysBetween("2026-09-01", "2026-09-20")).toBe(19);
    expect(daysBetween("2026-09-20", "2026-09-01")).toBe(-19);
    expect(daysBetween("2026-09-20", "2026-09-20")).toBe(0);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2023-02-28", "2023-03-01")).toBe(1);
  });

  it("NaN si une date est illisible (l'appelant garde sa politique)", () => {
    expect(Number.isNaN(daysBetween("pas-une-date", "2026-09-20"))).toBe(true);
    expect(Number.isNaN(daysBetween("2026-09-20", ""))).toBe(true);
  });
});

describe("W7 (D-04/D-05) : règles financières uniques", () => {
  it("percentOfMinor : arrondi au centime (identique au calcul inline)", () => {
    expect(percentOfMinor(10000, 5)).toBe(500);
    expect(percentOfMinor(333, 50)).toBe(Math.round((333 * 50) / 100));
    expect(percentOfMinor(0, 30)).toBe(0);
    expect(() => percentOfMinor(10000, 101)).toThrow();
  });

  it("multiplyMinorByQuantity : arrondi + garde de capacité", () => {
    expect(multiplyMinorByQuantity(250, 3)).toBe(750);
    expect(multiplyMinorByQuantity(250, 1.5)).toBe(375);
    expect(multiplyMinorByQuantity(250, 0)).toBe(0);
    // Hors capacité : la règle refuse (le site renderer, lui, ne lève pas).
    expect(() => multiplyMinorByQuantity(1_000_000_000, 1_000_000)).toThrow();
  });

  it("multiplyMinorByQuantitySafe : même résultat sur les valeurs valides", () => {
    for (const [unit, qty] of [
      [250, 3],
      [250, 1.5],
      [1234, 0.125],
      [0, 5],
    ] as const) {
      expect(multiplyMinorByQuantitySafe(unit, qty)).toBe(Math.round(unit * qty));
    }
  });

  it("multiplyMinorByQuantitySafe : jamais d'exception (règle A-01 du rendu)", () => {
    expect(multiplyMinorByQuantitySafe(1_000_000_000, 1_000_000)).toBe(0);
    expect(multiplyMinorByQuantitySafe(-5, 2)).toBe(0);
    expect(multiplyMinorByQuantitySafe(100, Number.NaN)).toBe(0);
  });
});

describe("W7 (D-07) : un seul parseur strict (sentinelle -1)", () => {
  it("strictOrNum : invalide ⇒ -1 (jamais NaN)", () => {
    expect(strictOrNum("1250")).toBe(125000);
    expect(strictOrNum("12,5")).toBe(1250);
    expect(strictOrNum("abc")).toBe(-1);
    expect(strictOrNum("-5")).toBe(-1);
    expect(strictOrNum("99999999999")).toBe(-1);
    expect(Number.isNaN(strictOrNum("xyz"))).toBe(false);
  });

  it("strictOrNeg : vide ⇒ 0, sinon strictOrNum", () => {
    expect(strictOrNeg("")).toBe(0);
    expect(strictOrNeg("   ")).toBe(0);
    expect(strictOrNeg("12,5")).toBe(1250);
    expect(strictOrNeg("abc")).toBe(-1);
  });
});

describe("W7 (D-08) : une seule conversion de montant (leniente)", () => {
  it("entier sûr, jamais NaN (identique à l'ancien asMinor)", () => {
    expect(toMinorSafe(1250)).toBe(1250);
    expect(toMinorSafe(12.9)).toBe(12);
    expect(toMinorSafe("300")).toBe(300);
    expect(toMinorSafe(Number.NaN)).toBe(0);
    expect(toMinorSafe(undefined)).toBe(0);
    expect(toMinorSafe({})).toBe(0);
    expect(toMinorSafe(null)).toBe(0);
  });
});
