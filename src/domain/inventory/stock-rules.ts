// Veloria PoS — Domain: stock movement rules.

import { DomainError } from "../common/errors.ts";
import { assertValidQuantity, roundQuantity } from "../common/quantity.ts";

export type MovementType =
  | "sale_out"
  | "sale_cancel_in"
  | "intake_in"
  | "adjust_in"
  | "adjust_out"
  | "return_in"
  | "damage_out";

export function applyStockDelta(currentQty: number, delta: number): number {
  if (!Number.isFinite(currentQty) || !Number.isFinite(delta)) {
    throw new DomainError("STOCK_ERROR", "Quantité de stock invalide.");
  }
  const next = roundQuantity(currentQty + delta);
  return next;
}

export function assertSaleDecrement(
  currentQty: number,
  requested: number,
  allowNegative: boolean,
): void {
  assertValidQuantity(requested);
  if (!allowNegative && requested > currentQty) {
    throw new DomainError("STOCK_ERROR", "Stock insuffisant pour cette vente.");
  }
}

export function assertReturnQuantity(
  soldQty: number,
  alreadyReturned: number,
  requested: number,
): void {
  assertValidQuantity(requested);
  const eligible = soldQty - alreadyReturned;
  if (requested > eligible) {
    throw new DomainError("RETURN_ERROR", "Quantité retournée supérieure à la quantité éligible.");
  }
}
