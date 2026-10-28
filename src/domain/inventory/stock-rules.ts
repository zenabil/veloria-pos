// Veloria PoS — Domain: stock movement rules.

import { DomainError } from "../common/errors.ts";
import { roundQuantity } from "../common/quantity.ts";

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
