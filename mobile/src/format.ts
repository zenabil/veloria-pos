// Veloria Client (APK) — Formateurs d'affichage (purs).
// Centimes → "12 500,00 دج / DZD" (espaces fines, jamais de float).
// Dates stockées AAAA-MM-JJ(T…) → affichées JJ/MM/AAAA dans les deux langues.

import type { Lang } from "./i18n.ts";

/**
 * Chiffres arabes/persans (٠-٩, ۰-۹ — clavier arabe courant) → ASCII 0-9.
 * Sans cela un PIN saisi au clavier arabe échoue le regex ^[0-9]{6}$ et le
 * hash téléphone ne correspond jamais à celui du POS (toujours ASCII).
 */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function formatMinor(minor: number, lang: Lang): string {
  if (!Number.isSafeInteger(minor)) throw new Error("Montant invalide.");
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const major = Math.floor(abs / 100);
  const cents = abs % 100;
  // Séparateur insécable étroit (U+202F) : en RTL, une espace normale coupe
  // le nombre en deux runs bidi (« 3 » détaché). L'insécable garde le bloc.
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const unit = lang === "ar" ? "دج" : "DZD";
  return `${sign}${grouped},${String(cents).padStart(2, "0")} ${unit}`;
}

/**
 * E-35 : les dates s'affichent dans le fuseau du MAGASIN (Africa/Algiers =
 * UTC+1 fixe, sans heure d'été), jamais dans celui du téléphone — sinon la
 * facture vue dans l'APK et le ticket rendu par la caisse affichent deux jours
 * différents pour la même vente (audit G-18). Arithmétique manuelle : Hermes
 * n'offre pas `Intl` complet.
 */
const BUSINESS_OFFSET_MS = 3_600_000;

/** Un instant ISO UTC → ses composantes d'heure algérienne (`null` si illisible). */
function algiersParts(iso: string): {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
} | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const shifted = new Date(ms + BUSINESS_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
    mi: shifted.getUTCMinutes(),
  };
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * ISO (instant OU date seule `AAAA-MM-JJ`) → `AAAA-MM-JJ` du jour métier.
 * Une date seule est déjà une date métier : elle n'est jamais décalée.
 */
export function businessDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const p = algiersParts(iso);
  return p === null ? "" : `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
}

/** ISO → « JJ/MM/AAAA » en jour métier ; invalide → « — ». */
export function formatDateFr(iso: string): string {
  const d = businessDay(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

/** ISO → « JJ/MM HH:MM » (heure d'Alger, fraîcheur de synchro) ; invalide → « — ». */
export function formatDateTimeFr(iso: string): string {
  const p = algiersParts(iso);
  if (p === null) return "—";
  return `${pad2(p.d)}/${pad2(p.mo)} ${pad2(p.h)}:${pad2(p.mi)}`;
}

const MONTHS: Record<Lang, string[]> = {
  ar: [
    "جانفي",
    "فيفري",
    "مارس",
    "أفريل",
    "ماي",
    "جوان",
    "جويلية",
    "أوت",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ],
  fr: [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ],
};

/** "2026-09" → "سبتمبر 2026" / "Septembre 2026" (noms algériens usuels). */
export function monthLabel(monthKey: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  const idx = Number(m[2]) - 1;
  const name = MONTHS[lang][idx];
  if (!name) return monthKey;
  return `${name} ${m[1]}`;
}

/** Ligne d'en-tête WhatsApp « j'ai une erreur » (pré-remplie par l'APK). */
export function errorReportText(opts: {
  lang: Lang;
  name: string;
  invoice: string;
  amountMinor: number;
}): string {
  const amount = formatMinor(opts.amountMinor, opts.lang);
  if (opts.lang === "ar") {
    return `السلام عليكم، أنا ${opts.name}، عندي خطأ في فاتورة ${opts.invoice} بمبلغ ${amount}. شكراً`;
  }
  return `Bonjour, je suis ${opts.name}, erreur sur la facture ${opts.invoice} (${amount}). Merci`;
}
