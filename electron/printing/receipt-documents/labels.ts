// Veloria PoS — Documents purs : etiquettes code-barres (pur).

import { code39Svg, escapeHtml, sanitizeCode39 } from "./common";
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

export type LabelFormat = "30x20" | "50x30" | "58x40" | "A4-24" | "custom";

export interface LabelOptions {
  format?: LabelFormat | undefined;
  customWidthMm?: number | undefined;
  customHeightMm?: number | undefined;
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
  if (f === "50x30") return { page: "50mm 30mm", cols: 1, namePx: 10, pricePx: 14, barH: 30 };
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
  const cells = items
    .map((it) => {
      const code = sanitizeCode39(it.barcode);
      const svg = code ? code39Svg(code, st.barH) : "";
      const qr =
        typeof it.qrSvg === "string" && it.qrSvg.startsWith("<svg")
          ? `<div class="lqr">${it.qrSvg}</div>`
          : "";
      return `<div class="label"><div class="lname" style="font-size:${st.namePx}px">${escapeHtml(it.name)}</div><div class="lprice" style="font-size:${st.pricePx}px">${fmtDzd(it.priceMinor)}</div>${svg}${qr}<div class="lcode">${escapeHtml(code || it.barcode)}</div></div>`;
    })
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Étiquettes code-barres</title>
<style>@page{size:${st.page};margin:5mm}body{font-family:Arial,sans-serif;background:#fff;color:#000}
.sheet{display:grid;grid-template-columns:repeat(${st.cols},1fr);gap:6px}
.label{border:1px solid #000;border-radius:4px;padding:6px 8px;text-align:center;overflow:hidden;page-break-inside:avoid;background:#fff;color:#000}
.label img{filter:grayscale(1) contrast(1.15)}
.lname{font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#000}
.lprice{font-weight:bold;margin:2px 0;color:#000}
.label svg{max-width:100%;height:auto}
.lqr svg{width:64px;height:64px}
.lcode{font-family:monospace;font-size:10px;color:#000}</style>
</head><body><div class="sheet">${cells}</div></body></html>`;
}
