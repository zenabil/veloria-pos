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
