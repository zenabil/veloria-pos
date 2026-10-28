// Veloria PoS — Domain: règles d'entrée stock (Phase 6, framework-free).
// Une entrée = fournisseur + lignes (reçu - abîmé) valorisées au coût d'achat.
// Tout est en centimes DZD (entiers) et quantités validées ; le repo main
// exécute entrée + lignes + mouvements + quantités + solde fournisseur = 1 tx.

import { DomainError } from "../common/errors.ts";
import { assertValidQuantity } from "../common/quantity.ts";
import {
  assertSafeMinor,
  assertSafeTotal,
  multiplyMinorByQuantity,
  sumSafeMinors,
} from "../money/money.ts";

export interface IntakeLineDraft {
  productId: number | null;
  productName: string;
  quantityReceived: number;
  quantityDamaged: number;
  purchasePriceMinor: number;
  /**
   * Prix de vente par ligne (centimes) : null/undefined = champ laissé vide
   * (conserver le prix actuel du produit existant, 0 par défaut à la création).
   * number (dont 0 explicite) = nouveau prix de vente à appliquer.
   * Jamais de marge automatique : saisie manuelle libre.
   */
  sellingPriceMinor?: number | null;
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
  // M-7: unified limits — received/damaged share the same quantity boundary.
  assertValidQuantity(line.quantityReceived);
  assertValidQuantity(line.quantityDamaged, { allowZero: true });
  if (line.quantityDamaged > line.quantityReceived) {
    throw new DomainError("STOCK_ERROR", "La quantité abîmée dépasse la quantité reçue.");
  }
  assertSafeMinor(line.purchasePriceMinor, { label: "Coût d'achat invalide" });
  if (line.sellingPriceMinor !== undefined && line.sellingPriceMinor !== null) {
    assertSafeMinor(line.sellingPriceMinor, { label: "Prix de vente invalide" });
  }
}

export function netQuantity(line: IntakeLineDraft): number {
  return line.quantityReceived - line.quantityDamaged;
}

export function computeIntakeTotals(lines: IntakeLineDraft[], shippingMinor: number): IntakeTotals {
  if (lines.length === 0) {
    throw new DomainError("STOCK_ERROR", "L'entrée doit contenir au moins une ligne.");
  }
  if (lines.length > 500) {
    throw new DomainError("STOCK_ERROR", "Entrée trop volumineuse (max 500 lignes).");
  }
  assertSafeMinor(shippingMinor, { label: "Frais de port invalides" });
  const lineTotals: number[] = [];
  for (const line of lines) {
    validateIntakeLine(line);
    lineTotals.push(multiplyMinorByQuantity(line.purchasePriceMinor, netQuantity(line)));
  }
  const subtotal = sumSafeMinors(lineTotals, "Sous-total entrée invalide");
  const total = subtotal + shippingMinor;
  assertSafeTotal(total, "Total entrée invalide");
  return { subtotalMinor: subtotal, shippingMinor, totalMinor: total };
}
