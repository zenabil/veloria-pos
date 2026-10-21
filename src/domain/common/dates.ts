// Veloria PoS — Domain: primitives de dates (framework-free, zéro import).
// Les horodatages SQLite sont en UTC ; les dates métier sont AAAA-MM-JJ.

/** Vraie date calendaire AAAA-MM-JJ (pas seulement le format : mois/jours réels). */
export function isRealCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = y % 400 === 0 || (y % 4 === 0 && y % 100 !== 0);
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  return day <= dim;
}

/** Date AAAA-MM-JJ → jours depuis l'époque (UTC, minuit). NaN si illisible. */
function utcDayNumber(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return Number.NaN;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : Number.NaN;
}

/**
 * W7 (D-06) — SOURCE UNIQUE de l'écart en jours.
 * Dupliqué trois fois (`domain/customer/credit-policy.ts`,
 * `domain/returns/return-policy.ts`, `features/debts/types.ts`) avec des
 * écarts de sémantique (borné à 0 dans un cas, négatif dans un autre,
 * `Date.parse` dans un autre).
 * Contrat : `to − from` en jours calendaires (négatif si `to` est avant
 * `from`), `NaN` si l'une des dates est illisible — chaque appelant garde
 * SA politique (bornage, code d'erreur) au-dessus de cette fonction.
 */
export function daysBetween(from: string, to: string): number {
  const a = utcDayNumber(from);
  const b = utcDayNumber(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}
