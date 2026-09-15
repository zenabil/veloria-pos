// Veloria PoS — Domain: sale pricing rules (deterministic, integer minor units).

import { DomainError } from "../common/errors.ts";
import { assertMinorInteger, multiplyMinorByQuantity, percentOfMinor } from "../money/money.ts";
import { assertValidQuantity } from "../common/quantity.ts";

export type DiscountType = "none" | "percent" | "amount";
export type PaymentStatus = "paid" | "partial" | "unpaid";

export interface CartLineInput {
  productId: number | null;
  productName: string;
  unitCode: string;
  unitPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
}

export interface SaleTotalsInput {
  lines: CartLineInput[];
  discountType: DiscountType;
  /** percent 0-100 when percent, minor amount when amount */
  discountValueMinor: number;
  deliveryFeeMinor: number;
  amountPaidMinor: number;
}

export interface SaleTotals {
  subtotalMinor: number;
  discountAmountMinor: number;
  totalMinor: number;
  remainingMinor: number;
  paymentStatus: PaymentStatus;
  lineTotalsMinor: number[];
}

export function computeLineTotal(unitPriceMinor: number, quantity: number): number {
  assertMinorInteger(unitPriceMinor);
  assertValidQuantity(quantity);
  if (unitPriceMinor < 0) throw new DomainError("SALE_ERROR", "Prix unitaire invalide.");
  return multiplyMinorByQuantity(unitPriceMinor, quantity);
}

export function computeSaleTotals(input: SaleTotalsInput): SaleTotals {
  if (input.lines.length === 0) {
    throw new DomainError("SALE_ERROR", "Le panier est vide.");
  }
  const lineTotalsMinor = input.lines.map((l) => {
    if (l.productName.trim().length === 0) {
      throw new DomainError("SALE_ERROR", "Nom de produit manquant dans le panier.");
    }
    return computeLineTotal(l.unitPriceMinor, l.quantity);
  });
  const subtotalMinor = lineTotalsMinor.reduce((a, b) => a + b, 0);

  assertMinorInteger(input.deliveryFeeMinor);
  if (input.deliveryFeeMinor < 0) {
    throw new DomainError("SALE_ERROR", "Frais de livraison invalides.");
  }

  let discountAmountMinor = 0;
  if (input.discountType === "percent") {
    if (
      !Number.isFinite(input.discountValueMinor) ||
      input.discountValueMinor < 0 ||
      input.discountValueMinor > 100
    ) {
      throw new DomainError("SALE_ERROR", "Remise en % invalide (0-100).");
    }
    discountAmountMinor = percentOfMinor(subtotalMinor, input.discountValueMinor);
  } else if (input.discountType === "amount") {
    assertMinorInteger(input.discountValueMinor);
    if (input.discountValueMinor < 0 || input.discountValueMinor > subtotalMinor) {
      throw new DomainError("SALE_ERROR", "Montant de remise invalide.");
    }
    discountAmountMinor = input.discountValueMinor;
  } else {
    discountAmountMinor = 0;
  }

  const totalMinor = subtotalMinor - discountAmountMinor + input.deliveryFeeMinor;
  if (totalMinor < 0) throw new DomainError("SALE_ERROR", "Total de vente invalide.");

  assertMinorInteger(input.amountPaidMinor);
  if (input.amountPaidMinor < 0 || input.amountPaidMinor > totalMinor) {
    throw new DomainError("SALE_ERROR", "Le montant payé doit être entre 0 et le total.");
  }

  const remainingMinor = totalMinor - input.amountPaidMinor;
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
  };
}
