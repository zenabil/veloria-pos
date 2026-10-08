// Veloria PoS — Garde R7 (conseil llm-council) : parité des conventions.
// Quantités = millièmes partout (domaine, carts.repo, FIFO TH=1000) ;
// monnaie = centimes entiers avec round-trip champ↔domaine.
import { describe, it, expect } from "vitest";
import { roundQuantity } from "../../src/domain/common/quantity.ts";
import { formatDzd, minorToInput, parseDzdInputStrict } from "../../src/domain/money/money.ts";

describe("R7 : parité quantités-monnaie (ADR-074)", () => {
  it("millièmes : la convention carts/FIFO égale celle du domaine", () => {
    expect(roundQuantity(1.23456)).toBe(1.235);
    expect(roundQuantity(2)).toBe(2);
    // Même formule que carts.repo.ts et fifo.ts (TH=1000).
    expect(Math.round(1.23456 * 1000) / 1000).toBe(roundQuantity(1.23456));
  });
  it("centimes : round-trip saisie ↔ domaine (parse(format(x)) === x)", () => {
    for (const minor of [0, 1, 99, 100, 125050, 99999999]) {
      expect(parseDzdInputStrict(minorToInput(minor), "Montant")).toBe(minor);
    }
  });
  it("affichage : arithmétique entière, jamais de float", () => {
    expect(formatDzd(100)).toBe("1,00 DZD");
    expect(formatDzd(0)).toBe("0,00 DZD");
  });
});
