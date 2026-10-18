// Veloria PoS — Documents purs : etiquettes code-barres (pur).

import { code128Svg, sanitizeCode128 } from "./barcode128";
import { fmtDzd } from "./chrome";

// ---------------------------------------------------------------------------
// Étiquettes code-barres : planche A4 (24 / page : 3 colonnes × 8 lignes).
// Une seule source déterministe (aperçu = impression).
// ---------------------------------------------------------------------------

export interface LabelItem {
  name: string;
  priceMinor: number;
  barcode: string;
  /** C5 : QR du code-barres (SVG injecté côté main, vide = Code 39 seul). */
  qrSvg?: string | undefined;
}

export type LabelFormat = "30x20" | "45x20" | "50x30" | "58x30" | "58x40" | "A4-24" | "custom";

export interface LabelOptions {
  format?: LabelFormat | undefined;
  customWidthMm?: number | undefined;
  customHeightMm?: number | undefined;
}

/** Dimensions réelles du format (mm) — source unique CSS + microns. */
function labelDims(opts: LabelOptions): { wMm: number; hMm: number } | null {
  const f = opts.format ?? "A4-24";
  if (f === "30x20") return { wMm: 30, hMm: 20 };
  if (f === "45x20") return { wMm: 45, hMm: 20 };
  if (f === "50x30") return { wMm: 50, hMm: 30 };
  if (f === "58x30") return { wMm: 58, hMm: 30 };
  if (f === "58x40") return { wMm: 58, hMm: 40 };
  if (f === "custom") {
    const w =
      typeof opts.customWidthMm === "number" ? Math.min(210, Math.max(10, opts.customWidthMm)) : 50;
    const h =
      typeof opts.customHeightMm === "number"
        ? Math.min(297, Math.max(10, opts.customHeightMm))
        : 30;
    return { wMm: w, hMm: h };
  }
  return null;
}

/**
 * Taille de page Electron/Chromium en microns (1mm = 1000µm).
 * `null` = planche A4 (défaut imprimante). Un appel = une étiquette :
 * le HTML porte aussi `break-after:page` par étiquette, donc 1 étiquette
 * ne peut plus déborder sur des étiquettes vierges.
 */
export function labelPageMicrons(opts: LabelOptions): { width: number; height: number } | null {
  const d = labelDims(opts);
  if (!d) return null;
  return { width: Math.round(d.wMm * 1000), height: Math.round(d.hMm * 1000) };
}

function labelPageStyle(opts: LabelOptions): {
  page: string;
  cols: number;
  namePx: number;
  pricePx: number;
  barH: number;
} {
  const f = opts.format ?? "A4-24";
  if (f === "30x20") return { page: "30mm 20mm", cols: 1, namePx: 8, pricePx: 10, barH: 24 };
  if (f === "45x20") return { page: "45mm 20mm", cols: 1, namePx: 8, pricePx: 12, barH: 18 };
  if (f === "50x30") return { page: "50mm 30mm", cols: 1, namePx: 10, pricePx: 14, barH: 30 };
  if (f === "58x30") return { page: "58mm 30mm", cols: 1, namePx: 10, pricePx: 14, barH: 30 };
  if (f === "58x40") return { page: "58mm 40mm", cols: 1, namePx: 10, pricePx: 14, barH: 30 };
  if (f === "custom") {
    const w =
      typeof opts.customWidthMm === "number" ? Math.min(210, Math.max(10, opts.customWidthMm)) : 50;
    const h =
      typeof opts.customHeightMm === "number"
        ? Math.min(297, Math.max(10, opts.customHeightMm))
        : 30;
    return { page: `${w}mm ${h}mm`, cols: 1, namePx: 10, pricePx: 14, barH: 30 };
  }
  return { page: "A4", cols: 3, namePx: 11, pricePx: 14, barH: 34 };
}

export function buildLabelsHtml(items: LabelItem[], opts?: LabelOptions): string {
  const st = labelPageStyle(opts ?? {});
  // Thermique rouleau : 1 étiquette = 1 page physique (pas de marge CSS —
  // le format exact est imposé via pageSize microns côté main). Sans
  // `break-after`, Chromium faisait déborder le contenu (marges 5mm +
  // marge body 8px) sur 2-4 pages → étiquettes vierges en sortie.
  const thermal = (opts?.format ?? "A4-24") !== "A4-24";
  const pageMargin = thermal ? "0" : "5mm";
  const bodyMargin = thermal ? "body{margin:0}" : "";
  const labelBreak = thermal ? ".label{break-after:page}.label:last-child{break-after:auto}" : "";
  // Zone de sécurité : le pilote rogne ~2mm physiques par bord — le contenu
  // thermique reste à 2mm des bords pour ne plus déborder du support.
  const labelSafe = thermal ? ".label{padding:8px 12px;margin:0 2mm}" : "";
  const cells = items
    .map((it) => {
      const code = sanitizeCode128(it.barcode);
      const svg = code ? code128Svg(code, st.barH) : "";
      const qr =
        typeof it.qrSvg === "string" && it.qrSvg.startsWith("<svg")
          ? `<div class="lqr">${it.qrSvg}</div>`
          : "";
      return `<div class="label"><div class="lprice" style="font-size:${st.pricePx}px">${fmtDzd(it.priceMinor)}</div>${svg}${qr}</div>`;
    })
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Étiquettes code-barres</title>
<style>@page{size:${st.page};margin:${pageMargin}}body{font-family:Arial,sans-serif;background:#fff;color:#000}${bodyMargin}${labelBreak}${labelSafe}
.sheet{display:grid;grid-template-columns:repeat(${st.cols},1fr);gap:6px}
.label{border:1px solid #000;border-radius:4px;padding:6px 8px;text-align:center;overflow:hidden;page-break-inside:avoid;background:#fff;color:#000}
.label img{filter:grayscale(1) contrast(1.15)}
.lprice{font-weight:bold;margin:2px 0;color:#000}
.label svg{max-width:100%;height:auto}
.lqr svg{width:64px;height:64px}</style>
</head><body><div class="sheet">${cells}</div></body></html>`;
}
