// Veloria PoS — Domain: règles fournisseurs (Phase 6, framework-free).
// Solde fournisseur = dette envers le fournisseur (matérialisée, atomique).

import { DomainError } from "../common/errors.ts";
import { assertSafeTotal } from "../money/money.ts";

export interface SupplierDraft {
  name: string;
  code?: string | null;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  commercialRegister?: string | null;
  notes?: string | null;
}

/** Code stable affiché sur la fiche (`FOU-00001`). Généré si absent. */
export function formatSupplierCode(id: number): string {
  if (!Number.isInteger(id) || id <= 0) {
    throw new DomainError("SUPPLIER_ERROR", "Identifiant fournisseur invalide.");
  }
  return `FOU-${String(id).padStart(5, "0")}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSupplierDraft(args: SupplierDraft): void {
  if (args.name.trim().length < 2) {
    throw new DomainError("SUPPLIER_ERROR", "Nom de fournisseur requis (2 caractères min).");
  }
  if (args.code != null && args.code.trim() !== "" && args.code.trim().length > 20) {
    throw new DomainError("SUPPLIER_ERROR", "Code fournisseur trop long (20 max).");
  }
  if (args.contact != null && args.contact.length > 100) {
    throw new DomainError("SUPPLIER_ERROR", "Contact fournisseur trop long.");
  }
  if (args.phone != null && args.phone.length > 30) {
    throw new DomainError("SUPPLIER_ERROR", "Téléphone fournisseur trop long.");
  }
  if (args.email != null && args.email.trim() !== "" && !EMAIL_RE.test(args.email.trim())) {
    throw new DomainError("SUPPLIER_ERROR", "Email fournisseur invalide.");
  }
  if (args.address != null && args.address.length > 300) {
    throw new DomainError("SUPPLIER_ERROR", "Adresse fournisseur trop longue.");
  }
  if (args.taxNumber != null && args.taxNumber.length > 50) {
    throw new DomainError("SUPPLIER_ERROR", "NIF trop long (50 max).");
  }
  if (args.commercialRegister != null && args.commercialRegister.length > 50) {
    throw new DomainError("SUPPLIER_ERROR", "Registre de commerce trop long (50 max).");
  }
  if (args.notes != null && args.notes.length > 500) {
    throw new DomainError("SUPPLIER_ERROR", "Notes trop longues (500 max).");
  }
}

export function applySupplierIntakeBalance(
  outstandingMinor: number,
  intakeTotalMinor: number,
): number {
  try {
    assertSafeTotal(outstandingMinor, "Solde fournisseur invalide");
    assertSafeTotal(intakeTotalMinor, "Total d'entrée invalide");
  } catch {
    throw new DomainError("SUPPLIER_ERROR", "Solde fournisseur invalide.");
  }
  const out = outstandingMinor + intakeTotalMinor;
  try {
    assertSafeTotal(out, "Solde fournisseur invalide");
  } catch {
    throw new DomainError("SUPPLIER_ERROR", "Solde fournisseur : dépassement de capacité.");
  }
  return out;
}

export function applySupplierPayment(outstandingMinor: number, paymentMinor: number): number {
  try {
    assertSafeTotal(outstandingMinor, "Solde fournisseur invalide");
  } catch {
    throw new DomainError("PAYMENT_ERROR", "Solde fournisseur invalide.");
  }
  if (!Number.isSafeInteger(paymentMinor) || paymentMinor <= 0) {
    throw new DomainError("PAYMENT_ERROR", "Montant de paiement invalide.");
  }
  if (paymentMinor > outstandingMinor) {
    throw new DomainError("PAYMENT_ERROR", "Le paiement dépasse la dette fournisseur.");
  }
  return outstandingMinor - paymentMinor;
}
