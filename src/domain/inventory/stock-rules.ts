// Veloria PoS — Domain: stock movement rules.

import { DomainError } from "../common/errors.ts";
import { assertValidQuantity, roundQuantity } from "../common/quantity.ts";

export type AdjustmentKind = "in" | "out" | "set";

export interface AdjustmentInput {
  currentQty: number;
  /** Entrée (+) · Sortie (−) · Correction/Inventaire (= valeur absolue). */
  kind: AdjustmentKind;
  quantity: number;
}

/** Nouveau stock après ajustement (Sortie ne passe jamais sous zéro). */
export function computeAdjustmentNewStock(input: AdjustmentInput): number {
  if (!Number.isFinite(input.currentQty) || input.currentQty < 0) {
    throw new DomainError("STOCK_ERROR", "Stock actuel invalide.");
  }
  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new DomainError("STOCK_ERROR", "Quantité d'ajustement invalide.");
  }
  if (input.kind !== "set" && input.quantity <= 0) {
    throw new DomainError("STOCK_ERROR", "Quantité d'ajustement strictement positive requise.");
  }
  if (input.kind === "set") return roundQuantity(input.quantity);
  const next = roundQuantity(
    input.kind === "in" ? input.currentQty + input.quantity : input.currentQty - input.quantity,
  );
  if (next < 0) throw new DomainError("STOCK_ERROR", "Le stock ne peut pas devenir négatif.");
  return next;
}

export type AdjustmentReasonCode = "inventory" | "correction" | "entry" | "exit";

/**
 * P2 : le domaine rend un CODE (pas de français ici) ; le libellé FR vit dans
 * `shared/formatters` (`adjustmentReasonFr`). Même mapping qu'avant.
 */
export function adjustmentReasonCode(
  kind: AdjustmentKind,
  dialog: "adjust" | "inventory",
): AdjustmentReasonCode {
  if (dialog === "inventory") return "inventory";
  return kind === "set" ? "correction" : kind === "in" ? "entry" : "exit";
}

export function applyStockDelta(
  currentQty: number,
  delta: number,
  opts?: { allowNegative?: boolean },
): number {
  // M-6 SINGLE SOURCE OF TRUTH: same rule as computeAdjustmentNewStock.
  // Default fails closed on negative result; caller must explicitly opt in
  // with { allowNegative: true } when the inventory policy allows it.
  if (!Number.isFinite(currentQty) || !Number.isFinite(delta)) {
    throw new DomainError("STOCK_ERROR", "Quantité de stock invalide.");
  }
  const next = roundQuantity(currentQty + delta);
  if (!Number.isFinite(next)) {
    throw new DomainError("STOCK_ERROR", "Quantité de stock invalide.");
  }
  if (next < 0 && opts?.allowNegative !== true) {
    throw new DomainError("STOCK_ERROR", "Le stock ne peut pas devenir négatif.");
  }
  return next;
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
