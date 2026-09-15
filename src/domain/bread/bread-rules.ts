// Veloria PoS — Domain: règles pain (Phase 9, framework-free).
// Commande = quantité unique de pain (cas d'affaires de base) + prix unitaire.
// États paiement : unpaid/partial/paid ; retrait : pending/ready/delivered/cancelled.

import { DomainError } from "../common/errors.ts";

export type BreadPaymentStatus = "paid" | "partial" | "unpaid";
export type BreadPickupStatus = "pending" | "ready" | "delivered" | "cancelled";

export function computeBreadTotals(
  quantity: number,
  unitPriceMinor: number,
  amountPaidMinor: number,
): { totalMinor: number; remainingMinor: number; paymentStatus: BreadPaymentStatus } {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new DomainError("BREAD_ERROR", "Quantité de pain invalide.");
  }
  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0) {
    throw new DomainError("BREAD_ERROR", "Prix unitaire invalide.");
  }
  if (!Number.isInteger(amountPaidMinor) || amountPaidMinor < 0) {
    throw new DomainError("BREAD_ERROR", "Montant payé invalide.");
  }
  const total = Math.round(unitPriceMinor * quantity);
  if (amountPaidMinor > total) {
    throw new DomainError("BREAD_ERROR", "Le montant payé dépasse le total.");
  }
  const remaining = total - amountPaidMinor;
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
