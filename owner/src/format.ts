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

function parseIso(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
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

/** Montant signé pour les journaux : « +6 800,00 DZD » / « -1 200,00 DZD ». */
export function formatSignedMinor(minor: number): string {
  if (minor > 0) return `+${formatMinor(minor)}`;
  return formatMinor(minor);
}

/** ISO → « Jeudi 30 octobre 2026 ». */
export function formatDateLongFr(iso: string): string {
  const d = parseIso(iso);
  if (!d) return "—";
  const day = DAYS[d.getDay()] ?? "";
  const capitalized = day.charAt(0).toUpperCase() + day.slice(1);
  return `${capitalized} ${d.getDate()} ${MONTHS[d.getMonth()] ?? ""} ${d.getFullYear()}`;
}

/** ISO → « Mer. 29 oct. ». */
export function formatDateShortFr(iso: string): string {
  const d = parseIso(iso);
  if (!d) return "—";
  return `${SHORT_DAYS[d.getDay()] ?? "—"} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()] ?? ""}`;
}

/** ISO → « 17:42 ». */
export function formatTime(iso: string): string {
  const d = parseIso(iso);
  if (!d) return "—";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO → « 30/10/2026 ». */
export function formatDateFr(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : "";
  if (!d) return "—";
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

/** « Mis à jour il y a 12 min » — fraîcheur de la dernière synchronisation. */
export function freshnessLabel(iso: string, nowMs: number = Date.now()): string {
  const d = parseIso(iso);
  if (!d) return "Synchronisation inconnue";
  const minutes = Math.max(0, Math.floor((nowMs - d.getTime()) / 60_000));
  if (minutes < 1) return "Mis à jour à l'instant";
  if (minutes < 60) return `Mis à jour il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Mis à jour il y a ${hours} h`;
  return `Mis à jour le ${formatDateFr(iso)} à ${formatTime(iso)}`;
}

/** « 8,2 % » — virgule française. */
export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace(".", ",")} %`;
}

/** « 3 flacons » / « 1 flacon » : unité accordée au singulier sous 2. */
export function formatQuantity(qty: number, singular: string, plural: string): string {
  return `${qty} ${qty > 1 ? plural : singular}`;
}

/** 42 000 → « 42 000 » (sans devise, pour les tableaux). */
export function formatNumber(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
