// Veloria PoS — Documents purs : Code 39 (zéro import hors html).
// Extrait de receipt-documents/common.ts (découpage gabarit ≤300 lignes,
// sans changement fonctionnel).

import { escapeHtml } from "./html";

// ---------------------------------------------------------------------------
// Code-barres Code 39 (SVG pur, sans dépendance) : numéros de facture/devis
// scannables vers la recherche. Alphabet : 0-9 A-Z et `- . $ / + % espace`.
// Chaque caractère = 9 modules (barre/espace alternés) dont exactement 3 larges.
// ---------------------------------------------------------------------------

/** Motifs Code 39 : 9 largeurs (n = étroit, w = large), positions paires = barres.
 * Vérifiés contre JsBarcode (MIT) + équations ISO 16388 (2 barres larges +
 * 1 espace large par caractère) ; testés exhaustivement (structure + A/P/0). */
export const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};

/** Normalise pour Code 39 (majuscules, alphabet supporté) ; « » si vide. */
export function sanitizeCode39(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((c) => Object.prototype.hasOwnProperty.call(CODE39_PATTERNS, c))
    .join("");
}

/** SVG Code 39 (début/fin `*`, texte lisible) ; « » si rien d'encodable. */
export function code39Svg(raw: string, height = 46): string {
  const text = sanitizeCode39(raw);
  if (!text) return "";
  const narrow = 2;
  const wide = narrow * 2 + 1;
  const gap = narrow;
  let x = 0;
  let rects = "";
  const full = `*${text}*`;
  for (const ch of full) {
    const pattern = CODE39_PATTERNS[ch] as string;
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === "w" ? wide : narrow;
      if (i % 2 === 0) {
        rects += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`;
      }
      x += w;
    }
    x += gap;
  }
  const width = x - gap;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 16}" width="${width}" height="${height + 16}" role="img" aria-label="Code-barres ${escapeHtml(text)}">${rects}<text x="${width / 2}" y="${height + 13}" text-anchor="middle" font-family="monospace" font-size="12" fill="#000">${escapeHtml(text)}</text></svg>`;
}
