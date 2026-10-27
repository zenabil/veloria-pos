// Veloria PoS — Main-process: politique de règlement d'un retour client.
// Miroir EXACT de `computeReturnSettlement` (src/domain/returns/return-rules.ts) :
// la valeur du retour éteint d'abord la dette du client, les espèces ne
// couvrent que l'excédent. Parité prouvée par main-domain-parity.test.ts.
import { assertTotalMinor, MONEY_MAX_TOTAL_MINOR } from "../money-guard";

export interface ReturnSettlementInput {
  totalReturnMinor: number;
  outstandingMinor: number;
  requestedRefundMinor: number;
}

export interface ReturnSettlement {
  creditAppliedMinor: number;
  cashRefundMinor: number;
  maxCashRefundMinor: number;
  unsettledMinor: number;
}

/** Statut d'un retour (miroir de `ReturnStatus` du domaine). */
export type ReturnStatus = "validated" | "partially_refunded" | "refunded" | "cancelled";

/**
 * Miroir EXACT de `computeReturnStatus` (src/domain/returns/return-rules.ts).
 * A6 (audit 2026-10-27) : la règle était recopiée dans `returns.repo.ts`, SANS
 * ses gardes et hors de portée du test de parité — `returns.repo` importa
 * better-sqlite3, donc restait inimportable sous Vitest. Elle vit désormais ici,
 * à côté de la politique de règlement, au seul endroit où la parité est prouvable.
 */
export function deriveReturnStatus(totalMinor: number, settledMinor: number): ReturnStatus {
  assertTotalMinor(totalMinor, "Valeur de retour invalide.");
  assertTotalMinor(settledMinor, "Montant réglé invalide.");
  if (settledMinor > totalMinor) {
    throw new Error("Règlement supérieur à la valeur du retour.");
  }
  if (totalMinor > 0 && settledMinor >= totalMinor) return "refunded";
  if (settledMinor > 0) return "partially_refunded";
  return "validated";
}

export function splitReturnSettlement(input: ReturnSettlementInput): ReturnSettlement {
  assertTotalMinor(input.totalReturnMinor, "Valeur de retour invalide.");
  assertTotalMinor(input.requestedRefundMinor, "Remboursement invalide.");
  if (!Number.isSafeInteger(input.outstandingMinor)) {
    throw new Error("Solde client invalide.");
  }
  const outstanding = Math.max(0, input.outstandingMinor);
  const creditAppliedMinor = Math.min(input.totalReturnMinor, outstanding);
  const maxCashRefundMinor = input.totalReturnMinor - creditAppliedMinor;
  if (input.requestedRefundMinor > maxCashRefundMinor) {
    throw new Error(
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

/**
 * Miroir EXACT de `netReturnLineValue` (src/domain/returns/return-rules.ts) :
 * valeur NETTE d'une ligne vendue au prorata de la quantité retournée (le
 * `line_total_minor` fait foi, jamais le prix catalogue).
 *
 * A20 (audit 2026-10-27) : la règle vivait en deux copies — l'aperçu caisse
 * retombait sur « prix catalogue × quantité » sur une donnée qu'il jugeait
 * illisible, valeur que le main refuse. Parité prouvée par
 * `tests/unit/main-domain-parity.test.ts`.
 */
export function netReturnLineValue(args: {
  soldLineTotalMinor: number;
  soldQuantity: number;
  returnedQuantity: number;
}): number {
  const { soldLineTotalMinor, soldQuantity, returnedQuantity } = args;
  if (
    !(soldQuantity > 0) ||
    !Number.isSafeInteger(soldLineTotalMinor) ||
    soldLineTotalMinor < 0 ||
    soldLineTotalMinor > MONEY_MAX_TOTAL_MINOR
  ) {
    throw new Error("Valeur de la ligne vendue invalide.");
  }
  const partTh = Math.round(returnedQuantity * 1000);
  const wholeTh = Math.round(soldQuantity * 1000);
  if (!(wholeTh > 0)) throw new Error("Quantité vendue invalide.");
  return partTh >= wholeTh
    ? soldLineTotalMinor
    : Math.round((soldLineTotalMinor * partTh) / wholeTh);
}
