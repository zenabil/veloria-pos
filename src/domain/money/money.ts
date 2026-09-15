// Veloria PoS — Domain: Money (DZD, integer minor units = centimes).
// 100 DZD === 10000 minor. Never use float for financial state.

export const MONEY_SCALE = 2;
export const MINOR_PER_MAJOR = 100;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function assertMinorInteger(value: number): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`Montant invalide : valeur non entière (${String(value)}).`);
  }
}

/** Create minor units from DZD major units (e.g. 12.5 DZD -> 1250). Rounds half away from zero. */
export function fromDzd(major: number): number {
  if (!Number.isFinite(major)) throw new MoneyError("Montant invalide.");
  return Math.round(major * MINOR_PER_MAJOR);
}

export function toDzd(minor: number): number {
  assertMinorInteger(minor);
  return minor / MINOR_PER_MAJOR;
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

export function addMinor(a: number, b: number): number {
  assertMinorInteger(a);
  assertMinorInteger(b);
  return a + b;
}

export function subtractMinor(a: number, b: number): number {
  assertMinorInteger(a);
  assertMinorInteger(b);
  return a - b;
}

/** Multiply minor by a quantity (quantity may be decimal, e.g. kg). Rounds to nearest minor. */
export function multiplyMinorByQuantity(unitPriceMinor: number, quantity: number): number {
  assertMinorInteger(unitPriceMinor);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new MoneyError("Quantité invalide pour le calcul du montant.");
  }
  return Math.round(unitPriceMinor * quantity);
}

/** Percentage discount on a minor amount. Percent in [0,100]. */
export function percentOfMinor(amountMinor: number, percent: number): number {
  assertMinorInteger(amountMinor);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new MoneyError("Pourcentage de remise invalide.");
  }
  return Math.round((amountMinor * percent) / 100);
}
