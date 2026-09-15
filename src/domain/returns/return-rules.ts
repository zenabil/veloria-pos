// Veloria PoS — Domain: returns rules.
import { DomainError } from "../common/errors.ts";
import { multiplyMinorByQuantity } from "../money/money.ts";
import { assertValidQuantity } from "../common/quantity.ts";

export interface ReturnLineInput {
  productId: number | null;
  productName: string;
  unitPriceMinor: number;
  purchasePriceMinor: number;
  soldQuantity: number;
  alreadyReturned: number;
  returnQuantity: number;
  restocked: boolean;
}

export function computeReturnLineTotal(unitPriceMinor: number, qty: number): number {
  assertValidQuantity(qty);
  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0) {
    throw new DomainError("RETURN_ERROR", "Prix unitaire de retour invalide.");
  }
  return multiplyMinorByQuantity(unitPriceMinor, qty);
}

export function validateReturnLines(lines: ReturnLineInput[]): number {
  if (lines.length === 0) throw new DomainError("RETURN_ERROR", "Aucune ligne à retourner.");
  let total = 0;
  for (const l of lines) {
    assertValidQuantity(l.returnQuantity);
    const eligible = l.soldQuantity - l.alreadyReturned;
    if (l.returnQuantity > eligible) {
      throw new DomainError(
        "RETURN_ERROR",
        `Quantité retournée (${l.returnQuantity}) supérieure à la quantité éligible (${eligible}) pour « ${l.productName} ».`,
      );
    }
    total += computeReturnLineTotal(l.unitPriceMinor, l.returnQuantity);
  }
  return total;
}
