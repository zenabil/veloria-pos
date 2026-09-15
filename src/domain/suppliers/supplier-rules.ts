// Veloria PoS — Domain: règles fournisseurs (Phase 6, framework-free).
// Solde fournisseur = dette envers le fournisseur (matérialisée, atomique).

import { DomainError } from "../common/errors.ts";

export function validateSupplierDraft(args: { name: string; phone?: string | null }): void {
  if (args.name.trim().length < 2) {
    throw new DomainError("SUPPLIER_ERROR", "Nom de fournisseur requis (2 caractères min).");
  }
  if (args.phone != null && args.phone.length > 30) {
    throw new DomainError("SUPPLIER_ERROR", "Téléphone fournisseur trop long.");
  }
}

export function applySupplierIntakeBalance(
  outstandingMinor: number,
  intakeTotalMinor: number,
): number {
  if (!Number.isInteger(outstandingMinor) || !Number.isInteger(intakeTotalMinor)) {
    throw new DomainError("SUPPLIER_ERROR", "Solde fournisseur invalide.");
  }
  if (intakeTotalMinor < 0) throw new DomainError("SUPPLIER_ERROR", "Total d'entrée invalide.");
  return outstandingMinor + intakeTotalMinor;
}

export function applySupplierPayment(outstandingMinor: number, paymentMinor: number): number {
  if (!Number.isInteger(paymentMinor) || paymentMinor <= 0) {
    throw new DomainError("PAYMENT_ERROR", "Montant de paiement invalide.");
  }
  if (paymentMinor > outstandingMinor) {
    throw new DomainError("PAYMENT_ERROR", "Le paiement dépasse la dette fournisseur.");
  }
  return outstandingMinor - paymentMinor;
}
