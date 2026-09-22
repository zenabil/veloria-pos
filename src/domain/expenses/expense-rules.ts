// Veloria PoS — Domain: règles dépenses (framework-free).
// Une dépense est un fait comptable simple : description + catégorie + montant + date.

import { DomainError } from "../common/errors.ts";
import { isRealCalendarDate } from "../common/dates.ts";
import { assertSafeMinor } from "../money/money.ts";

export interface ExpenseDraft {
  description: string;
  category: string;
  amountMinor: number;
  expenseDate: string;
}

export function validateExpenseDraft(d: ExpenseDraft): void {
  if (d.description.trim().length < 2) {
    throw new DomainError("VALIDATION_ERROR", "Description de dépense requise.");
  }
  if (d.category.trim().length < 1) {
    throw new DomainError("VALIDATION_ERROR", "Catégorie requise.");
  }
  if (!isRealCalendarDate(d.expenseDate)) {
    throw new DomainError("VALIDATION_ERROR", "Date de dépense invalide (AAAA-MM-JJ).");
  }
  try {
    assertSafeMinor(d.amountMinor, { min: 1, label: "Montant de dépense invalide" });
  } catch {
    throw new DomainError("VALIDATION_ERROR", "Montant de dépense invalide.");
  }
}

/** Numéro stable (`DEP-00001`, dérivé de l'id : aucune colonne). */
export function formatExpenseNumber(id: number): string {
  if (!Number.isInteger(id) || id <= 0) {
    throw new DomainError("VALIDATION_ERROR", "Identifiant de dépense invalide.");
  }
  return `DEP-${String(id).padStart(5, "0")}`;
}
