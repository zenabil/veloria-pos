// Veloria PoS — Domain: clôture journalière Z (Phase 8, framework-free).
// Formule : clôture = ouverture + ventes_espèces + encaissements - dépenses - remboursements.
// Tout en centimes DZD entiers ; le repo main calcule les agrégats en SQL.

import { DomainError } from "../common/errors.ts";

export interface ClosingInputs {
  openingMinor: number;
  cashSalesMinor: number;
  customerCollectionsMinor: number;
  expensesMinor: number;
  refundsMinor: number;
}

export function computeClosingBalance(input: ClosingInputs): number {
  for (const [k, v] of Object.entries(input)) {
    if (!Number.isInteger(v) || v < 0) {
      throw new DomainError("CLOSING_ERROR", `Montant de clôture invalide : ${k}.`);
    }
  }
  return (
    input.openingMinor +
    input.cashSalesMinor +
    input.customerCollectionsMinor -
    input.expensesMinor -
    input.refundsMinor
  );
}

export function validateBusinessDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new DomainError("CLOSING_ERROR", "Date d'activité invalide (AAAA-MM-JJ).");
  }
}
