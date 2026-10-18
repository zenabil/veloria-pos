// Veloria PoS — Documents purs : habillage A4 commun (pur, zero import hors common/amounts).

import { code39Svg } from "./barcode39";
import { escapeHtml } from "./html";
import { buildQrPayload, formatMinorDa } from "./amounts";

/** Bloc QR pour HTML (SVG réel injecté côté main + payload texte). */
export function safeQrSvg(qrSvg: unknown): string {
  const svg = typeof qrSvg === "string" ? qrSvg.trim() : "";
  // M2 RADICAL : seul un SVG réel généré main est injecté ; tout autre
  // contenu (template, preview, entrée future) est neutralisé en vide.
  return svg.startsWith("<svg") ? svg : "";
}

function qrBlockSvg(qrSvg: string, qrPayload: string): string {
  const svg = safeQrSvg(qrSvg);
  const payload = typeof qrPayload === "string" ? qrPayload : "";
  if (!svg && !payload) return "";
  return `<div class="qr">${svg}<div class="qrpayload">${escapeHtml(payload)}</div></div>`;
}

/**
 * C5 : identités fiscales entreprise (RC · NIF · NIS · Art) — une ligne
 * enroulée, segments jamais coupés au milieu (enrobage par mots).
 */
export function identityThermalLines(d: {
  companyRc: string;
  companyNif: string;
  companyNis?: string | undefined;
  companyArticle?: string | undefined;
}): string[] {
  const segs = [
    d.companyRc ? `RC : ${d.companyRc}` : "",
    d.companyNif ? `NIF : ${d.companyNif}` : "",
    d.companyNis ? `NIS : ${d.companyNis}` : "",
    d.companyArticle ? `Art : ${d.companyArticle}` : "",
  ].filter(Boolean);
  if (segs.length === 0) return [];
  return [segs.join(" · ")];
}

export function fmtDzd(m: number): string {
  return formatMinorDa(m);
}

interface CompanyHead {
  company: string;
  companyPhone: string;
  companyAddress: string;
  companyCity: string;
  companyEmail: string;
  companyLogo?: string | undefined;
}

/** C6 : taille logo Studio (S = 48, M = 64, L = 96 px). */
export function logoMaxHeight(size?: string): number {
  if (size === "S") return 48;
  if (size === "L") return 96;
  return 64;
}

export function companyHead(
  d: CompanyHead,
  title: string,
  metaRows: string,
  logoSize?: string,
): string {
  const maxH = logoMaxHeight(logoSize);
  const logo =
    d.companyLogo != null && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(d.companyLogo)
      ? `<img src="${escapeHtml(d.companyLogo)}" alt="Logo" style="max-height:${maxH}px;max-width:160px;object-fit:contain;filter:grayscale(1) contrast(1.15)" />`
      : "";
  const lines = [d.companyAddress, d.companyCity].filter(Boolean).join(" – ");
  return `<div class="head"><div class="brand">${logo}<div><h1>${escapeHtml(d.company)}</h1>
<div class="muted">${escapeHtml(lines)}</div>
${d.companyPhone ? `<div class="muted">Tél: ${escapeHtml(d.companyPhone)}</div>` : ""}
${d.companyEmail ? `<div class="muted">Email: ${escapeHtml(d.companyEmail)}</div>` : ""}
</div></div>
<div class="docbox"><h1>${title}</h1>${metaRows}</div></div>`;
}

/** Bloc barcode pour cartouche (vide si rien d'encodable). */
export function barcodeBlock(value: string): string {
  const svg = code39Svg(value);
  return svg ? `<div class="barcode">${svg}</div>` : "";
}

/** C6 : filigrane A4 (styles inline, N&B, jamais de couleur). */
export function watermarkHtml(text: string): string {
  const t = typeof text === "string" ? text.trim().slice(0, 60) : "";
  if (!t) return "";
  return `<div style="position:fixed;top:42%;left:0;right:0;text-align:center;font-size:72px;font-weight:bold;color:#000;opacity:0.07;transform:rotate(-30deg);pointer-events:none;">${escapeHtml(t)}</div>`;
}

/** C6 : note d'en-tête Studio (sous le cartouche, centrée). */
export function headerNoteHtml(text: string): string {
  const t = typeof text === "string" ? text.trim().slice(0, 200) : "";
  if (!t) return "";
  return `<div style="text-align:center;font-weight:bold;margin:8px 0;color:#000;">${escapeHtml(t)}</div>`;
}

/** C6 : signatures masquables (modèle sans signatures). */
export function signsHtml(left: string, right: string, hide?: boolean): string {
  if (hide === true) return "";
  return `<div class="signs"><div>${left}</div><div>${right}</div></div>`;
}

/** C6 : papier Studio — règle @page explicite (jamais de remplacement de chaîne). */
export interface PageOpts {
  page?: string | undefined;
  marginMm?: number | undefined;
}

export function pageAtRule(opts?: PageOpts): string {
  const page = opts?.page === "A5" ? "A5" : "A4";
  const margin =
    typeof opts?.marginMm === "number" && Number.isFinite(opts.marginMm)
      ? Math.min(25, Math.max(5, Math.round(opts.marginMm)))
      : 15;
  return `@page{size:${page};margin:${margin}mm}`;
}

/** C6 : QR documentaire avec interrupteur Studio (vide = aucun bloc QR). */
export function docQrPayload(d: {
  qrPayload?: string | undefined;
  qrOff?: boolean | undefined;
  invoice: string;
  totalMinor: number;
  date: string;
  companyRc: string;
  companyNif: string;
  companyNis?: string | undefined;
  seller?: string | undefined;
}): string {
  if (d.qrOff === true) return "";
  return d.qrPayload || buildQrPayload(d);
}

/** Bloc QR + barcode combiné (N&B strict, logo exclu). */
export function codeBlocks(invoice: string, qrSvg: string, qrPayload: string): string {
  const bar = barcodeBlock(invoice);
  const qr = qrBlockSvg(qrSvg, qrPayload || invoice);
  if (!bar && !qr) return "";
  return `<div class="codes">${bar}${qr}</div>`;
}

export function legalFooter(d: {
  company: string;
  companyAddress: string;
  companyPhone: string;
  companyRc: string;
  companyNif: string;
  companyNis?: string | undefined;
  companyArticle?: string | undefined;
  footerText: string;
}): string {
  const legal = [
    d.companyRc ? `RC : ${d.companyRc}` : "",
    d.companyNif ? `NIF : ${d.companyNif}` : "",
    d.companyNis ? `NIS : ${d.companyNis}` : "",
    d.companyArticle ? `Art : ${d.companyArticle}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const contact = [d.company, d.companyAddress, d.companyPhone].filter(Boolean).join(" • ");
  const custom = d.footerText ? `<br>${escapeHtml(d.footerText)}` : "";
  return `<div class="pagefoot">${escapeHtml(contact)}${legal ? `<br>${escapeHtml(legal)}` : ""}${custom}<br>Page 1 / 1</div>`;
}
