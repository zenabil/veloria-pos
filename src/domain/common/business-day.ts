// Veloria PoS — Domain: jour métier (Africa/Algiers), framework-free, zéro import.
// E-35 / G-18 (audit 2026-10-19) : les horodatages SQLite restent des instants
// UTC ISO (`…Z`), mais TOUT ce qui découpe le temps — jour, semaine, mois,
// clôture Z, échéances de dettes, séries de rapports, affichages — suit le
// fuseau du magasin : Africa/Algiers = UTC+1 fixe, sans heure d'été (décision
// Q17 « (a) Africa/Algiers », justifiée par le produit, notamment la zakat).
// Copie main : `electron/shared/business-day.ts` (frontière rootDir) — parité
// prouvée par `tests/unit/main-domain-parity.test.ts`.

/** Fuseau unique du métier Veloria (pas de DST → décalage fixe). */
export const BUSINESS_TIME_ZONE = "Africa/Algiers";

/** Décalage Africa/Algiers depuis UTC, en millisecondes (3 600 000 = UTC+1). */
export const BUSINESS_DAY_OFFSET_MS = 3_600_000;

const DAY_MS = 86_400_000;

function pad(value: number, size = 2): string {
  return String(value).padStart(size, "0");
}

/** Instant lisible (ISO `…Z`, ISO avec décalage, `AAAA-MM-JJ`, ou `Date`) → millisecondes UTC, sinon NaN. */
export function instantToEpochMs(instant: string | Date): number {
  if (instant instanceof Date) return instant.getTime();
  const text = instant.trim();
  if (text === "") return Number.NaN;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * Date métier `AAAA-MM-JJ` correspondant à un instant. `""` si l'instant est
 * illisible (chaque appelant garde sa politique : refus, repli, log).
 */
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

/** Mois métier `AAAA-MM` d'un instant (clé de agrégats et de déduplication). */
export function businessMonthOf(instant: string | Date): string {
  return businessDayOf(instant).slice(0, 7);
}

/** Heure murale du magasin `HH:MM` pour un instant (`""` si illisible). */
export function businessTimeOf(instant: string | Date): string {
  const ms = instantToEpochMs(instant);
  if (!Number.isFinite(ms)) return "";
  const shifted = new Date(ms + BUSINESS_DAY_OFFSET_MS);
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** Date + heure murales du magasin, prêtes à afficher (`""`/`""` si illisible). */
export function businessWallClock(instant: string | Date): { date: string; time: string } {
  return { date: businessDayOf(instant), time: businessTimeOf(instant) };
}

/**
 * `AAAA-MM-JJ` + `days` jours calendaires (arithmétique UTC pure, sans heure
 * d'été à gérer). `""` si la date est illisible OU n'est pas une date réelle
 * (`2026-13-45` ne doit jamais devenir `2027-02-15`).
 */
export function addCalendarDays(day: string, days: number): string {
  const trimmed = day.trim();
  if (!isCalendarDay(trimmed)) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!m) return "";
  const shifted = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * DAY_MS);
  if (!Number.isFinite(shifted.getTime())) return "";
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * Vraie date calendaire `AAAA-MM-JJ` (format + mois/jours réels, bissextiles
 * comprises). Dupliquée de `dates.ts`/`business-day.ts` main : la frontière
 * main/renderer interdit tout import croisé, et la parité est prouvée par
 * `tests/unit/main-domain-parity.test.ts`.
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

/** Premier jour du mois métier contenant `day` (`""` si date irréelle). */
export function businessMonthStart(day: string): string {
  const trimmed = day.trim();
  if (!isCalendarDay(trimmed)) return "";
  return `${trimmed.slice(0, 7)}-01`;
}

/** Date métier → `AAAA-MM-JJ` du jour précédent / suivant (raccourcis). */
export function previousBusinessDay(day: string): string {
  return addCalendarDays(day, -1);
}

export function nextBusinessDay(day: string): string {
  return addCalendarDays(day, 1);
}

/**
 * Bornes d'une journée métier exprimées en instants UTC (comparables aux
 * `created_at` stockés) : `[from, toExclusive)` = minuit Africa/Algiers du
 * jour, soit `T23:00:00.000Z` de la VELLE, jusqu'à minuit du lendemain.
 * Exemple : la journée `2026-09-02` couvre `[2026-09-01T23:00:00.000Z,
 * 2026-09-02T23:00:00.000Z)` — une vente à 23:30 UTC du 1er septembre appartient
 * bien au 2 septembre. Les bornes restent comparables à un index sur
 * `created_at`. `""` si `day` n'est pas une date calendaire réelle.
 */
export function businessDayRangeUtc(day: string): { from: string; toExclusive: string } {
  const trimmed = day.trim();
  if (!isCalendarDay(trimmed)) return { from: "", toExclusive: "" };
  return {
    from: `${addCalendarDays(trimmed, -1)}T23:00:00.000Z`,
    toExclusive: `${trimmed}T23:00:00.000Z`,
  };
}
