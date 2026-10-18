// Veloria PoS — Documents purs : Code 128 ISO/IEC 15417 (zéro import hors html).
// Extrait de receipt-documents/common.ts (découpage gabarit ≤300 lignes,
// sans changement fonctionnel). Étiquettes seules (tickets et factures
// gardent Code 39) : ~20 % plus étroit que Code 39, décisif en 45mm.

import { escapeHtml } from "./html";

/** Largeurs bar/espace (6 runs) par valeur 0-106 ; stop = 106 + barre finale. */
export const CODE128_WIDTHS: readonly string[] = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "233111",
];

/** Normalise pour Code 128B/C (ASCII 32-126) ; « » si vide. */
export function sanitizeCode128(raw: string): string {
  return raw
    .split("")
    .filter((c) => {
      const n = c.charCodeAt(0);
      return n >= 32 && n <= 126;
    })
    .join("");
}

/**
 * Symboles Code 128 [départ, …données, contrôle, 106] — pur et testable.
 * Que des chiffres : set C (paires), bascule B→C si longueur impaire
 * (1er chiffre en B puis latch 99) ; sinon set B. Contrôle = modulo 103
 * (ex. Wikipedia « PJJ123C » en B → 55).
 */
export function code128Symbols(raw: string): number[] {
  const text = sanitizeCode128(raw);
  if (!text) return [];
  const data: number[] = [];
  let start: number;
  if (/^[0-9]+$/.test(text) && text.length >= 2) {
    start = 105;
    let i = 0;
    if (text.length % 2 === 1) {
      // Premier chiffre en B puis bascule C (EAN-13 : 25 % plus étroit).
      return code128SymbolsWithLatch(text);
    }
    for (; i < text.length; i += 2) data.push(Number(text.slice(i, i + 2)));
  } else {
    start = 104;
    for (const c of text) data.push(c.charCodeAt(0) - 32);
  }
  let sum = start;
  data.forEach((v, i) => {
    sum += v * (i + 1);
  });
  return [start, ...data, sum % 103, 106];
}

/** Chiffres impairs : [Start B, 1er chiffre, Code C(99), paires…, contrôle, stop]. */
function code128SymbolsWithLatch(text: string): number[] {
  const data = [text.charCodeAt(0) - 32, 99];
  for (let i = 1; i < text.length; i += 2) data.push(Number(text.slice(i, i + 2)));
  let sum = 104;
  data.forEach((v, i) => {
    sum += v * (i + 1);
  });
  return [104, ...data, sum % 103, 106];
}

/** SVG Code 128 (texte lisible + zones de silence 10 modules) ; « » si vide. */
export function code128Svg(raw: string, height = 46): string {
  const text = sanitizeCode128(raw);
  const symbols = code128Symbols(raw);
  if (!text || symbols.length === 0) return "";
  const module = 2;
  // Zone de silence ISO (10×) : les barres ne touchent jamais le bord,
  // critique sur rouleau 45mm où le pilote rogne les marges physiques.
  const quiet = module * 10;
  let x = quiet;
  let rects = "";
  for (let s = 0; s < symbols.length; s++) {
    const widths = CODE128_WIDTHS[symbols[s] as number] as string;
    for (let i = 0; i < 6; i++) {
      const w = Number(widths[i]) * module;
      if (i % 2 === 0) {
        rects += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`;
      }
      x += w;
    }
  }
  // Barre finale du stop (2 modules) + silence de fin.
  rects += `<rect x="${x}" y="0" width="${module * 2}" height="${height}" fill="#000"/>`;
  const width = x + module * 2 + quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 16}" width="${width}" height="${height + 16}" role="img" aria-label="Code-barres ${escapeHtml(text)}">${rects}<text x="${width / 2}" y="${height + 13}" text-anchor="middle" font-family="monospace" font-size="12" fill="#000">${escapeHtml(text)}</text></svg>`;
}
