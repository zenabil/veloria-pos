// Veloria PoS — Main-process: politique de règlement d'un retour client.
// Miroir EXACT de `computeReturnSettlement` (src/domain/returns/return-rules.ts) :
// la valeur du retour éteint d'abord la dette du client, les espèces ne
// couvrent que l'excédent. Parité prouvée par main-domain-parity.test.ts.
import { assertTotalMinor } from "../money-guard";

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
