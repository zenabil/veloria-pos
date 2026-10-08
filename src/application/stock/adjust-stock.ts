// Veloria PoS — Application: AdjustStock use-case (PUR, sans IO).
// Construit la charge `stock.adjust` (validation métier pure, zéro IO).
// `operationId` est FOURNI par l'appelant (dialogue d'ajustement) ; absent =
// refus explicite (jamais de génération silencieuse qui casserait le retry).
// Le libellé FR (`reasonPrefix`, ex. « Entrée ») est fourni par l'UI : le
// français vit dans le renderer, le domaine ne rend que des codes
// (`adjustmentReasonCode`), mappés via `adjustmentReasonFr` côté dialogue.

import { computeAdjustmentNewStock, type AdjustmentKind } from "@domain/inventory/stock-rules.ts";

export interface AdjustStockDraft {
  productId: number;
  currentQty: number;
  kind: AdjustmentKind;
  quantity: number;
  /** Libellé FR déjà résolu par l'UI (`adjustmentReasonFr(code)`). */
  reasonPrefix: string;
  reason: string;
  notes?: string | null;
  reference?: string | null;
  /** Idempotence : UUID figé par l'appelant, rejoué tel quel au retry. */
  operationId: string;
}

export interface AdjustStockPayload {
  operationId: string;
  productId: number;
  newQuantity: number;
  reason: string;
  reference: string | null;
}

/** Construit la charge stock.adjust (miroir du `stockAdjustSchema` Zod main). */
export function buildAdjustStockPayload(draft: AdjustStockDraft): AdjustStockPayload {
  if (typeof draft.operationId !== "string" || draft.operationId.trim().length === 0) {
    throw new Error("operationId manquant : le use-case refuse sans identifiant d'opération.");
  }
  if (!Number.isInteger(draft.productId) || draft.productId <= 0) {
    throw new Error("Produit invalide : choisissez un produit.");
  }
  // Nouveau stock (sortie ne passe jamais sous zéro — règle du domaine).
  const newQuantity = computeAdjustmentNewStock({
    currentQty: draft.currentQty,
    kind: draft.kind,
    quantity: draft.quantity,
  });
  if (draft.reason.trim().length < 2) {
    throw new Error("Motif requis (2 lettres min.).");
  }
  const notes = (draft.notes ?? "").trim();
  if (notes.length > 500) {
    throw new Error("Notes trop longues (500 max).");
  }
  const prefix = draft.reasonPrefix.trim() === "" ? "Ajustement" : draft.reasonPrefix.trim();
  const reason =
    notes === ""
      ? `${prefix} : ${draft.reason.trim()}`
      : `${prefix} : ${draft.reason.trim()} — ${notes}`;
  // Miroir Zod (`stockAdjustSchema.reason` max 300) : refus anticipé FR au
  // lieu d'un rejet main — aucun chemin de succès modifié.
  if (reason.length > 300) {
    throw new Error("Motif trop long (300 max).");
  }
  const reference = (draft.reference ?? "").trim();
  return {
    operationId: draft.operationId,
    productId: draft.productId,
    newQuantity,
    reason,
    reference: reference === "" ? null : reference,
  };
}
