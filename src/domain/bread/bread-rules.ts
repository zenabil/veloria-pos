// Veloria PoS — Domain: règles pain (Phase 9, framework-free).
// Commande = quantité unique de pain (cas d'affaires de base) + prix unitaire.
// États paiement : unpaid/partial/paid ; retrait : pending/ready/delivered/cancelled.

import { DomainError } from "../common/errors.ts";
import { assertValidQuantity } from "../common/quantity.ts";
import { assertSafeMinor, assertSafeTotal, multiplyMinorByQuantity } from "../money/money.ts";

export type BreadPaymentStatus = "paid" | "partial" | "unpaid";
export type BreadPickupStatus = "pending" | "ready" | "delivered" | "cancelled";

export function computeBreadTotals(
  quantity: number,
  unitPriceMinor: number,
  amountPaidMinor: number,
): { totalMinor: number; remainingMinor: number; paymentStatus: BreadPaymentStatus } {
  // M-7: unified limits — same quantity + money boundary as sales.
  assertValidQuantity(quantity);
  assertSafeMinor(unitPriceMinor, { label: "Prix unitaire invalide" });
  assertSafeMinor(amountPaidMinor, { max: 100_000_000_000, label: "Montant payé invalide" });
  const total = multiplyMinorByQuantity(unitPriceMinor, quantity);
  assertSafeTotal(total, "Total pain invalide");
  if (amountPaidMinor > total) {
    throw new DomainError("BREAD_ERROR", "Le montant payé dépasse le total.");
  }
  const remaining = total - amountPaidMinor;
  assertSafeTotal(remaining, "Reste pain invalide");
  const status: BreadPaymentStatus =
    remaining === 0 ? "paid" : amountPaidMinor === 0 ? "unpaid" : "partial";
  return { totalMinor: total, remainingMinor: remaining, paymentStatus: status };
}

const PICKUP_FLOW: Record<BreadPickupStatus, BreadPickupStatus[]> = {
  pending: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function assertBreadPickupTransition(from: BreadPickupStatus, to: BreadPickupStatus): void {
  if (!PICKUP_FLOW[from].includes(to)) {
    throw new DomainError("BREAD_ERROR", `Retrait interdit : ${from} → ${to}.`);
  }
}
