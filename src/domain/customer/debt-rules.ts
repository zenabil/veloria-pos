// Veloria PoS — Domain: customer debt rules.

import { DomainError } from "../common/errors.ts";

export type DebtStatus = "none" | "due" | "overdue" | "over_limit";

export interface DebtInput {
  outstandingMinor: number;
  creditLimitMinor: number; // 0 = no explicit limit
}

export function computeDebtStatus(input: DebtInput): { status: DebtStatus; isOverLimit: boolean } {
  if (!Number.isInteger(input.outstandingMinor) || input.outstandingMinor < 0) {
    throw new DomainError("CUSTOMER_ERROR", "Solde client invalide.");
  }
  if (!Number.isInteger(input.creditLimitMinor) || input.creditLimitMinor < 0) {
    throw new DomainError("CUSTOMER_ERROR", "Plafond de crédit invalide.");
  }
  if (input.outstandingMinor === 0) return { status: "none", isOverLimit: false };
  if (input.creditLimitMinor > 0 && input.outstandingMinor > input.creditLimitMinor) {
    return { status: "over_limit", isOverLimit: true };
  }
  return { status: "due", isOverLimit: false };
}

export function applyPaymentToBalance(outstandingMinor: number, paymentMinor: number): number {
  if (!Number.isInteger(outstandingMinor) || outstandingMinor < 0) {
    throw new DomainError("PAYMENT_ERROR", "Solde invalide.");
  }
  if (!Number.isInteger(paymentMinor) || paymentMinor <= 0) {
    throw new DomainError("PAYMENT_ERROR", "Montant de paiement invalide.");
  }
  if (paymentMinor > outstandingMinor) {
    throw new DomainError("PAYMENT_ERROR", "Le paiement dépasse le solde dû.");
  }
  return outstandingMinor - paymentMinor;
}
