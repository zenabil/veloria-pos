// Veloria PoS — Documents purs : texte thermique + ticket HTML (pur, zero import hors common).

import { code39Svg } from "./barcode39";
import { escapeHtml, escapePreText } from "./html";
import type { ThermalWidth } from "./common";

// ---------------------------------------------------------------------------
// C5 : texte thermique sans coupe (58mm = 32 cols, 80mm = 42 cols).
// Règle dure : les MONTANTS ne sont jamais coupés ni tronqués ; les libellés
// et noms s'enroulent sur plusieurs lignes. Zéro `…` sur un montant.
// ---------------------------------------------------------------------------

/** Colonnes utiles par largeur thermique (marges imprimante déduites). */
export function thermalCols(width?: ThermalWidth): number {
  return width === "58mm" ? 32 : 42;
}

/** Enroule un texte sur `cols` sans couper les mots (mot > cols → coupe dure). */
export function wrapThermal(text: string, cols: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (w.length > cols) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      for (let i = 0; i < w.length; i += cols) lines.push(w.slice(i, i + cols));
      continue;
    }
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > cols) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length === 0) lines.push("");
  return lines;
}

/** Ligne `libellé ... montant` : le montant n'est jamais coupé. */
export function thermalRow(label: string, amount: string, cols: number): string[] {
  if (amount.length >= cols) return [...wrapThermal(label, cols), amount];
  const room = cols - amount.length - 1;
  const parts = wrapThermal(label, cols);
  const head = parts.slice(0, -1);
  const tail = parts[parts.length - 1] as string;
  if (tail.length <= room)
    return [...head, `${tail}${" ".repeat(room - tail.length + 1)}${amount}`];
  return [...parts, amount];
}

/** Ligne `Libellé : valeur` (format historique conservé) : enroulée si > cols. */
export function thermalField(label: string, value: string, cols: number): string[] {
  const one = `${label} : ${value}`;
  if (one.length <= cols) return [one];
  return [...wrapThermal(`${label} :`, cols), ...wrapThermal(value, cols)];
}

/** Bloc article : nom enroulé + détail `qté x PU = total` (total intact). */
export function thermalItem(name: string, middle: string, right: string, cols: number): string[] {
  const out = wrapThermal(name, cols);
  const detail = middle ? `${middle} = ${right}` : right;
  if (detail.length <= cols) {
    out.push(detail);
    return out;
  }
  for (const l of wrapThermal(middle, cols)) out.push(l);
  out.push(right);
  return out;
}

/** Séparateur pleine largeur (remplace les 32 tirets fixes). */
export function thermalSep(cols: number): string {
  return "-".repeat(cols);
}

/**
 * Ticket thermique HTML (N&B strict) : texte monospace + codes scannables.
 * Chaque document thermique porte son Code 39 (N° du document) + son QR —
 * comme les A4 (`codeBlocks`), mis à l'échelle du papier (58 = 200px).
 */
export function thermalHtml(
  text: string,
  width?: ThermalWidth,
  codes?: {
    barcode?: string | undefined;
    qrSvg?: string | undefined;
    qrPayload?: string | undefined;
  },
  /** C6 : taille de police thermique Studio (9–14px, défaut 12/11). */
  fontPx?: number,
): string {
  const w: ThermalWidth = width === "58mm" ? "58mm" : "80mm";
  const px =
    typeof fontPx === "number" && Number.isFinite(fontPx)
      ? Math.min(14, Math.max(9, Math.round(fontPx)))
      : w === "58mm"
        ? 11
        : 12;
  const style =
    w === "58mm"
      ? `font-family:monospace;width:200px;font-size:${px}px;line-height:1.35;background:#fff;color:#000;margin:0`
      : `font-family:monospace;width:280px;font-size:${px}px;line-height:1.4;background:#fff;color:#000;margin:0`;
  const bar = codes?.barcode ? code39Svg(codes.barcode, 40) : "";
  const qr = codes?.qrSvg && codes.qrSvg.startsWith("<svg") ? codes.qrSvg : "";
  const payload = codes?.qrPayload ?? "";
  const blocks =
    bar || qr
      ? `<div style="text-align:center;background:#fff;max-width:${w === "58mm" ? "200px" : "280px"}">` +
        (bar ? `<div style="max-width:100%;overflow:hidden">${bar}</div>` : "") +
        (qr ? `<div>${qr}</div>` : "") +
        (payload
          ? `<div style="font-family:monospace;font-size:9px;word-break:break-all;color:#000">${escapeHtml(payload)}</div>`
          : "") +
        `</div>`
      : "";
  return `<div style="background:#fff;color:#000"><pre style="${style}">${escapePreText(text)}</pre>${blocks}</div>`;
}
