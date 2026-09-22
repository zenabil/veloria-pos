// Veloria PoS — Domain: sale pricing rules (deterministic, integer minor units).
// P0-7 : la remise vit dans le prix unitaire de ligne.
// - `unitPriceMinor` = prix FACTURÉ (modifié ou non via le dialogue prix).
// - `originalUnitPriceMinor` = prix catalogue de référence au moment de l'ajout.
// - remise de ligne = (original − final) × qty (négative = majoration).
// - Remise GLOBALE (montant DZD, saisie caisse comme le devis) : appliquée
//   APRÈS les remises de lignes — total = Σ originaux − Σ remises lignes −
//   remise globale + livraison. `discountAmountMinor` reste la Σ des lignes
//   (traçabilité par ligne) ; la remise totale imprimée = lignes + globale.
//   sales.discount_type = 'global' si globale > 0, sinon 'none'.

import { DomainError } from "../common/errors.ts";
import {
  assertSafeMinor,
  assertSafeTotal,
  assertSignedTotal,
  multiplyMinorByQuantity,
  sumSafeMinors,
  sumSignedMinors,
} from "../money/money.ts";
import { assertValidQuantity } from "../common/quantity.ts";

export type PaymentStatus = "paid" | "partial" | "unpaid";

export interface CartLineInput {
  productId: number | null;
  productName: string;
  unitCode: string;
  /** Prix catalogue de référence (jamais facturé directement). */
  originalUnitPriceMinor: number;
  /** Prix facturé (égal à l'original sauf changement via le dialogue prix). */
  unitPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
}

export interface SaleTotalsInput {
  lines: CartLineInput[];
  deliveryFeeMinor: number;
  amountPaidMinor: number;
}

export interface LineDiscount {
  /** Total facturé de la ligne (final × qty). */
  chargedMinor: number;
  /** Remise de ligne (original − final) × qty — négative si majoration. */
  discountMinor: number;
  /** true si le prix facturé passe SOUS le prix d'achat (alerte + audit). */
  belowCost: boolean;
}

export interface SaleTotals {
  /** Σ originaux (référence avant remises). */
  subtotalMinor: number;
  /** Σ remises de lignes (négative si majoration nette). */
  discountAmountMinor: number;
  totalMinor: number;
  remainingMinor: number;
  paymentStatus: PaymentStatus;
  lineTotalsMinor: number[];
  lineDiscountsMinor: number[];
  /** true si ≥ 1 ligne est vendue sous son prix d'achat. */
  hasBelowCostLine: boolean;
}

export function computeLineTotal(unitPriceMinor: number, quantity: number): number {
  assertSafeMinor(unitPriceMinor, { label: "Prix unitaire invalide" });
  assertValidQuantity(quantity);
  return multiplyMinorByQuantity(unitPriceMinor, quantity);
}

/**
 * Remise d'une ligne : (original − final) × qty, chaque total arrondi en
 * centimes AVANT soustraction (même règle que le main, défense en profondeur).
 * Lève sur prix invalide (jamais de remise silencieuse à 0).
 */
export function computeLineDiscount(line: CartLineInput): LineDiscount {
  if (line.productName.trim().length === 0) {
    throw new DomainError("SALE_ERROR", "Nom de produit manquant dans le panier.");
  }
  assertSafeMinor(line.originalUnitPriceMinor, { label: "Prix d'origine invalide" });
  const chargedMinor = computeLineTotal(line.unitPriceMinor, line.quantity);
  const originalTotal = multiplyMinorByQuantity(line.originalUnitPriceMinor, line.quantity);
  const discountMinor = originalTotal - chargedMinor;
  // Signée : majoration (prix relevé) admise, bornes H-1 gardées.
  assertSignedTotal(discountMinor, "Remise de ligne invalide");
  const purchase = Number(line.purchasePriceMinor);
  const belowCost =
    Number.isFinite(purchase) && purchase > 0 && line.unitPriceMinor < Math.round(purchase);
  return { chargedMinor, discountMinor, belowCost };
}

export function computeSaleTotals(input: SaleTotalsInput): SaleTotals {
  if (input.lines.length === 0) {
    throw new DomainError("SALE_ERROR", "Le panier est vide.");
  }
  if (input.lines.length > 500) {
    throw new DomainError("SALE_ERROR", "Panier trop volumineux (max 500 lignes).");
  }
  const perLine = input.lines.map((l) => computeLineDiscount(l));
  const lineTotalsMinor = perLine.map((p) => p.chargedMinor);
  const lineDiscountsMinor = perLine.map((p) => p.discountMinor);
  // H-1: overflow-safe accumulation (fails closed before MAX_SAFE_INTEGER).
  const originalTotals = input.lines.map((l) =>
    multiplyMinorByQuantity(l.originalUnitPriceMinor, l.quantity),
  );
  const subtotalMinor = sumSafeMinors(originalTotals, "Sous-total invalide");
  // Signée : une majoration nette (prix relevés) donne une remise négative.
  const discountAmountMinor = sumSignedMinors(lineDiscountsMinor, "Remise invalide");

  assertSafeMinor(input.deliveryFeeMinor, { label: "Frais de livraison invalides" });

  assertSafeTotal(subtotalMinor, "Sous-total invalide");
  // discountAmountMinor déjà borné signé par sumSignedMinors (majorations admises).
  const totalMinor = subtotalMinor - discountAmountMinor + input.deliveryFeeMinor;
  assertSafeTotal(totalMinor, "Total de vente invalide");

  assertSafeMinor(input.amountPaidMinor, {
    max: 100_000_000_000,
    label: "Montant payé invalide",
  });
  if (input.amountPaidMinor > totalMinor) {
    throw new DomainError("SALE_ERROR", "Le montant payé doit être entre 0 et le total.");
  }

  const remainingMinor = totalMinor - input.amountPaidMinor;
  assertSafeTotal(remainingMinor, "Reste à payer invalide");
  // total 0 => paid (nothing owed); fully paid => paid; zero paid => unpaid; else partial.
  const paymentStatus: PaymentStatus =
    totalMinor === 0 || remainingMinor === 0
      ? "paid"
      : input.amountPaidMinor === 0
        ? "unpaid"
        : "partial";

  return {
    subtotalMinor,
    discountAmountMinor,
    totalMinor,
    remainingMinor,
    paymentStatus,
    lineTotalsMinor,
    lineDiscountsMinor,
    hasBelowCostLine: perLine.some((p) => p.belowCost),
  };
}
