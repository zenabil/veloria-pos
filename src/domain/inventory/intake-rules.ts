// Veloria PoS — Domain: règles d'entrée stock (Phase 6, framework-free).
// Une entrée = fournisseur + lignes (reçu - abîmé) valorisées au coût d'achat.
// Tout est en centimes DZD (entiers) et quantités validées ; le repo main
// exécute entrée + lignes + mouvements + quantités + solde fournisseur = 1 tx.

import { DomainError } from "../common/errors.ts";
import { assertValidQuantity } from "../common/quantity.ts";

export interface IntakeLineDraft {
  productId: number | null;
  productName: string;
  quantityReceived: number;
  quantityDamaged: number;
  purchasePriceMinor: number;
}

export interface IntakeTotals {
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
}

export function validateIntakeLine(line: IntakeLineDraft): void {
  if (line.productName.trim().length < 1) {
    throw new DomainError("STOCK_ERROR", "Nom de produit requis pour l'entrée.");
  }
  assertValidQuantity(line.quantityReceived);
  if (!Number.isFinite(line.quantityDamaged) || line.quantityDamaged < 0) {
    throw new DomainError("STOCK_ERROR", "Quantité abîmée invalide.");
  }
  if (line.quantityDamaged > line.quantityReceived) {
    throw new DomainError("STOCK_ERROR", "La quantité abîmée dépasse la quantité reçue.");
  }
  if (!Number.isInteger(line.purchasePriceMinor) || line.purchasePriceMinor < 0) {
    throw new DomainError("STOCK_ERROR", "Coût d'achat invalide.");
  }
}

export function netQuantity(line: IntakeLineDraft): number {
  return line.quantityReceived - line.quantityDamaged;
}

export function landingCostPerUnit(line: IntakeLineDraft): number {
  // Coût de revient unitaire = prix d'achat (le fret est réparti au niveau
  // de l'entrée, pas de la ligne — le repo le stocke en landing_cost).
  return line.purchasePriceMinor;
}

export function computeIntakeTotals(lines: IntakeLineDraft[], shippingMinor: number): IntakeTotals {
  if (lines.length === 0) {
    throw new DomainError("STOCK_ERROR", "L'entrée doit contenir au moins une ligne.");
  }
  if (!Number.isInteger(shippingMinor) || shippingMinor < 0) {
    throw new DomainError("STOCK_ERROR", "Frais de port invalides.");
  }
  let subtotal = 0;
  for (const line of lines) {
    validateIntakeLine(line);
    subtotal += Math.round(line.purchasePriceMinor * netQuantity(line));
  }
  return { subtotalMinor: subtotal, shippingMinor, totalMinor: subtotal + shippingMinor };
}

export function validateAdjustment(args: { currentQty: number; newQty: number; reason: string }): {
  delta: number;
  movementType: "adjust_in" | "adjust_out";
} {
  if (!Number.isFinite(args.currentQty) || !Number.isFinite(args.newQty) || args.newQty < 0) {
    throw new DomainError("STOCK_ERROR", "Quantité d'ajustement invalide.");
  }
  if (args.reason.trim().length < 2) {
    throw new DomainError("STOCK_ERROR", "Motif d'ajustement requis (inventaire, casse…).");
  }
  const delta = args.newQty - args.currentQty;
  if (delta === 0) throw new DomainError("STOCK_ERROR", "Aucune variation à enregistrer.");
  return { delta, movementType: delta > 0 ? "adjust_in" : "adjust_out" };
}
