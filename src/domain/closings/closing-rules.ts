// Veloria PoS — Domain: clôture journalière Z (Phase 8, framework-free).
// Formule : clôture = ouverture + ventes_espèces + encaissements - dépenses - remboursements.
// Tout en centimes DZD entiers ; le repo main calcule les agrégats en SQL.

import { DomainError } from "../common/errors.ts";
import { assertSafeTotal } from "../money/money.ts";

export interface ClosingInputs {
  openingMinor: number;
  cashSalesMinor: number;
  customerCollectionsMinor: number;
  expensesMinor: number;
  refundsMinor: number;
}

export function computeClosingBalance(input: ClosingInputs): number {
  for (const [k, v] of Object.entries(input)) {
    try {
      assertSafeTotal(v as number, `Montant de clôture invalide : ${k}`);
    } catch {
      throw new DomainError("CLOSING_ERROR", `Montant de clôture invalide : ${k}.`);
    }
  }
  // H-1 : arithmétique bornée. Chaque champ est déjà passé par
  // `assertSafeTotal` (entier, 0..MAX_MINOR_TOTAL = 1e9) ⇒ credits ≤ 3e9,
  // debits ≤ 2e9, résultat ∈ [-2e9, 3e9] : entiers et très loin de 2^53−1.
  // Les gardes `isSafeInteger` / `< 0` sur les AGRÉGATS étaient donc
  // inatteignables par construction (ADR-153 lot C) — retirées, non relâchées :
  // la borne utile reste l'assertion d'entrée ci-dessus. Si MAX_MINOR_TOTAL
  // change un jour, c'est elle qui doit bouger (avec la formule exécutée du Z,
  // `electron/ipc/handlers/finance.repo.ts:276`).
  const credits = input.openingMinor + input.cashSalesMinor + input.customerCollectionsMinor;
  const debits = input.expensesMinor + input.refundsMinor;
  // Résultat volontairement signé : une journée en perte est < 0, jamais « — ».
  return credits - debits;
}
