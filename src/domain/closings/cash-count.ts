// Veloria PoS — Domain: comptage de caisse (framework-free).
// P3 : écart compté vs attendu, par moyen de paiement (espèces/chèque/virement).
// Pur : les attendus viennent du main (clôture), la règle rend l'écart + verdict.

import { assertSafeMinor, assertSignedTotal } from "../money/money.ts";

export interface CashCountInput {
  expectedCashMinor: number;
  expectedChequeMinor: number;
  expectedTransferMinor: number;
  countedCashMinor: number;
  countedChequeMinor: number;
  countedTransferMinor: number;
}

export interface CashCountResult {
  expectedTotalMinor: number;
  countedTotalMinor: number;
  /** Écart = compté − attendu (négatif = manquant). */
  varianceMinor: number;
  balanced: boolean;
}

function req(v: number, label: string): number {
  assertSafeMinor(v, { label });
  return v;
}

export function countCash(input: CashCountInput): CashCountResult {
  const expectedCash = req(input.expectedCashMinor, "Espèces attendues invalides");
  const expectedCheque = req(input.expectedChequeMinor, "Chèques attendus invalides");
  const expectedTransfer = req(input.expectedTransferMinor, "Virements attendus invalides");
  const countedCash = req(input.countedCashMinor, "Espèces comptées invalides");
  const countedCheque = req(input.countedChequeMinor, "Chèques comptés invalides");
  const countedTransfer = req(input.countedTransferMinor, "Virements comptés invalides");
  const expectedTotalMinor = expectedCash + expectedCheque + expectedTransfer;
  const countedTotalMinor = countedCash + countedCheque + countedTransfer;
  assertSafeMinor(expectedTotalMinor, { label: "Total attendu invalide" });
  assertSafeMinor(countedTotalMinor, { label: "Total compté invalide" });
  const varianceMinor = countedTotalMinor - expectedTotalMinor;
  assertSignedTotal(varianceMinor, "Écart de caisse invalide");
  return { expectedTotalMinor, countedTotalMinor, varianceMinor, balanced: varianceMinor === 0 };
}
