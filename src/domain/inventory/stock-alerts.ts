// Veloria PoS — Domain: alertes stock (framework-free, pur).
// P3 : seuils bas + péremption (FEFO : le plus proche périme d'abord) +
// suggestion de réassort. Le main calcule déjà les agrégats ; ce module
// DONNE la règle d'évaluation (même verdict partout : UI, rapports, OCR).

import { DomainError } from "../common/errors.ts";
import { isRealCalendarDate } from "../common/dates.ts";

export type StockLevel = "ok" | "low" | "out";
export type ExpiryState = "none" | "ok" | "soon" | "expired";

/** Niveau vs seuil minimum (quantité peut être fractionnaire, kg). */
export function lowStockStatus(quantity: number, minStockLevel: number): StockLevel {
  if (!Number.isFinite(quantity) || !Number.isFinite(minStockLevel)) {
    throw new DomainError("STOCK_ERROR", "Seuil de stock invalide.");
  }
  if (quantity <= 0) return "out";
  if (minStockLevel > 0 && quantity <= minStockLevel) return "low";
  return "ok";
}

/** État de péremption à la date du jour (AAAA-MM-JJ). */
export function expiryStatus(
  expirationDate: string | null,
  today: string,
  warnDays: number,
): ExpiryState {
  if (expirationDate === null || expirationDate === "") return "none";
  if (!isRealCalendarDate(expirationDate) || !isRealCalendarDate(today)) {
    throw new DomainError("STOCK_ERROR", "Date de péremption invalide.");
  }
  if (!Number.isInteger(warnDays) || warnDays < 0) {
    throw new DomainError("STOCK_ERROR", "Seuil d'alerte péremption invalide.");
  }
  if (expirationDate < today) return "expired";
  const limit = addDays(today, warnDays);
  return expirationDate <= limit ? "soon" : "ok";
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Quantité à commander pour remonter au max (0 si rien à faire). */
export function reorderSuggestion(
  quantity: number,
  minStockLevel: number,
  maxStockLevel: number,
): number {
  const level = lowStockStatus(quantity, minStockLevel);
  if (level === "ok") return 0;
  if (!Number.isFinite(maxStockLevel) || maxStockLevel < 0) {
    throw new DomainError("STOCK_ERROR", "Stock maximum invalide.");
  }
  const need = Math.round((maxStockLevel - quantity) * 1000) / 1000;
  return need > 0 ? need : 0;
}
