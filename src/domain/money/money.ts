// Veloria PoS — Domain: Money (DZD, integer minor units = centimes).
// 100 DZD === 10000 minor. Never use float for financial state.
//
// H-1 MONEY SAFETY BOUNDARY (RADICAL REPAIR):
// Single boundary for ALL financial values. Every operation is protected
// against NaN / Infinity / unsafe integer / overflow / underflow / negative
// where forbidden. Layers: IPC (moneyMinor 0..1e9) + Domain (here) + DB CHECKs.
// - Single value cap: MAX_MINOR_SINGLE = 1e9 (10M DZD, mirrors IPC validator).
// - Accumulated total cap: MAX_MINOR_TOTAL = 1e11 (100M DZD cumulé, fail-closed
//   bien avant 9e15 — ADR-028 ; couvre 200 lignes tout en restant exact).
// - OCR parser cap (1e12) stays below IPC cap so OCR suggestions that exceed
//   the main boundary are rejected with a clear FR message, never silently.

export const MINOR_PER_MAJOR = 100;

/** Single financial value cap (centimes). Mirrors IPC `moneyMinor` 0..1e9. */
export const MAX_MINOR_SINGLE = 1_000_000_000;
/** Accumulated total cap (centimes). Fail-closed well below MAX_SAFE_INTEGER. */
export const MAX_MINOR_TOTAL = 100_000_000_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Core guard: finite + safe integer + range. The single source of truth. */
export function assertSafeMinor(
  value: number,
  opts?: { min?: number; max?: number; label?: string },
): void {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? MAX_MINOR_SINGLE;
  const label = opts?.label ?? "Montant invalide";
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} : valeur non entière sûre (${String(value)}).`);
  }
  if (value < min || value > max) {
    throw new MoneyError(`${label} : hors bornes [${min}, ${max}].`);
  }
}

/** Guard for accumulated totals (subtotal/total/remaining/COGS/profit...). */
export function assertSafeTotal(value: number, label = "Total invalide"): void {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} : valeur non entière sûre (${String(value)}).`);
  }
  if (value < 0 || value > MAX_MINOR_TOTAL) {
    throw new MoneyError(`${label} : hors bornes [0, ${MAX_MINOR_TOTAL}].`);
  }
}

/** Overflow-safe addition of two safe minors. */
export function addSafeMinor(a: number, b: number, label = "Total invalide"): number {
  assertSafeTotal(a, label);
  assertSafeTotal(b, label);
  const sum = a + b;
  if (!Number.isSafeInteger(sum) || sum < 0 || sum > MAX_MINOR_TOTAL) {
    throw new MoneyError(`${label} : dépassement de capacité.`);
  }
  return sum;
}

/** Overflow-safe sum of N safe minors (invoices with 200+ lines). */
export function sumSafeMinors(values: readonly number[], label = "Sous-total invalide"): number {
  let acc = 0;
  for (const v of values) {
    assertSafeMinor(v, { label });
    acc += v;
    if (!Number.isSafeInteger(acc) || acc < 0 || acc > MAX_MINOR_TOTAL) {
      throw new MoneyError(`${label} : dépassement de capacité.`);
    }
  }
  return acc;
}

/**
 * Garde pour totaux SIGNÉS (remises : la majoration donne du négatif).
 * Bornes [−MAX_MINOR_TOTAL, +MAX_MINOR_TOTAL], entiers sûrs.
 */
export function assertSignedTotal(value: number, label = "Total invalide"): void {
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    Math.abs(value) > MAX_MINOR_TOTAL
  ) {
    throw new MoneyError(`${label} : hors bornes signé.`);
  }
}

/**
 * Overflow-safe sum of N SIGNED minors (remises de lignes : la majoration
 * — prix relevé — donne une remise négative). Chaque entrée et l'accumulateur
 * restent dans [−MAX_MINOR_TOTAL, +MAX_MINOR_TOTAL] en entiers sûrs.
 */
export function sumSignedMinors(values: readonly number[], label = "Remise invalide"): number {
  let acc = 0;
  for (const v of values) {
    assertSignedTotal(v, label);
    acc += v;
    assertSignedTotal(acc, `${label} : dépassement de capacité.`);
  }
  return acc;
}

export function assertMinorInteger(value: number): void {
  assertSafeMinor(value);
}

/** Create minor units from DZD major units (e.g. 12.5 DZD -> 1250). Rounds half away from zero. */
export function fromDzd(major: number): number {
  if (!Number.isFinite(major)) throw new MoneyError("Montant invalide.");
  // Overflow guard BEFORE multiplication: major * 100 must stay safe.
  if (Math.abs(major) > MAX_MINOR_SINGLE / MINOR_PER_MAJOR) {
    throw new MoneyError("Montant invalide : hors bornes.");
  }
  const out = Math.round(major * MINOR_PER_MAJOR);
  assertSafeMinor(out);
  return out;
}

/**
 * H-1 §24 — Strict parser: valid input → valid Money, invalid → controlled
 * MoneyError (jamais NaN). SEUL parseur d'entrée (P1-5 : l'ancien
 * `dzdInputToMinor` NaN a été supprimé après migration des 28 appelants).
 */
export function parseDzdInputStrict(raw: string, label = "Montant invalide"): number {
  if (typeof raw !== "string") throw new MoneyError(`${label}.`);
  if (raw.trim().length === 0) throw new MoneyError(`${label} : saisie vide.`);
  const n = Number(raw.replace(",", ".").trim());
  if (!Number.isFinite(n)) throw new MoneyError(`${label} : saisie non numérique.`);
  if (n < 0) throw new MoneyError(`${label} : montant négatif interdit.`);
  if (n * MINOR_PER_MAJOR > MAX_MINOR_SINGLE + 50) {
    throw new MoneyError(`${label} : montant trop élevé.`);
  }
  const out = Math.round(n * MINOR_PER_MAJOR);
  assertSafeMinor(out, { label });
  return out;
}

/** Format minor units for French UI: "1 250,00 DZD". */
export function formatDzd(minor: number): string {
  assertMinorInteger(minor);
  const value = minor / MINOR_PER_MAJOR;
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} DZD`;
}

/**
 * RADICAL-FIX: valeur initiale des CHAMPS de saisie (sans suffixe/groupement).
 * Sortie STRICTEMENT identique à l'ancien motif dispersé
 * `(minor / 100).toString().replace(".", ",")` ("12,5"), centralisé + gardé :
 * corrompu/NaN → MoneyError (jamais de textesilencieux dans le champ).
 * Round-trip garanti : `parseDzdInputStrict(minorToInput(m)) === m`.
 * Réservé aux inputs — l'affichage utilise `formatDzd` (groupement + "DZD").
 */
export function minorToInput(minor: number): string {
  assertSafeMinor(minor);
  return (minor / MINOR_PER_MAJOR).toString().replace(".", ",");
}

/** Multiply minor by a quantity (quantity may be decimal, e.g. kg). Rounds to nearest minor. */
export function multiplyMinorByQuantity(unitPriceMinor: number, quantity: number): number {
  assertSafeMinor(unitPriceMinor, { label: "Prix unitaire invalide" });
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new MoneyError("Quantité invalide pour le calcul du montant.");
  }
  if (quantity > 1_000_000) throw new MoneyError("Quantité invalide pour le calcul du montant.");
  // Overflow guard BEFORE multiplication (price*qty must stay within total cap).
  if (unitPriceMinor !== 0 && Math.abs(quantity) > MAX_MINOR_TOTAL / Math.abs(unitPriceMinor)) {
    throw new MoneyError("Montant de ligne : dépassement de capacité.");
  }
  const out = Math.round(unitPriceMinor * quantity);
  assertSafeTotal(out, "Montant de ligne invalide");
  return out;
}

/** Percentage discount on a minor amount. Percent in [0,100]. */
export function percentOfMinor(amountMinor: number, percent: number): number {
  assertSafeTotal(amountMinor, "Montant de remise invalide");
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new MoneyError("Pourcentage de remise invalide.");
  }
  const out = Math.round((amountMinor * percent) / 100);
  assertSafeTotal(out, "Montant de remise invalide");
  return out;
}
