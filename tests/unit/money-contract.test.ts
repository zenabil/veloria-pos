// Veloria PoS — MONEY-02 / GATE-03 : CONTRAT monétaire SPÉCIFIÉ.
//
// La parité ne prouve pas la correction : deux implémentations peuvent être
// d'accord ET fausses. Les tests existants (`money-guard-parity`,
// `money-rule-convergence`) confrontent le domaine à ses miroirs ; celui-ci
// confronte le domaine à son CONTRAT ÉCRIT.
//
// Source du contrat (citées dans le test, pour qu'une dérive du code soit
// visible comme une dérive du contrat) :
//  - `src/domain/money/money.ts` — en-tête (« 100 DZD === 10000 minor »),
//    JSDoc de `decimalStringToMinor` (« 12.5 → 1250 · 10.005 → 1001 ·
//    10.0049999 → 1000 · 2.675 → 268 »), bornes `MAX_MINOR_SINGLE` /
//    `MAX_MINOR_TOTAL` ;
//  - `.opencode/skills/veloria-money/references/parity-and-rounding.md` —
//    table de contrat (arrondi, conservation, bornes) ;
//  - `src/domain/proforma/proforma-rules.ts` — répartition exacte (plus grand
//    reste) : « Σ des parts = montant, au centime près » ;
//  - `src/domain/sales/sale-rules.ts` — total = sous-total − remises +
//    livraison ; reste = total − payé.
//
// Preuve négative : toutes les assertions portent sur une VALEUR EXACTE ou
// une PROPRIÉTÉ. Basculer la règle d'arrondi (half-up → half-even, centime →
// millième), relever une borne, ou casser la conservation fait échouer ce
// test. Il n'est pas vert par construction.
import { describe, it, expect } from "vitest";
import {
  MINOR_PER_MAJOR,
  MAX_MINOR_SINGLE,
  MAX_MINOR_TOTAL,
  fromDzd,
  parseDzdInputStrict,
  parseDzdInputTotal,
  percentOfMinor,
  multiplyMinorByQuantity,
  minorToInput,
  minorToInputTotal,
  formatDzd,
  formatDzdTotal,
  sumSafeMinors,
  sumSignedMinors,
} from "@/domain/money/money.ts";
import { allocateGlobalDiscount } from "@/domain/proforma/proforma-rules.ts";
import { computeSaleTotals } from "@/domain/sales/sale-rules.ts";

describe("MONEY-02 / GATE-03 — CONTRAT monétaire (spécification, pas parité)", () => {
  // ---------------------------------------------------------------------
  // A. Échelle des unités
  // ---------------------------------------------------------------------
  describe("A. échelle des unités", () => {
    it("100 DZD = 10000 centimes (contrat de l'en-tête du module)", () => {
      expect(MINOR_PER_MAJOR).toBe(100);
      expect(fromDzd(100)).toBe(10000);
      expect(parseDzdInputStrict("100")).toBe(10000);
      expect(formatDzd(10000)).toBe("100,00 DZD");
    });

    it("l'unité est entière : aucune fraction de centime n'existe", () => {
      expect(Number.isInteger(fromDzd(19.99))).toBe(true);
      expect(fromDzd(19.99)).toBe(1999);
      // 0.01 DZD = 1 centime : l'unité inférieure est le centime, pas le
      // millième (qui n'est utilisé que pour les QUANTITÉS, voir STK-01).
      expect(parseDzdInputStrict("0.01")).toBe(1);
    });
  });

  // ---------------------------------------------------------------------
  // B. Les exemples d'arrondi documentés
  // ---------------------------------------------------------------------
  describe("B. les exemples d'arrondi documentés", () => {
    // money.ts, JSDoc de `decimalStringToMinor` :
    // « 12.5 → 1250 · 10.005 → 1001 · 10.0049999 → 1000 · 2.675 → 268 »
    it("12,5 → 1250", () => {
      expect(parseDzdInputStrict("12.5")).toBe(1250);
      expect(parseDzdInputStrict("12,5")).toBe(1250);
      expect(fromDzd(12.5)).toBe(1250);
    });

    it("10,005 → 1001 (et non 1000)", () => {
      expect(parseDzdInputStrict("10.005")).toBe(1001);
      expect(fromDzd(10.005)).toBe(1001);
    });

    it("10,0049999 → 1000 (la 3ᵉ décimale décide seule)", () => {
      expect(parseDzdInputStrict("10.0049999")).toBe(1000);
    });

    it("2,675 → 268 (cas classique du flottant binaire)", () => {
      expect(parseDzdInputStrict("2.675")).toBe(268);
      expect(fromDzd(2.675)).toBe(268);
    });

    it("la règle est « demi arrondi VERS LE HAUT » (half away from zero)", () => {
      // 3ᵉ décimale = 5 ⇒ +1 centime ; 3ᵉ décimale = 4 ⇒ aucun centime.
      expect(parseDzdInputStrict("1.005")).toBe(101);
      expect(parseDzdInputStrict("1.004")).toBe(100);
      expect(parseDzdInputStrict("1.015")).toBe(102);
      expect(parseDzdInputStrict("1.025")).toBe(103);
    });

    it("un flottant binaire ne peut pas s'infiltrer dans l'arrondi", () => {
      // 1.005 * 100 = 100.49999999999999 en IEEE-754 ⇒ 1000 si on multiplie.
      // Le contrat impose 1001.
      expect(1.005 * 100).not.toBe(101);
      expect(parseDzdInputStrict("1.005")).toBe(101);
    });
  });

  // ---------------------------------------------------------------------
  // C. La liste des saisies rejetées
  // ---------------------------------------------------------------------
  describe("C. la liste des saisies rejetées", () => {
    // money.ts, JSDoc de `parseDzdInputStrict` : « AUCUNE COERCION Number()
    // sur la saisie brute : Number("0x10")=16, Number("1e3")=1000,
    // Number("+7")=7 étaient ACCEPTÉS […] Le contrat refuse le vide, le
    // négatif, l'exposant, l'hexadécimal, le séparateur multiple. »
    const rejected: Array<[string, string]> = [
      ["", "vide"],
      ["   ", "vide"],
      ["abc", "non numérique"],
      ["-5", "négatif"],
      ["-0.01", "négatif"],
      ["1e3", "notation exposant"],
      ["0x10", "hexadécimal"],
      ["+7", "signe plus"],
      ["1.2.3", "séparateur multiple"],
      ["1,2,3", "séparateur multiple"],
      ["1 000,00.50", "deux points"],
      ["NaN", "non numérique"],
      ["Infinity", "non numérique"],
      ["1/2", "non numérique"],
      ["12,50 DA", "unité collée"],
      ["--5", "non numérique"],
    ];

    for (const [raw, motif] of rejected) {
      it(`refuse « ${raw} » (${motif})`, () => {
        expect(() => parseDzdInputStrict(raw)).toThrow();
      });
    }

    it("refuse une saisie non textuelle (jamais de coercition)", () => {
      for (const raw of [null, undefined, 12, {}, [], true, Number.NaN]) {
        expect(() => parseDzdInputStrict(raw as string)).toThrow();
      }
    });

    it("le refus est une erreur contrôlée, jamais un NaN silencieux", () => {
      let caught: unknown = null;
      try {
        parseDzdInputStrict("abc");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/non numérique/i);
      expect((caught as Error).message).not.toMatch(/NaN/);
    });

    it("refuse un montant trop élevé (au-delà de 13 chiffres entiers)", () => {
      expect(() => parseDzdInputStrict("123456789012345")).toThrow(/trop élevé/i);
    });
  });

  // ---------------------------------------------------------------------
  // D. Les bornes
  // ---------------------------------------------------------------------
  describe("D. les bornes (juste à la limite, juste au-delà)", () => {
    it("MAX_MINOR_SINGLE : la borne EXACTE est acceptée", () => {
      expect(MAX_MINOR_SINGLE).toBe(1_000_000_000);
      // 10 000 000,00 DZD = 1 000 000 000 centimes : la borne est inclusive.
      expect(parseDzdInputStrict("10000000")).toBe(MAX_MINOR_SINGLE);
      expect(fromDzd(10_000_000)).toBe(MAX_MINOR_SINGLE);
      expect(formatDzd(MAX_MINOR_SINGLE)).toBe("10\u202f000\u202f000,00 DZD");
    });

    it("MAX_MINOR_SINGLE : un centime au-delà est REFUSÉ", () => {
      expect(() => parseDzdInputStrict("10000000.01")).toThrow(/hors bornes/i);
      expect(() => fromDzd(10_000_000.01)).toThrow(/hors bornes/i);
    });

    it("MAX_MINOR_TOTAL : borne de TOTAL, plus haute que la borne unitaire", () => {
      expect(MAX_MINOR_TOTAL).toBe(100_000_000_000);
      expect(parseDzdInputTotal("1000000000")).toBe(MAX_MINOR_TOTAL);
      expect(() => parseDzdInputTotal("1000000000.01")).toThrow(/hors bornes/i);
      // La borne unitaire reste applicable à une VALEUR UNITAIRE.
      expect(() => parseDzdInputStrict("1000000000")).toThrow(/hors bornes/i);
    });

    it("une multiplication qui dépasserait le plafond de TOTAL est refusée AVANT le calcul", () => {
      // 1 000 000 000 × 100 = 1e11 = plafond exact : accepté.
      expect(multiplyMinorByQuantity(MAX_MINOR_SINGLE, 100)).toBe(MAX_MINOR_TOTAL);
      // 1 000 000 000 × 101 : refusé, jamais un nombre flottant dégradé.
      expect(() => multiplyMinorByQuantity(MAX_MINOR_SINGLE, 101)).toThrow(
        /dépassement de capacité/i,
      );
    });

    it("une quantité hors bornes est refusée", () => {
      expect(() => multiplyMinorByQuantity(1000, 1_000_001)).toThrow(/Quantité invalide/i);
      expect(() => multiplyMinorByQuantity(1000, -1)).toThrow(/Quantité invalide/i);
      expect(() => multiplyMinorByQuantity(1000, Number.NaN)).toThrow(/Quantité invalide/i);
      expect(() => multiplyMinorByQuantity(1000, Infinity)).toThrow(/Quantité invalide/i);
    });

    it("la quantité nulle est permise AU NIVEAU MONÉTAIRE, refusée au niveau VENTE", () => {
      // Distinction de couches explicite : le calcul monétaire accepte 0
      // (une remise de 0 × qté vaut 0), la VENTE refuse une quantité nulle
      // (une vente de 0 n'est pas une vente).
      expect(multiplyMinorByQuantity(1000, 0)).toBe(0);
      expect(() =>
        computeSaleTotals({
          lines: [
            {
              productId: 1,
              productName: "Article A",
              unitCode: "U",
              originalUnitPriceMinor: 1000,
              unitPriceMinor: 1000,
              purchasePriceMinor: 500,
              quantity: 0,
            },
          ],
          deliveryFeeMinor: 0,
          amountPaidMinor: 0,
        }),
      ).toThrow(/supérieure à zéro/i);
    });

    it("un pourcentage hors [0,100] est refusé", () => {
      expect(() => percentOfMinor(10000, -1)).toThrow(/Pourcentage/i);
      expect(() => percentOfMinor(10000, 101)).toThrow(/Pourcentage/i);
      expect(percentOfMinor(10000, 0)).toBe(0);
      expect(percentOfMinor(10000, 100)).toBe(10000);
    });

    it("un total signé refuse de dépasser le plafond signé", () => {
      expect(() => sumSignedMinors([MAX_MINOR_TOTAL, 1])).toThrow();
      expect(() => sumSafeMinors([MAX_MINOR_TOTAL, 1])).toThrow();
      expect(sumSafeMinors([1, 2, 3])).toBe(6);
    });

    it("une valeur non entière sûre est refusée partout", () => {
      for (const bad of [Number.NaN, Infinity, -Infinity, 1.5, 2 ** 53]) {
        expect(() => sumSafeMinors([bad])).toThrow();
        expect(() => sumSignedMinors([bad])).toThrow();
      }
    });
  });

  // ---------------------------------------------------------------------
  // E. La conservation
  // ---------------------------------------------------------------------
  describe("E. la conservation (propriétés, pas exemples)", () => {
    it("répartir une remise globale conserve EXACTEMENT le montant", () => {
      const weights = [3333, 3333, 3334];
      const parts = allocateGlobalDiscount(weights, 1000);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    });

    it("une remise égale au sous-total tombe au centime près (aucun centime perdu)", () => {
      const weights = [1999, 3999, 5001];
      expect(
        allocateGlobalDiscount(
          weights,
          weights.reduce((a, b) => a + b, 0),
        ),
      ).toEqual(weights);
    });

    it("chaque part est un entier, non négatif, et ne dépasse pas son poids", () => {
      const weights = [1, 2, 3, 4, 5];
      const parts = allocateGlobalDiscount(weights, 7);
      for (const [i, part] of parts.entries()) {
        expect(Number.isInteger(part)).toBe(true);
        expect(part).toBeGreaterThanOrEqual(0);
        expect(part).toBeLessThanOrEqual(weights[i] as number);
      }
    });

    it("une remise qui dépasse le sous-total est REFUSÉE (jamais de remise négative)", () => {
      expect(() => allocateGlobalDiscount([1000, 1000], 2001)).toThrow(/dépasse/i);
      expect(() => allocateGlobalDiscount([], 100)).toThrow();
    });

    it("fuzz borné : Σ parts = montant sur 5 000 vecteurs pseudo-aléatoires", () => {
      // Générateur déterministe (LCG) : un test qui dépend du hasard n'est pas
      // une preuve reproductible.
      let seed = 20261112;
      const next = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      for (let k = 0; k < 5000; k += 1) {
        const n = 1 + Math.floor(next() * 12);
        const weights = Array.from({ length: n }, () => Math.floor(next() * 100_000));
        const sum = weights.reduce((a, b) => a + b, 0);
        const amount = Math.floor(next() * (sum + 1));
        const parts = allocateGlobalDiscount(weights, amount);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(amount);
        for (const [i, part] of parts.entries()) {
          expect(part).toBeLessThanOrEqual(weights[i] as number);
          expect(part).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it("la vente conserve son identité : total = sous-total − remises + livraison", () => {
      const totals = computeSaleTotals({
        lines: [
          {
            productId: 1,
            productName: "Article A",
            unitCode: "U",
            originalUnitPriceMinor: 2500,
            unitPriceMinor: 2500,
            purchasePriceMinor: 1500,
            quantity: 2,
          },
          {
            productId: 2,
            productName: "Article B",
            unitCode: "U",
            originalUnitPriceMinor: 1000,
            unitPriceMinor: 900,
            purchasePriceMinor: 500,
            quantity: 3,
          },
        ],
        deliveryFeeMinor: 500,
        amountPaidMinor: 6000,
      });
      // Sous-total = 2×2500 + 3×1000 = 8000 ; remise de ligne = (1000−900)×3 = 300.
      expect(totals.subtotalMinor).toBe(8000);
      expect(totals.discountAmountMinor).toBe(300);
      expect(totals.totalMinor).toBe(8000 - 300 + 500);
      expect(totals.remainingMinor).toBe(totals.totalMinor - 6000);
      expect(totals.paymentStatus).toBe("partial");
      // Conservation des lignes : la somme des totaux de ligne = le sous-total
      // des prix d'origine moins les remises de ligne.
      expect(totals.lineTotalsMinor.reduce((a, b) => a + b, 0)).toBe(
        totals.subtotalMinor - totals.discountAmountMinor,
      );
    });

    it("un trop-perçu est REFUSÉ (le total ne peut pas être négatif)", () => {
      expect(() =>
        computeSaleTotals({
          lines: [
            {
              productId: 1,
              productName: "Article A",
              unitCode: "U",
              originalUnitPriceMinor: 1000,
              unitPriceMinor: 1000,
              purchasePriceMinor: 500,
              quantity: 1,
            },
          ],
          deliveryFeeMinor: 0,
          amountPaidMinor: 1001,
        }),
      ).toThrow(/entre 0 et le total/i);
    });

    it("aller-retour saisie : minorToInput → parse rend le MÊME centime", () => {
      for (const minor of [0, 1, 5, 50, 99, 100, 101, 1250, 1999, 10000, 1_000_000_000]) {
        expect(parseDzdInputStrict(minorToInput(minor))).toBe(minor);
      }
      for (const minor of [0, 1, 99, 1250, MAX_MINOR_TOTAL]) {
        expect(parseDzdInputTotal(minorToInputTotal(minor))).toBe(minor);
      }
    });
  });

  // ---------------------------------------------------------------------
  // F. L'affichage ne change pas la valeur stockée
  // ---------------------------------------------------------------------
  describe("F. l'affichage est un rendu, jamais une source de vérité", () => {
    it("un montant hors bornes est affiché « — » au lieu de casser l'écran", () => {
      expect(formatDzd(MAX_MINOR_SINGLE + 1)).toBe("—");
      expect(formatDzd(Number.NaN)).toBe("—");
      expect(formatDzd(-1)).toBe("—");
      // Un TOTAL valide au-delà du plafond unitaire reste affichable.
      expect(formatDzdTotal(MAX_MINOR_TOTAL)).toBe("1\u202f000\u202f000\u202f000,00 DZD");
    });

    it("le format français est exact : séparateur décimal virgule, millier espace", () => {
      expect(formatDzd(125000)).toBe("1\u202f250,00 DZD");
      expect(formatDzd(5)).toBe("0,05 DZD");
    });
  });
});
