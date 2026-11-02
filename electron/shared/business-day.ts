// Veloria PoS — Main: jour métier (Africa/Algiers) + fragments SQL.
// Jumeau EXACT de `src/domain/common/business-day.ts` : electron/ ne peut pas
// importer src/ (frontière rootDir, AGENTS.md règle 5) — la parité est prouvée
// par `tests/unit/main-domain-parity.test.ts`, toute dérive casse là.
// Convention E-35 : les colonnes d'instant stockent de l'ISO UTC (`…Z`) ; le
// découpage métier applique le modificateur SQLite `+1 hour` (UTC+1 fixe, pas
// de DST). Les colonnes date-seule (`payment_date`, `expense_date`, `due_date`,
// `business_date`) ne sont JAMAIS décalées : c'est déjà une date métier.

/** Décalage Africa/Algiers depuis UTC (millisecondes). */
export const BUSINESS_DAY_OFFSET_MS = 3_600_000;

/** Fuseau métier (documenté, jamais lu depuis l'hôte). */
export const BUSINESS_TIME_ZONE = "Africa/Algiers";

/** Modificateur SQLite qui translate un instant UTC en heure d'Algiers. */
export const BUSINESS_DAY_SQL_MODIFIER = "+1 hour";

const DAY_MS = 86_400_000;

function pad(value: number, size = 2): string {
  return String(value).padStart(size, "0");
}

export function instantToEpochMs(instant: string | Date): number {
  if (instant instanceof Date) return instant.getTime();
  const text = instant.trim();
  if (text === "") return Number.NaN;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/** Date métier `AAAA-MM-JJ` d'un instant (`""` si illisible). */
export function businessDayOf(instant: string | Date): string {
  const ms = instantToEpochMs(instant);
  if (!Number.isFinite(ms)) return "";
  const shifted = new Date(ms + BUSINESS_DAY_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Date métier du moment présent. */
export function todayBusinessDate(now: Date = new Date()): string {
  return businessDayOf(now);
}

/** Mois métier `AAAA-MM` d'un instant. */
export function businessMonthOf(instant: string | Date): string {
  return businessDayOf(instant).slice(0, 7);
}

/** Heure murale du magasin `HH:MM` (`""` si illisible). */
export function businessTimeOf(instant: string | Date): string {
  const ms = instantToEpochMs(instant);
  if (!Number.isFinite(ms)) return "";
  const shifted = new Date(ms + BUSINESS_DAY_OFFSET_MS);
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** Date + heure murales du magasin. */
export function businessWallClock(instant: string | Date): { date: string; time: string } {
  return { date: businessDayOf(instant), time: businessTimeOf(instant) };
}

/**
 * Vraie date calendaire `AAAA-MM-JJ` — jumeau de `src/domain/common/business-day.ts`.
 */
function isCalendarDay(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  return day <= daysInMonth;
}

/** `AAAA-MM-JJ` + `days` jours calendaires (`""` si date irréelle). */
export function addCalendarDays(day: string, days: number): string {
  const trimmed = day.trim();
  if (!isCalendarDay(trimmed)) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!m) return "";
  const shifted = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * DAY_MS);
  if (!Number.isFinite(shifted.getTime())) return "";
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Premier jour du mois métier contenant `day`. */
export function businessMonthStart(day: string): string {
  const trimmed = day.trim();
  if (!isCalendarDay(trimmed)) return "";
  return `${trimmed.slice(0, 7)}-01`;
}

export function previousBusinessDay(day: string): string {
  return addCalendarDays(day, -1);
}

export function nextBusinessDay(day: string): string {
  return addCalendarDays(day, 1);
}

/**
 * Bornes UTC `[from, toExclusive)` d'une journée métier : minuit d'Alger du
 * jour = `T23:00:00.000Z` de la veille. Toute journée `D` couvre
 * `[D-1 23:00Z, D 23:00Z)`.
 */
export function businessDayRangeUtc(day: string): { from: string; toExclusive: string } {
  const trimmed = day.trim();
  if (!isCalendarDay(trimmed)) return { from: "", toExclusive: "" };
  return {
    from: `${addCalendarDays(trimmed, -1)}T23:00:00.000Z`,
    toExclusive: `${trimmed}T23:00:00.000Z`,
  };
}

// ---------------------------------------------------------------------------
// Fragments SQL (source unique du découpage côté base)
// ---------------------------------------------------------------------------

/** `date(<col>, '+1 hour')` — jour métier d'une colonne d'instant. */
export function businessDaySql(column: string): string {
  return `date(${column}, '${BUSINESS_DAY_SQL_MODIFIER}')`;
}

/** `strftime('%Y-S%W', <col>, '+1 hour')` — semaine métier d'une colonne d'instant. */
export function businessWeekSql(column: string): string {
  return `strftime('%Y-S%W', ${column}, '${BUSINESS_DAY_SQL_MODIFIER}')`;
}

/** `AAAA-MM` métier d'une colonne d'instant. */
export function businessMonthSql(column: string): string {
  return `strftime('%Y-%m', ${column}, '${BUSINESS_DAY_SQL_MODIFIER}')`;
}

/**
 * Jour calendaire d'une colonne DATE-SEULE (`payment_date`, `expense_date`,
 * `due_date`, `business_date`) : ces colonnes portent déjà une date métier,
 * elles ne sont donc JAMAIS décalées. Helper nommé pour que l'intention soit
 * lisible à chaque appel (aucun `substr(…,1,10)` libre dans les repos).
 */
export function calendarDaySql(column: string): string {
  return `substr(${column}, 1, 10)`;
}

/** Semaine calendaire d'une colonne date-seule (aucun décalage). */
export function calendarWeekSql(column: string): string {
  return `strftime('%Y-S%W', ${column})`;
}

/** Mois calendaire d'une colonne date-seule (aucun décalage). */
export function calendarMonthSql(column: string): string {
  return `substr(${column}, 1, 7)`;
}

/** « aujourd'hui » côté SQLite, en date métier. */
export function sqlBusinessToday(): string {
  return `date('now', '${BUSINESS_DAY_SQL_MODIFIER}')`;
}

/**
 * Étiquette « JJ/MM/AAAA HH:MM » du magasin pour l'impression côté main :
 * figée sur Africa/Algiers (jamais l'horloge de l'ordinateur, jamais ICU).
 * E-35 / G-18 : le ticket et l'écran doivent rendre la MÊME journée.
 */
export function formatBusinessDateTimeFr(instant: string | Date = new Date()): string {
  const date = businessDayOf(instant);
  if (date === "") return "—";
  const time = businessTimeOf(instant);
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}${time === "" ? "" : ` ${time}`}`;
}

/** Mois courant (`AAAA-MM`) côté SQLite, en mois métier. */
export function sqlBusinessMonthNow(): string {
  return `strftime('%Y-%m', 'now', '${BUSINESS_DAY_SQL_MODIFIER}')`;
}

/**
 * Préfixe d'expression calendaire métier : `date('now', '+1 hour'` — les
 * modificateurs supplémentaires (et leurs expressions SQL) sont ensuite
 * ajoutés par l'appelant, puis la parenthèse est fermée. Aucun fichier main
 * n'écrit donc de `date('now'` brut (garde E-35).
 */
export const SQL_BUSINESS_DATE_PREFIX = `date('now', '${BUSINESS_DAY_SQL_MODIFIER}'`;

/** « aujourd'hui − n jours » côté SQLite, en date métier. */
export function businessDaysAgoSql(days: number): string {
  return `date('now', '-${Math.trunc(days)} days', '${BUSINESS_DAY_SQL_MODIFIER}')`;
}
