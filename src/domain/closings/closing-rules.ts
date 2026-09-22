// Veloria PoS — Domain: clôture journalière Z (Phase 8, framework-free).
// Formule : clôture = ouverture + ventes_espèces + encaissements - dépenses - remboursements.
// Tout en centimes DZD entiers ; le repo main calcule les agrégats en SQL.

import { DomainError } from "../common/errors.ts";
import { isRealCalendarDate } from "../common/dates.ts";
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
  // H-1: guarded arithmetic — credits guarded, debits guarded, result may be
  // negative (loss-making day) and stays within safe bounds; documented.
  const credits = input.openingMinor + input.cashSalesMinor + input.customerCollectionsMinor;
  if (!Number.isSafeInteger(credits) || credits < 0) {
    throw new DomainError("CLOSING_ERROR", "Montant de clôture invalide : dépassement.");
  }
  const debits = input.expensesMinor + input.refundsMinor;
  if (!Number.isSafeInteger(debits) || debits < 0) {
    throw new DomainError("CLOSING_ERROR", "Montant de clôture invalide : dépassement.");
  }
  const out = credits - debits;
  if (!Number.isSafeInteger(out)) {
    throw new DomainError("CLOSING_ERROR", "Montant de clôture invalide : dépassement.");
  }
  return out;
}

export function validateBusinessDate(date: string): void {
  if (!isRealCalendarDate(date)) {
    throw new DomainError("CLOSING_ERROR", "Date d'activité invalide (AAAA-MM-JJ).");
  }
}
