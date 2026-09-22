// Veloria PoS — Domain: customer debt rules.

import { DomainError } from "../common/errors.ts";
import { isRealCalendarDate } from "../common/dates.ts";
import { assertSafeTotal } from "../money/money.ts";

export type DebtStatus = "none" | "due" | "overdue" | "over_limit";

export interface DebtInput {
  outstandingMinor: number;
  creditLimitMinor: number; // 0 = no explicit limit
  /** M-8: échéance AAAA-MM-JJ (optionnelle, rétro-compatible). */
  dueDate?: string | null;
  /** M-8: date métier AAAA-MM-JJ de référence (défaut: pas de calcul overdue). */
  businessDate?: string | null;
}

export function computeDebtStatus(input: DebtInput): { status: DebtStatus; isOverLimit: boolean } {
  try {
    assertSafeTotal(input.outstandingMinor, "Solde client invalide");
  } catch {
    throw new DomainError("CUSTOMER_ERROR", "Solde client invalide.");
  }
  if (!Number.isSafeInteger(input.creditLimitMinor) || input.creditLimitMinor < 0) {
    throw new DomainError("CUSTOMER_ERROR", "Plafond de crédit invalide.");
  }
  if (input.outstandingMinor === 0) return { status: "none", isOverLimit: false };
  if (input.creditLimitMinor > 0 && input.outstandingMinor > input.creditLimitMinor) {
    return { status: "over_limit", isOverLimit: true };
  }
  // M-8: overdue = due_date < businessDate AND outstanding > 0.
  // Sans dates: comportement historique ("due"). Dates invalides: erreur contrôlée.
  const due = input.dueDate ?? null;
  const biz = input.businessDate ?? null;
  if (due != null && biz != null) {
    if (!isRealCalendarDate(due) || !isRealCalendarDate(biz)) {
      throw new DomainError("CUSTOMER_ERROR", "Date d'échéance invalide.");
    }
    if (due < biz) return { status: "overdue", isOverLimit: false };
  }
  return { status: "due", isOverLimit: false };
}

export function applyPaymentToBalance(outstandingMinor: number, paymentMinor: number): number {
  try {
    assertSafeTotal(outstandingMinor, "Solde invalide");
  } catch {
    throw new DomainError("PAYMENT_ERROR", "Solde invalide.");
  }
  if (!Number.isSafeInteger(paymentMinor) || paymentMinor <= 0) {
    throw new DomainError("PAYMENT_ERROR", "Montant de paiement invalide.");
  }
  if (paymentMinor > outstandingMinor) {
    throw new DomainError("PAYMENT_ERROR", "Le paiement dépasse le solde dû.");
  }
  return outstandingMinor - paymentMinor;
}

export interface CreditSaleInput {
  customerId: number | null;
  /** `customers.credit_allowed = 1` (opt-in). Ignoré si aucun reste à payer. */
  creditAllowed: boolean;
  remainingMinor: number;
}

/** Vente à crédit réservée aux clients autorisés (comptant libre pour tous). */
export function assertCreditSaleAllowed(input: CreditSaleInput): void {
  try {
    assertSafeTotal(input.remainingMinor, "Reste à payer invalide");
  } catch {
    throw new DomainError("SALE_ERROR", "Reste à payer invalide.");
  }
  if (input.remainingMinor === 0) return;
  if (input.customerId == null) {
    throw new DomainError(
      "SALE_ERROR",
      "Vente à crédit : choisissez un client autorisé au crédit.",
    );
  }
  if (!input.creditAllowed) {
    throw new DomainError(
      "SALE_ERROR",
      "Vente à crédit refusée : ce client n'est pas autorisé au crédit.",
    );
  }
}
