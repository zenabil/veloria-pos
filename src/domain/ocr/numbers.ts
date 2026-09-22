// Veloria PoS — Domain OCR: lecture tolérante des montants/quantités.
// Formats visés (factures DZ) : « 1 234,56 » · « 1.234,56 » · « 145.00 » ·
// « 145,00 » · « 8 900.00 » · « 12,5 ». Règle documentée (pas de devinette
// silencieuse : l'utilisateur relit tout avant import) :
// - le DERNIER séparateur suivi d'exactement 2 chiffres = décimal ;
// - un séparateur final suivi d'1 chiffre = décimal (« 12,5 ») ;
// - un séparateur final suivi de 3 chiffres = milliers (« 1.450 » → 1450) ;
// - plusieurs séparateurs : le dernier tranche (2 chiffres → décimal).
// Retourne null si illisible (jamais d'exception : l'OCR suggère seulement).
// M-23 UNIFIED LIMITS: même plafond que IPC moneyMinor (1e9 centimes = 10M DZD).
// L'OCR ne suggère jamais un montant que le main rejettera : au-delà → null
// avec rejet explicite côté UI, jamais de succès trompeur. Négatif → null
// (une facture fournisseur ne contient pas de montant négatif interprétable).

import { MAX_MINOR_SINGLE } from "../money/money.ts";
import { roundQuantity } from "../common/quantity.ts";

const MAX_MINOR = MAX_MINOR_SINGLE;

function cleanToken(raw: string): string | null {
  const s = raw
    .replace(/[€$£دج]|DZD|DA\b/gi, " ")
    .replace(/[\s\u00a0\u2000-\u200b\u202f\ufeff]+/g, "")
    .trim();
  if (s.length === 0) return null;
  // Un signe négatif médian/final invalide la lecture (pas de devinette).
  if (!/^[+-]?[\d.,]+$/.test(s)) return null;
  const body = s.replace(/^[+-]/, "");
  if (!/\d/.test(body)) return null;
  return body;
}

function splitParts(s: string): { int: string; dec: string } {
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const last = Math.max(lastComma, lastDot);
  if (last < 0) return { int: s, dec: "" };
  const tail = s.slice(last + 1);
  const head = s.slice(0, last);
  if (/^\d{2}$/.test(tail) || /^\d$/.test(tail)) {
    return { int: head, dec: tail };
  }
  if (/^\d{3}$/.test(tail)) {
    // « 1.450 » = milliers. Avec d'autres séparateurs avant, idem.
    return { int: s, dec: "" };
  }
  // Queue inattendue (vide, >3 chiffres) : illisible, pas de devinette.
  return { int: "", dec: "" };
}

/** Montant → centimes DZD (entier), null si illisible ou hors bornes. */
export function parseOcrAmountToMinor(raw: string): number | null {
  const cleaned = cleanToken(raw);
  if (cleaned === null) return null;
  // M-23: les montants négatifs OCR (bruit « - ») sont rejetés, jamais suggérés.
  if (/^\s*-/.test(raw)) return null;
  const { int, dec } = splitParts(cleaned);
  if (int === "" && dec === "") return null;
  const intDigits = int.replace(/[.,]/g, "");
  if (!/^\d+$/.test(intDigits)) return null;
  if (dec !== "" && !/^\d{1,2}$/.test(dec)) return null;
  const major = Number(intDigits);
  const cents = dec === "" ? 0 : Number(dec.padEnd(2, "0"));
  if (!Number.isFinite(major) || !Number.isFinite(cents)) return null;
  const minor = major * 100 + cents;
  if (!Number.isSafeInteger(minor) || minor < 0 || minor > MAX_MINOR) return null;
  return minor;
}

/** Quantité (décimale FR tolérée), null si invalide. */
export function parseOcrQuantity(raw: string): number | null {
  const s = raw
    .replace(/[\s\u00a0\u2000-\u200b\u202f\ufeff]+/g, "")
    .replace(",", ".")
    .trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const q = Number(s);
  if (!Number.isFinite(q) || q <= 0 || q > 1_000_000) return null;
  // P2 : arrondi 3 décimales via le helper unique (même règle que le domaine).
  return roundQuantity(q);
}

/** Remise « 5% » / « -10 % » → 5 / 10, null sinon. */
export function parseOcrDiscountPct(raw: string): number | null {
  const s = raw.replace(/[\s\u00a0\u2000-\u200b\u202f\ufeff]+/g, "").trim();
  const m = /^-?(\d+(?:[.,]\d{1,2})?)%$/.exec(s);
  if (!m) return null;
  const v = Number((m[1] ?? "").replace(",", "."));
  if (!Number.isFinite(v) || v < 0 || v > 100) return null;
  return v;
}
