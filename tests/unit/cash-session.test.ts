// Veloria PoS — Règles de session de caisse (domaine pur) + parité avec la
// copie main (`electron/ipc/handlers/cash-session.repo.ts`). Le domaine décide
// de l'attente et de l'écart ; le main calcule les agrégats en SQL. Si les deux
// formules divergent, la liasse propriétaire et l'écran de caisse ne racontent
// plus la même histoire — c'est ici que ça casse.
import { describe, it, expect } from "vitest";
import {
  assertCountedMinor,
  CASH_SESSION_STATUSES,
  computeSessionExpectedMinor,
  computeSessionVarianceMinor,
  sessionConformityPercent,
  totalVarianceMinor,
  type SessionCashInputs,
} from "@/domain/cash/session-rules.ts";
import { computeSessionExpectedMinor as mainComputeSessionExpectedMinor } from "../../electron/ipc/handlers/cash-session.repo";

const EMPTY_SESSION: SessionCashInputs = {
  openingFloatMinor: 5000,
  cashSalesMinor: 0,
  customerCollectionsMinor: 0,
  expensesMinor: 0,
  refundsMinor: 0,
};

const TYPICAL: SessionCashInputs = {
  openingFloatMinor: 5000,
  cashSalesMinor: 3000,
  customerCollectionsMinor: 1200,
  expensesMinor: 800,
  refundsMinor: 200,
};

/** Sorties > entrées : une session à perte, signe conservé. */
const LOSS: SessionCashInputs = {
  openingFloatMinor: 0,
  cashSalesMinor: 0,
  customerCollectionsMinor: 0,
  expensesMinor: 10_000,
  refundsMinor: 0,
};

/** Centime près : 1 encaissé, 1 remboursé → attente nulle. */
const NEUTRAL: SessionCashInputs = {
  openingFloatMinor: 0,
  cashSalesMinor: 1,
  customerCollectionsMinor: 0,
  expensesMinor: 0,
  refundsMinor: 1,
};

const INPUTS: SessionCashInputs[] = [EMPTY_SESSION, TYPICAL, LOSS, NEUTRAL];

describe("Règles de session de caisse (domaine)", () => {
  it("attente = fond + ventes espèces + encaissements − dépenses − remboursements", () => {
    expect(computeSessionExpectedMinor(EMPTY_SESSION)).toBe(5000);
    expect(computeSessionExpectedMinor(TYPICAL)).toBe(5000 + 3000 + 1200 - 800 - 200);
    expect(computeSessionExpectedMinor(NEUTRAL)).toBe(0);
  });

  it("une session à perte rend un attendu NÉGATIF (jamais un 0 trompeur)", () => {
    expect(computeSessionExpectedMinor(LOSS)).toBe(-10_000);
  });

  it("parité avec la copie main sur les mêmes entrées", () => {
    for (const input of INPUTS) {
      expect(mainComputeSessionExpectedMinor(input)).toBe(computeSessionExpectedMinor(input));
    }
  });

  it("refuse un montant non entier, négatif ou hors bornes (message FR)", () => {
    const broken: Array<[keyof SessionCashInputs, number]> = [
      ["cashSalesMinor", 10.5],
      ["expensesMinor", -1],
      ["openingFloatMinor", Number.NaN],
      ["refundsMinor", Number.MAX_SAFE_INTEGER + 1],
    ];
    for (const [key, value] of broken) {
      const input = { ...EMPTY_SESSION, [key]: value };
      expect(() => computeSessionExpectedMinor(input), key).toThrow(
        new RegExp(`Montant de caisse invalide : ${key}`),
      );
    }
  });

  it("écart signé : compté − attendu", () => {
    expect(computeSessionVarianceMinor({ expectedMinor: 8000, countedMinor: 8200 })).toBe(200);
    expect(computeSessionVarianceMinor({ expectedMinor: 8000, countedMinor: 7500 })).toBe(-500);
    expect(computeSessionVarianceMinor({ expectedMinor: 8000, countedMinor: 8000 })).toBe(0);
    expect(() => computeSessionVarianceMinor({ expectedMinor: 8000, countedMinor: 12.5 })).toThrow(
      /Comptage|invalide/,
    );
  });

  it("comptage négatif refusé", () => {
    expect(() => assertCountedMinor(-1)).toThrow(/Comptage de caisse invalide/);
    expect(() => assertCountedMinor(1.5)).toThrow(/Comptage de caisse invalide/);
    expect(() => assertCountedMinor(0)).not.toThrow();
  });

  it("conformité : part des sessions fermées sans écart (aucune session = 100 %)", () => {
    expect(sessionConformityPercent([])).toBe(100);
    expect(
      sessionConformityPercent([
        { expectedMinor: 5000, countedMinor: 5000 },
        { expectedMinor: 1000, countedMinor: 900 },
      ]),
    ).toBe(50);
    expect(
      sessionConformityPercent([
        { expectedMinor: 5000, countedMinor: 5000 },
        { expectedMinor: 1000, countedMinor: 1000 },
        { expectedMinor: 1000, countedMinor: 1000 },
      ]),
    ).toBe(100);
  });

  it("écart net cumulé (signes conservés)", () => {
    expect(
      totalVarianceMinor([
        { expectedMinor: 5000, countedMinor: 5200 },
        { expectedMinor: 1000, countedMinor: 900 },
      ]),
    ).toBe(100);
    expect(
      totalVarianceMinor([
        { expectedMinor: 5000, countedMinor: 4000 },
        { expectedMinor: 1000, countedMinor: 900 },
      ]),
    ).toBe(-1100);
  });

  it("statuts fermés : ouverture puis fermeture, rien d'autre", () => {
    expect(CASH_SESSION_STATUSES).toEqual(["open", "closed"]);
  });
});
