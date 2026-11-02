// Veloria PoS — Domain: sessions de caisse (framework-free, zéro import Electron).
// Une session = un poste de caisse ouvert par un opérateur, avec un fond
// d'ouverture annoncé, un comptage physique et l'écart entre les deux.
// Formule d'attente identique à la clôture Z (même argent, deux grains) :
//   attendu = fond d'ouverture + ventes espèces + encaissements − dépenses − remboursements.
// Tout en centimes DZD entiers ; les agrégats sont calculés en SQL par le repo
// main (`electron/ipc/handlers/cash-session.repo.ts`), qui en garde la copie
// jumelle — parité prouvée par `tests/unit/cash-session.test.ts`.

import { DomainError } from "../common/errors.ts";
import { assertSafeTotal } from "../money/money.ts";

export type CashSessionStatus = "open" | "closed";

export const CASH_SESSION_STATUSES: readonly CashSessionStatus[] = ["open", "closed"];

/** Flux d'une session sur sa fenêtre (agrégats SQL, jamais de float). */
export interface SessionCashInputs {
  openingFloatMinor: number;
  cashSalesMinor: number;
  customerCollectionsMinor: number;
  expensesMinor: number;
  refundsMinor: number;
}

/**
 * Fonds attendu dans le tiroir en fin de session. Signé volontairement : une
 * session dont les sorties dépassent les entrées rend un attendu négatif,
 * jamais un « 0 » trompeur.
 */
export function computeSessionExpectedMinor(input: SessionCashInputs): number {
  for (const [key, value] of Object.entries(input)) {
    try {
      assertSafeTotal(value as number, `Montant de caisse invalide : ${key}`);
    } catch {
      throw new DomainError("CASH_SESSION_ERROR", `Montant de caisse invalide : ${key}.`);
    }
  }
  const credits = input.openingFloatMinor + input.cashSalesMinor + input.customerCollectionsMinor;
  const debits = input.expensesMinor + input.refundsMinor;
  // H-1 (même raisonnement que le Z) : chaque champ est déjà passé par
  // `assertSafeTotal` (entier, 0..MAX_MINOR_TOTAL) ⇒ bornes arithmétiques
  // larges et sûres, aucune addition flottante possible.
  return credits - debits;
}

/**
 * Écart de comptage : `compté − attendu`. Positif = surplus trouvé dans le
 * tiroir, négatif = manque. Signé, jamais borné à 0 (un écart est un fait).
 */
export function computeSessionVarianceMinor(args: {
  expectedMinor: number;
  countedMinor: number;
}): number {
  for (const [key, value] of Object.entries(args)) {
    try {
      assertSafeTotal(value, `Montant de caisse invalide : ${key}`);
    } catch {
      throw new DomainError("CASH_SESSION_ERROR", `Montant de caisse invalide : ${key}.`);
    }
  }
  return args.countedMinor - args.expectedMinor;
}

/** Le comptage doit être un entier de centimes, positif (aucun tiroir négatif). */
export function assertCountedMinor(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError("CASH_SESSION_ERROR", "Comptage de caisse invalide.");
  }
}

/**
 * Conformité d'une série de sessions fermées : part (entier 0..100) des sessions
 * dont l'écart de comptage est exactement nul. Aucune session fermée ⇒ 100 %
 * (aucun écart constaté, pas un faux « 0 % »).
 */
export function sessionConformityPercent(
  rows: ReadonlyArray<{ expectedMinor: number; countedMinor: number }>,
): number {
  if (rows.length === 0) return 100;
  const clean = rows.filter(
    (row) =>
      computeSessionVarianceMinor({
        expectedMinor: row.expectedMinor,
        countedMinor: row.countedMinor,
      }) === 0,
  ).length;
  return Math.round((clean * 100) / rows.length);
}

/** Net des sessions fermées sur une période (somme signée des écarts). */
export function totalVarianceMinor(
  rows: ReadonlyArray<{ expectedMinor: number; countedMinor: number }>,
): number {
  return rows.reduce(
    (sum, row) =>
      sum +
      computeSessionVarianceMinor({
        expectedMinor: row.expectedMinor,
        countedMinor: row.countedMinor,
      }),
    0,
  );
}
