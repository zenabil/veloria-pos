// Veloria Owner — formateurs d'affichage (purs, français uniquement).
// Montants stockés en centimes DZD : « 1 234,56 DZD », jamais de flottant.

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const SHORT_DAYS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];

const SHORT_MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

/**
 * E-35 : le magasin est en Africa/Algiers (UTC+1 fixe, sans heure d'été). Les
 * instants reçus du POS sont en UTC ; ils s'affichent donc CALÉD sur ce fuseau,
 * et non sur celui du téléphone (Hermes ne fournit pas `Intl` complet →
 * arithmétique manuelle). `parseIso` rend une date dont les composantes UTC sont
 * l'heure d'Alger ; `parseInstant` garde l'instant brut pour les durées.
 */
const BUSINESS_OFFSET_MS = 3_600_000;

function parseInstant(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Exporté pour les écrans : une date de liasse (`AAAA-MM-JJ` ou instant UTC) se
 * lit TOUJOURS en UTC sur ce fuseau (E-35). Un `getDay()`/`getDate()` local est
 * interdit — à l'ouest d'UTC il décale le jour d'une unité.
 */
export function parseIso(iso: string): Date | null {
  const d = parseInstant(iso);
  return d === null ? null : new Date(d.getTime() + BUSINESS_OFFSET_MS);
}

/** Un instant ISO → `AAAA-MM-JJ` du jour métier (une date seule n'est pas décalée). */
export function businessDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = parseIso(iso);
  if (d === null) return "";
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Centimes → « 12 500,00 DZD » (espace fine insécable entre les milliers). */
export function formatMinor(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error("Montant invalide.");
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const major = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped},${pad(cents)} DZD`;
}

/**
 * Rendu ÉCRAN d'un montant (même règle que `formatDzdSafe` du POS et le
 * « — » de l'APK) : une valeur corrompue venue du cloud dégrade en « — »,
 * jamais en exception au render. `formatMinor` reste strict pour les chemins
 * non affichés (calcul, journal, tests).
 */
export function formatMinorSafe(value: unknown): string {
  return typeof value === "number" && Number.isSafeInteger(value) ? formatMinor(value) : "—";
}

/** Montant signé pour les journaux : « +6 800,00 DZD » / « -1 200,00 DZD ». */
export function formatSignedMinor(minor: number): string {
  if (minor > 0) return `+${formatMinor(minor)}`;
  return formatMinor(minor);
}

/** Variante d'affichage de `formatSignedMinor` : corrompu → « — ». */
export function formatSignedMinorSafe(value: unknown): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return "—";
  return formatSignedMinor(value);
}

/** ISO → « Jeudi 30 octobre 2026 » (heure d'Alger). */
export function formatDateLongFr(iso: string): string {
  const d = parseIso(iso);
  if (!d) return "—";
  const day = DAYS[d.getUTCDay()] ?? "";
  const capitalized = day.charAt(0).toUpperCase() + day.slice(1);
  return `${capitalized} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
}

/** ISO → « Mer. 29 oct. » (heure d'Alger). */
export function formatDateShortFr(iso: string): string {
  const d = parseIso(iso);
  if (!d) return "—";
  return `${SHORT_DAYS[d.getUTCDay()] ?? "—"} ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()] ?? ""}`;
}

/** ISO → « 17:42 » (heure d'Alger). */
export function formatTime(iso: string): string {
  const d = parseIso(iso);
  if (!d) return "—";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** ISO → « 30/10/2026 » (jour métier du magasin). */
export function formatDateFr(iso: string): string {
  const d = businessDay(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

/** « Mis à jour il y a 12 min » — fraîcheur de la dernière synchronisation. */
export function freshnessLabel(iso: string, nowMs: number = Date.now()): string {
  const d = parseInstant(iso);
  if (!d) return "Synchronisation inconnue";
  const minutes = Math.max(0, Math.floor((nowMs - d.getTime()) / 60_000));
  if (minutes < 1) return "Mis à jour à l'instant";
  if (minutes < 60) return `Mis à jour il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Mis à jour il y a ${hours} h`;
  return `Mis à jour le ${formatDateFr(iso)} à ${formatTime(iso)}`;
}

/** « 8,2 % » — virgule française ; valeur illisible → « — » (rendu total). */
export function formatPercent(value: unknown, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits).replace(".", ",")} %`;
}

/** « 3 flacons » / « 1 flacon » : unité accordée au singulier sous 2. */
export function formatQuantity(qty: unknown, singular: string, plural: string): string {
  if (typeof qty !== "number" || !Number.isFinite(qty)) return "—";
  return `${qty} ${qty > 1 ? plural : singular}`;
}

/** 42 000 → « 42 000 » (sans devise, pour les tableaux) ; illisible → « — ». */
export function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
