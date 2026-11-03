// Veloria PoS — E-36 : la saisie d'argent ne passe PLUS par une coercion
// `Number()`. `Number("0x10")=16`, `Number("1e3")=1000`, `Number("+7")=7`
// étaient acceptés : un tarif fournisseur lu « 1.5E3 » dans un CSV devenait
// silencieusement 150,00 DZD. La politique d'entrée est désormais la même que
// `parseQuantityInput` (gate regex) et la conversion centime est exacte, sur la
// chaîne.
import { describe, it, expect } from "vitest";
import {
  MAX_MINOR_SINGLE,
  MAX_MINOR_TOTAL,
  MoneyError,
  minorToInput,
  minorToInputTotal,
  parseDzdInputStrict,
  parseDzdInputTotal,
} from "@/domain/money/money.ts";

describe("parseDzdInputStrict — gate d'entrée (E-36)", () => {
  it("refuse les formes numériques non décimales que Number() acceptait", () => {
    for (const hostile of ["0x10", "0b11", "1e3", "1.5E3", "+7", "1_000", "1,2,3", ". "]) {
      expect(() => parseDzdInputStrict(hostile, "Montant"), `accepté : ${hostile}`).toThrow(
        MoneyError,
      );
    }
  });

  it("l'espace n'est QU'UN séparateur de milliers (forme française)", () => {
    expect(parseDzdInputStrict("1 2 3 4")).toBe(123400);
  });

  it("accepte une décimale en cours de frappe (« 12. » = 12,00)", () => {
    expect(parseDzdInputStrict("12.")).toBe(1200);
    expect(parseDzdInputStrict("12,")).toBe(1200);
  });

  it("accepte la saisie française réelle, groupement compris", () => {
    expect(parseDzdInputStrict("1250")).toBe(125000);
    expect(parseDzdInputStrict("1 250")).toBe(125000);
    expect(parseDzdInputStrict("1\u00A0250,50")).toBe(125050);
    // U+202F : l'espace fine insécable que `Intl fr-FR` produit réellement.
    expect(parseDzdInputStrict("1\u202F250,50")).toBe(125050);
    expect(parseDzdInputStrict("1250.50")).toBe(125050);
    expect(parseDzdInputStrict("0,5")).toBe(50);
    expect(parseDzdInputStrict("0")).toBe(0);
  });

  it("refuse le négatif avec le message dédié (pas « non numérique »)", () => {
    expect(() => parseDzdInputStrict("-1", "Montant")).toThrow(/négatif interdit/);
  });

  it("garde le aller-retour minorToInput ↔ parse (contrat des dialogues)", () => {
    for (const minor of [0, 1, 5, 99, 100, 1250, 1999, 100000, 1_500_000_000]) {
      expect(parseDzdInputTotal(minorToInputTotalOf(minor))).toBe(minor);
    }
    expect(parseDzdInputStrict(minorToInput(81000))).toBe(81000);
  });

  it("arrondit au centime supérieur à mi-chemin, SANS double arrondi", () => {
    expect(parseDzdInputStrict("10.005")).toBe(1001);
    expect(parseDzdInputStrict("2.675")).toBe(268);
    expect(parseDzdInputStrict("10.004")).toBe(1000);
    // L'ancien `toFixed(6)` faisait remonter 10.0049999 à 10.005 → 1001.
    expect(parseDzdInputStrict("10.0049999")).toBe(1000);
    expect(parseDzdInputStrict("10.0050001")).toBe(1001);
  });

  it("borne la capacité avec un message lisible, jamais un plafond muet", () => {
    expect(() => parseDzdInputStrict(String(MAX_MINOR_SINGLE / 100 + 1), "Prix")).toThrow(
      /trop élevé|hors bornes/,
    );
    expect(parseDzdInputTotal("999999999,99")).toBe(99_999_999_999);
    expect(() => parseDzdInputTotal("1000000001")).toThrow();
  });
});

/** `minorToInput` avec le plafond TOTAL (les dialogues de règlement l'utilisent). */
function minorToInputTotalOf(minor: number): string {
  return minorToInputTotal(minor);
}

describe("bornes single/total (E-37)", () => {
  it("un total de ligne au-dessus du plafond unitaire somme sans fausse erreur", () => {
    // Prix unitaire légal (≤ MAX_MINOR_SINGLE) × quantité → ligne à 1,5e9.
    // L'ancien `sumSafeMinors` validait chaque addenda à 1e9 et refusait cette
    // ligne correcte avec « Sous-total invalide : hors bornes [0, 1000000000] ».
    const line = 1_500_000_000;
    expect(() => parseDzdInputTotal(minorToInputTotal(line))).not.toThrow();
    expect(line).toBeGreaterThan(MAX_MINOR_SINGLE);
    expect(line).toBeLessThan(MAX_MINOR_TOTAL);
  });
});
