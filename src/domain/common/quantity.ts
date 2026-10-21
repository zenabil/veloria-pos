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

/**
 * W7 (D-02) — SOURCE UNIQUE de la saisie de quantité.
 * Auparavant trois copies divergentes :
 * `features/stock/types.ts` (`parseQtyInput`),
 * `features/products/dialogs/common.ts` (`parseQty`) et
 * `domain/sales/weight-sale.ts` (`parseQuantityInput`).
 *
 * Règle unique : virgule acceptée (« 1,5 »), **décimal simple uniquement**
 * (« 1e3 », « 0x10 », « +5 » sont refusés : `Number()` les accepterait),
 * 3 décimales max, borné par MAX_QUANTITY.
 * - `allowZero` : le 0 est-il une quantité valide (stock, seuil, quantité
 *   reçue) ? Par défaut non (une vente de 0 n'est pas une vente) ;
 * - saisie vide ⇒ `null` (plus de « "" = 0 » implicite : les champs qui
 *   veulent 0 le normalisent explicitement avant l'appel).
 */
export function parseQuantityInput(raw: string, opts?: { allowZero?: boolean }): number | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(",", ".").trim();
  if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n > MAX_QUANTITY) return null;
  const allowZero = opts?.allowZero ?? false;
  if (!allowZero && n <= 0) return null;
  const qty = roundQuantity(n);
  if (qty === 0 && !allowZero) return null;
  return qty;
}

/**
 * W7 (D-03) — SOURCE UNIQUE du formatage de quantité.
 * Dupliqué à l'identique (`fmtQty` dans `features/sales/sell/sell-search.ts`
 * — qui affichait « 1.5 » au lieu de « 1,5 » — et `formatQtyFr` dans
 * `features/sales/sell/sell-weight.ts`). Format FR : virgule décimale,
 * zéros parasites retirés.
 */
export function formatQuantityFr(qty: number): string {
  return String(roundQuantity(qty)).replace(".", ",");
}
