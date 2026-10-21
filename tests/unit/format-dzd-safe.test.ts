// Veloria PoS — A-01 (P1) : le formatage monétaire de RENDU ne lève jamais.
//
// Avant : `formatDzd` appelait `assertMinorInteger` et LEVAIT sur une valeur
// corrompue (NaN, fractionnaire, négative, hors bornes). 268 sites d'appel en
// JSX : une seule valeur fausse en base suffisait à faire tomber
// l'`ErrorBoundary` ⇒ ÉCRAN MORT devant le caissier. `formatDzdSafe`
// existait (16 usages) mais n'avait jamais été généralisé.
//
// Politique appliquée (ADR-124) :
//   - `formatDzd` = rendu : JAMAIS d'exception, valeur invalide ⇒ « — » ;
//   - `formatDzdStrict` = transaction/écriture : LÈVE (une valeur corrompue
//     doit être signalée, pas masquée).
import { describe, it, expect } from "vitest";
import { formatDzd, formatDzdStrict } from "@domain/money/money.ts";
import { formatDzdSafe, formatDzdSigned } from "@shared/formatters/format.ts";

describe("A-01 : formatDzd ne tue plus l'écran (rendu) / formatDzdStrict lève (écriture)", () => {
  it("valeurs valides : formatage inchangé", () => {
    expect(formatDzd(0)).toBe("0,00 DZD");
    expect(formatDzd(100)).toBe("1,00 DZD");
    expect(formatDzd(81000)).toBe("810,00 DZD");
    // Séparateur de milliers FR = espace fine insécable (U+202F, Intl fr-FR) :
    // on normalise pour comparer sans dépendre de la largeur exacte.
    expect(formatDzd(1_250_000).replace(/\u202f/g, " ")).toBe("12 500,00 DZD");
    expect(formatDzdStrict(81000)).toBe("810,00 DZD");
  });

  it("valeurs corrompues ⇒ « — » (aucune exception au rendu)", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1, 1e12, -0.5]) {
      expect(formatDzd(bad), `valeur ${String(bad)}`).toBe("—");
    }
  });

  it("formatDzdStrict lève sur les mêmes valeurs (chemin écriture)", () => {
    for (const bad of [Number.NaN, 1.5, -1, 1e12]) {
      expect(() => formatDzdStrict(bad), `valeur ${String(bad)}`).toThrow();
    }
  });

  it("formatDzdSafe accepte les entrées incertaines (unknown)", () => {
    expect(formatDzdSafe(null)).toBe("—");
    expect(formatDzdSafe(undefined)).toBe("—");
    expect(formatDzdSafe("abc")).toBe("—");
    expect(formatDzdSafe("100")).toBe("1,00 DZD");
    expect(formatDzdSafe(100)).toBe("1,00 DZD");
  });

  it("formatDzdSigned : négatif affiché, corrompu ⇒ « — »", () => {
    expect(formatDzdSigned(-50000)).toBe("-500,00 DZD");
    expect(formatDzdSigned(Number.NaN)).toBe("—");
    expect(formatDzdSigned(null)).toBe("—");
  });
});
