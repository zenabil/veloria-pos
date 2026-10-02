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

export function formatDateFr(iso: string): string {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
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
