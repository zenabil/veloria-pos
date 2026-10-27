// Veloria PoS — Domain: returns rules.
import { DomainError } from "../common/errors.ts";
import {
  assertSafeMinor,
  assertSafeTotal,
  MoneyError,
  multiplyMinorByQuantity,
  sumSafeMinors,
} from "../money/money.ts";
import { assertValidQuantity } from "../common/quantity.ts";

/** H-1: money boundary violations surface as RETURN_ERROR (domain contract). */
function asReturnError(fn: () => void, fallback: string): void {
  try {
    fn();
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw new DomainError("RETURN_ERROR", err instanceof MoneyError ? err.message : fallback);
  }
}

export type ReturnKind = "customer" | "supplier";
export type ReturnStatus = "validated" | "partially_refunded" | "refunded" | "cancelled";

export const RETURN_REASONS = [
  "Défectueux",
  "Périmé",
  "Erreur de commande",
  "Excédent",
  "Changement d'avis",
  "Autre",
] as const;

/** Numéro stable (`RET-C-00001` client, `RET-S-00001` fournisseur). */
export function formatReturnNumber(kind: ReturnKind, id: number): string {
  if (!Number.isInteger(id) || id <= 0) {
    throw new DomainError("RETURN_ERROR", "Identifiant de retour invalide.");
  }
  return `${kind === "customer" ? "RET-C" : "RET-S"}-${String(id).padStart(5, "0")}`;
}

/** Statut dérivé du remboursé vs total (l'annulation est un drapeau à part). */
export function computeReturnStatus(totalMinor: number, settledMinor: number): ReturnStatus {
  asReturnError(
    () => assertSafeTotal(totalMinor, "Valeur de retour invalide"),
    "Valeur de retour invalide.",
  );
  asReturnError(
    () => assertSafeTotal(settledMinor, "Montant réglé invalide"),
    "Montant réglé invalide.",
  );
  if (settledMinor > totalMinor) {
    throw new DomainError("RETURN_ERROR", "Règlement supérieur à la valeur du retour.");
  }
  if (totalMinor > 0 && settledMinor >= totalMinor) return "refunded";
  if (settledMinor > 0) return "partially_refunded";
  return "validated";
}

/** Remboursement complémentaire : strictement positif, borné par le reste. */
export function assertAdditionalRefund(
  totalMinor: number,
  alreadySettledMinor: number,
  amountMinor: number,
): void {
  asReturnError(
    () => assertSafeTotal(totalMinor, "Valeur de retour invalide"),
    "Valeur de retour invalide.",
  );
  asReturnError(
    () => assertSafeTotal(alreadySettledMinor, "Montant réglé invalide"),
    "Montant réglé invalide.",
  );
  asReturnError(
    () => assertSafeMinor(amountMinor, { min: 1, label: "Montant de remboursement invalide" }),
    "Montant de remboursement invalide.",
  );
  if (alreadySettledMinor + amountMinor > totalMinor) {
    throw new DomainError("RETURN_ERROR", "Remboursement supérieur au solde du retour.");
  }
}

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
  asReturnError(
    () => assertSafeMinor(unitPriceMinor, { label: "Prix unitaire de retour invalide" }),
    "Prix unitaire de retour invalide.",
  );
  try {
    return multiplyMinorByQuantity(unitPriceMinor, qty);
  } catch (err) {
    throw new DomainError(
      "RETURN_ERROR",
      err instanceof MoneyError ? err.message : "Prix unitaire de retour invalide.",
    );
  }
}

export function validateReturnLines(lines: ReturnLineInput[]): number {
  if (lines.length === 0) throw new DomainError("RETURN_ERROR", "Aucune ligne à retourner.");
  if (lines.length > 500)
    throw new DomainError("RETURN_ERROR", "Retour trop volumineux (max 500 lignes).");
  const totals: number[] = [];
  for (const l of lines) {
    assertValidQuantity(l.returnQuantity);
    const eligible = l.soldQuantity - l.alreadyReturned;
    if (l.returnQuantity > eligible) {
      throw new DomainError(
        "RETURN_ERROR",
        `Quantité retournée (${l.returnQuantity}) supérieure à la quantité éligible (${eligible}) pour « ${l.productName} ».`,
      );
    }
    totals.push(computeReturnLineTotal(l.unitPriceMinor, l.returnQuantity));
  }
  try {
    return sumSafeMinors(totals, "Total retour invalide");
  } catch (err) {
    throw new DomainError(
      "RETURN_ERROR",
      err instanceof MoneyError ? err.message : "Total retour invalide.",
    );
  }
}

/** Remboursement espèces + avoir client : bornés par la valeur du retour. */
export function assertRefundSplit(
  totalReturnMinor: number,
  refundMinor: number,
  creditMinor: number,
): void {
  asReturnError(
    () => assertSafeTotal(totalReturnMinor, "Valeur de retour invalide"),
    "Valeur de retour invalide.",
  );
  for (const [label, v] of [
    ["remboursement", refundMinor],
    ["avoir", creditMinor],
  ] as const) {
    asReturnError(
      () => assertSafeMinor(v, { label: `Montant de ${label} invalide` }),
      `Montant de ${label} invalide.`,
    );
  }
  if (refundMinor + creditMinor > totalReturnMinor) {
    throw new DomainError(
      "RETURN_ERROR",
      "Remboursement + avoir supérieurs à la valeur du retour.",
    );
  }
}

export interface ReturnSettlementInput {
  totalReturnMinor: number;
  /** Solde dû du client au moment du retour (0 = aucune dette). */
  outstandingMinor: number;
  /** Espèces demandées par l'opérateur. */
  requestedRefundMinor: number;
}

export interface ReturnSettlement {
  /** Part imputée automatiquement à la dette du client. */
  creditAppliedMinor: number;
  /** Espèces effectivement autorisées (le reste non imputé). */
  cashRefundMinor: number;
  /** Plafond espèces = valeur retour − part imputée. */
  maxCashRefundMinor: number;
  /** Part ni imputée ni remboursée (règlement complémentaire ultérieur). */
  unsettledMinor: number;
}

/**
 * Politique propriétaire : la valeur du retour éteint d'abord la dette du
 * client, puis les espèces ne peuvent couvrir que l'excédent. Un solde
 * négatif (avoir historique) ne crée aucune dette imputable.
 *
 * Miroir main : `electron/ipc/handlers/return-settlement.ts` (electron/ ne
 * peut pas importer src/) — parité prouvée par
 * `tests/unit/main-domain-parity.test.ts`.
 */
export function computeReturnSettlement(input: ReturnSettlementInput): ReturnSettlement {
  asReturnError(
    () => assertSafeTotal(input.totalReturnMinor, "Valeur de retour invalide"),
    "Valeur de retour invalide.",
  );
  asReturnError(
    () => assertSafeTotal(input.requestedRefundMinor, "Remboursement invalide"),
    "Remboursement invalide.",
  );
  if (!Number.isSafeInteger(input.outstandingMinor)) {
    throw new DomainError("RETURN_ERROR", "Solde client invalide.");
  }
  const outstanding = Math.max(0, input.outstandingMinor);
  const creditAppliedMinor = Math.min(input.totalReturnMinor, outstanding);
  const maxCashRefundMinor = input.totalReturnMinor - creditAppliedMinor;
  if (input.requestedRefundMinor > maxCashRefundMinor) {
    throw new DomainError(
      "RETURN_ERROR",
      "Remboursement en espèces supérieur au montant non imputé à la dette du client.",
    );
  }
  return {
    creditAppliedMinor,
    cashRefundMinor: input.requestedRefundMinor,
    maxCashRefundMinor,
    unsettledMinor: input.totalReturnMinor - creditAppliedMinor - input.requestedRefundMinor,
  };
}
