// Veloria PoS — Domain: politique de retour (framework-free).
// P3 : fenêtre de retour + frais de restockage + orientation
// (bon état → restocké, défectueux → casse sans restock).
// Montants en centimes (DZD), erreurs DomainError FR (RETURN_ERROR).

import { DomainError } from "../common/errors.ts";
import { assertSafeMinor, assertSafeTotal } from "../money/money.ts";
import { isRealCalendarDate } from "../common/dates.ts";

export type ReturnDisposition = "restock" | "damage";

export interface ReturnPolicyInput {
  /** Date de vente AAAA-MM-JJ. */
  saleDate: string;
  /** Date du retour AAAA-MM-JJ. */
  returnDate: string;
  /** Fenêtre maximale en jours (0 = sans limite). */
  maxDays: number;
  /** Frais de restockage 0-100 (% de la valeur retournée). */
  restockingFeePct: number;
  disposition: ReturnDisposition;
  /** Valeur retournée (centimes). */
  returnTotalMinor: number;
}

export interface ReturnPolicyDecision {
  allowed: boolean;
  /** Motif FR en cas de refus (undefined si autorisé). */
  reason?: string;
  /** Frais prélevés (centimes, 0 si damage ou 0%). */
  feeMinor: number;
  /** Remboursement net = total − frais. */
  netRefundMinor: number;
  /** true → réintégrer au stock (bon état uniquement). */
  restock: boolean;
}

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

export function evaluateReturnPolicy(input: ReturnPolicyInput): ReturnPolicyDecision {
  if (!isRealCalendarDate(input.saleDate) || !isRealCalendarDate(input.returnDate)) {
    throw new DomainError("RETURN_ERROR", "Dates de retour invalides.");
  }
  if (
    !Number.isInteger(input.maxDays) ||
    input.maxDays < 0 ||
    !Number.isFinite(input.restockingFeePct) ||
    input.restockingFeePct < 0 ||
    input.restockingFeePct > 100
  ) {
    throw new DomainError("RETURN_ERROR", "Politique de retour invalide.");
  }
  assertSafeMinor(input.returnTotalMinor, { label: "Valeur retournée invalide" });
  // RADICAL-FIX lint: comparaison via string (le narrowing TS rendait le 2e
  // test « toujours faux » statiquement — garde runtime contre payload forgé).
  const disposition: string = input.disposition;
  if (disposition !== "restock" && disposition !== "damage") {
    throw new DomainError("RETURN_ERROR", "Orientation du retour invalide.");
  }
  const delay = daysBetween(input.saleDate, input.returnDate);
  if (delay < 0) {
    throw new DomainError("RETURN_ERROR", "Retour antérieur à la vente : impossible.");
  }
  if (input.maxDays > 0 && delay > input.maxDays) {
    return {
      allowed: false,
      reason: `Fenêtre de retour dépassée (${delay} j > ${input.maxDays} j).`,
      feeMinor: 0,
      netRefundMinor: 0,
      restock: false,
    };
  }
  const feeMinor =
    input.disposition === "damage" || input.restockingFeePct === 0
      ? 0
      : Math.round((input.returnTotalMinor * input.restockingFeePct) / 100);
  assertSafeTotal(feeMinor, "Frais de restockage invalides");
  return {
    allowed: true,
    feeMinor,
    netRefundMinor: input.returnTotalMinor - feeMinor,
    restock: input.disposition === "restock",
  };
}
