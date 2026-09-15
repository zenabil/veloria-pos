// Veloria PoS — Domain: Quantity value rules.
// Quantities are NUMERIC in SQLite (supports kg/piece). Business rules live here.

import { DomainError } from "./errors.ts";

export const MAX_QUANTITY = 1_000_000;

export function assertValidQuantity(qty: number, opts?: { allowZero?: boolean }): void {
  if (!Number.isFinite(qty)) {
    throw new DomainError("QUANTITY_ERROR", "Quantité invalide.");
  }
  const allowZero = opts?.allowZero ?? false;
  if (qty < 0 || (!allowZero && qty <= 0)) {
    throw new DomainError("QUANTITY_ERROR", "La quantité doit être supérieure à zéro.");
  }
  if (qty > MAX_QUANTITY) {
    throw new DomainError("QUANTITY_ERROR", "Quantité trop élevée.");
  }
  // Limit to 3 decimals (g/kg precision).
  const rounded = Math.round(qty * 1000) / 1000;
  if (Math.abs(qty - rounded) > 1e-9) {
    throw new DomainError("QUANTITY_ERROR", "Quantité avec trop de décimales (max 3).");
  }
}

export function roundQuantity(qty: number): number {
  return Math.round(qty * 1000) / 1000;
}
