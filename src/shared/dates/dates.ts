// Veloria PoS — Shared: dates (UTC ISO consistently).
// Les horodatages SQLite sont en UTC ; les requêtes comparent
// `substr(created_at,1,10)` (UTC), donc les défauts de formulaires utilisent
// la date UTC pour rester cohérents (pas la date locale).

export function todayUtcDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Vraie date calendaire AAAA-MM-JJ (pas seulement le format : mois/jours
 * réels, années bissextiles comprises).
 *
 * G-15 (P1) : le License Manager n'acceptait que le FORMAT de date
 * (`/^\d{4}-\d{2}-\d{2}$/`) : il pouvait donc émettre une licence signée
 * avec `2026-02-30`, que le POS rejette ensuite (`Date.parse` → NaN →
 * `CORRUPTED_STATE`). Cette fonction est la source partagée par le Manager,
 * le domaine (`src/domain/common/dates.ts`) et le main
 * (`electron/ipc/validators.common.ts`) — parité prouvée par
 * `tests/unit/main-domain-parity.test.ts`.
 */
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
