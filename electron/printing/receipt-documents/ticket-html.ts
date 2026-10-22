// Veloria PoS — Documents purs : ticket de vente HTML (design ADR-134).
// Source unique du papier, du PDF et de l'aperçu : en-tête enseigne, table
// Qté / Article / P.U / Montant, encadré de soldes, code-barres + QR.
// N&B strict, 58/80 mm, aucun script, toutes les entrées échappées.

import { formatMinorDa, formatQtyFr } from "./amounts";
import { identityThermalLines } from "./chrome";
import type { ReceiptData, ReceiptLine, ThermalWidth } from "./common";
import { escapeHtml } from "./html";
import { thermalLogo } from "./thermal";
import {
  ticketCodesHtml,
  ticketLegalHtml,
  ticketSignsHtml,
  ticketThanksHtml,
  ticketTotalsHtml,
  type TicketCodes,
  type TicketMetrics,
} from "./ticket-blocks";

export type { TicketCodes } from "./ticket-blocks";

/** Montant de tableau : compact, sans « DA », sans milliers, sans « ,00 ». */
function cellMoney(minor: number): string {
  const raw = formatMinorDa(minor)
    .replace(/ DA$/, "")
    .replace(/[\s\u00a0\u202f]/g, "");
  return raw.endsWith(",00") ? raw.slice(0, -3) : raw;
}

function fontOf(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(14, Math.max(9, Math.round(value)))
    : fallback;
}

/** Métriques du papier : largeur utile + échelle typographique du modèle. */
function metricsOf(width?: ThermalWidth, fontPx?: number): TicketMetrics {
  const narrow = width === "58mm";
  const base = fontOf(fontPx, narrow ? 11 : 12);
  return {
    widthPx: narrow ? 200 : 280,
    base,
    small: Math.max(8, base - 2),
    tiny: Math.max(7, base - 3),
    brand: Math.min(28, Math.max(16, Math.round(base * 1.9))),
    table: Math.max(8, base - 2),
    box: Math.max(8, base - 1),
    qr: narrow ? 48 : 60,
    maxCodes: (narrow ? 200 : 280) - 4,
  };
}

function headerHtml(d: ReceiptData, m: TicketMetrics): string {
  const logo = thermalLogo(d.companyLogo, d.logoSize, m.widthPx);
  const city = d.companyCity !== "" ? `<div class="t-city">${escapeHtml(d.companyCity)}</div>` : "";
  const contact = [
    d.companyAddress,
    d.companyPhone !== "" ? `Tél : ${d.companyPhone}` : "",
    d.companyEmail,
  ]
    .filter((v) => v.trim() !== "")
    .join(" · ");
  const ident = identityThermalLines(d).join(" · ");
  return (
    logo +
    `<div class="t-brand">${escapeHtml(d.company)}</div>` +
    city +
    (contact !== "" ? `<div class="t-meta">${escapeHtml(contact)}</div>` : "") +
    (ident !== "" ? `<div class="t-ident">${escapeHtml(ident)}</div>` : "")
  );
}

/** Ligne client du reçu : nom + téléphone / adresse sur la même ligne. */
function clientHtml(d: ReceiptData): string {
  const name = d.customerName.trim();
  const extra = [d.customerPhone.trim(), d.customerAddress.trim()]
    .filter((v) => v !== "")
    .join(" | ");
  if (name === "" && extra === "") return "";
  const head =
    name !== ""
      ? `<span class="t-label">Client :</span> <b>${escapeHtml(name)}</b>`
      : `<span class="t-label">Client :</span> Comptant`;
  return `<div class="t-client">${head}${extra !== "" ? ` <span class="t-pipe">|</span> ${escapeHtml(extra)}` : ""}</div>`;
}

function itemRow(line: ReceiptLine): string {
  const billed = typeof line.billedTotalMinor === "number";
  // ADR-131/132 : au poids / montant saisi, la multiplication qté × P.U est
  // arithmétiquement fausse — P.U « — » + mention explicite, jamais un calcul.
  const notes: string[] = [];
  if (billed) notes.push("Montant saisi");
  if (typeof line.ref === "string" && line.ref !== "" && line.ref !== "—")
    notes.push(`Réf. ${line.ref}`);
  const sub =
    notes.length > 0
      ? `<div class="t-ref">${notes.map((n) => escapeHtml(n)).join(" · ")}</div>`
      : "";
  const unit =
    line.unit !== "" && line.unit.toUpperCase() !== "PIECE"
      ? `<div class="t-unit">${escapeHtml(line.unit.toLowerCase())}</div>`
      : "";
  const pu = billed ? "—" : cellMoney(line.unitPriceMinor);
  return (
    `<tr>` +
    `<td class="t-num"><div class="t-qty">${escapeHtml(formatQtyFr(line.qty))}</div>${unit}</td>` +
    `<td class="t-art">${escapeHtml(line.name)}${sub}</td>` +
    `<td class="t-num">${pu}</td>` +
    `<td class="t-num">${cellMoney(line.lineTotalMinor)}</td>` +
    `</tr>`
  );
}

function itemsHtml(d: ReceiptData, m: TicketMetrics): string {
  const narrow = m.widthPx === 200;
  const widths = narrow ? [12, 42, 21, 25] : [10, 50, 18, 22];
  const cols = widths.map((w) => `<col style="width:${w}%">`).join("");
  const rows = d.lines.map((line) => itemRow(line)).join("");
  return (
    `<table class="t-table"><colgroup>${cols}</colgroup>` +
    `<thead><tr><th class="t-num">Qté</th><th class="t-art">Article</th>` +
    `<th class="t-num">P.U</th><th class="t-num">Montant</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`
  );
}

function stylesOf(m: TicketMetrics): string {
  return (
    `@page{margin:0}` +
    `html,body{margin:0;padding:0;background:#fff;color:#000}` +
    `*{box-sizing:border-box}` +
    `#veloria-ticket{width:${m.widthPx}px;margin:0 auto;padding:0 0 2mm;background:#fff;color:#000;` +
    `font-family:"Courier New","Liberation Mono",monospace;font-size:${m.base}px;line-height:1.25;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `.t-brand{text-align:center;font-size:${m.brand}px;font-weight:700;line-height:1.05;` +
    `letter-spacing:.4px;overflow-wrap:anywhere}` +
    `.t-city{text-align:center;font-size:${m.base}px;font-style:italic;margin-top:1px}` +
    `.t-meta{text-align:center;font-size:${m.small}px;margin-top:2px;overflow-wrap:anywhere}` +
    `.t-ident{text-align:center;font-size:${m.tiny}px;margin-top:1px;overflow-wrap:anywhere}` +
    `.t-note{text-align:center;font-weight:700;font-size:${m.base}px;margin-top:3px}` +
    `.t-wm{text-align:center;font-weight:700;font-size:${m.small}px;letter-spacing:1px;` +
    `border-top:1px solid #000;border-bottom:1px solid #000;margin:0 0 4px;padding:2px 0}` +
    `.t-date{text-align:center;font-size:${m.base}px;margin-top:6px}` +
    `.t-client{margin-top:4px;overflow-wrap:anywhere}` +
    `.t-label{font-style:italic}` +
    `.t-pipe{font-weight:700}` +
    `.t-seller{font-size:${m.small}px;margin-top:2px}` +
    `.t-table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:5px;font-size:${m.table}px}` +
    `.t-table thead tr{border-top:1px solid #000;border-bottom:1px solid #000}` +
    `.t-table th{font-weight:700;padding:2px;vertical-align:bottom;white-space:nowrap}` +
    `.t-table td{padding:3px 2px 2px;border-bottom:1px dashed #000;vertical-align:top;` +
    `overflow-wrap:anywhere;word-break:break-word}` +
    `.t-table td.t-num{white-space:nowrap}` +
    `.t-table th.t-art,.t-table td.t-art{text-align:left;padding-left:5px;padding-right:2px}` +
    `.t-num{text-align:right}` +
    `.t-qty{font-size:${Math.max(8, m.table - 1)}px}` +
    `.t-unit,.t-ref{font-size:${m.tiny}px}` +
    `.t-finebox{font-size:${m.small}px;margin-top:5px}` +
    `.t-fine{display:flex;justify-content:space-between;gap:6px}` +
    `.t-fine span:last-child{white-space:nowrap}` +
    `.t-bottom{display:flex;align-items:flex-start;justify-content:space-between;gap:4px;` +
    `border-top:1px solid #000;margin-top:5px;padding-top:4px}` +
    `.t-count{flex:0 0 auto;font-size:${m.small}px;white-space:nowrap;padding-top:6px}` +
    `.t-box{flex:1 1 auto;min-width:0;max-width:74%;border:1.4px solid #000;border-radius:9px;padding:2px 5px}` +
    `.t-boxtable{width:100%;border-collapse:collapse;font-size:${m.box}px}` +
    `.t-boxtable td{padding:1px 0;vertical-align:top}` +
    `.t-boxtable td:first-child{padding-right:4px}` +
    `.t-boxtable td.t-num{white-space:nowrap}` +
    `.t-strong td{font-weight:700}` +
    `.t-words{font-size:${m.tiny}px;text-align:center;margin-top:4px;` +
    `overflow-wrap:anywhere}` +
    `.t-meta2{font-size:${m.small}px;text-align:center;margin-top:2px}` +
    `.t-signs{display:flex;gap:8px;margin-top:9px;font-size:${m.small}px;text-align:center}` +
    `.t-signs div{flex:1;border-top:1px dotted #000;padding-top:2px}` +
    `.t-thanks{text-align:center;font-size:${m.base}px;margin-top:8px}` +
    `.t-codes{text-align:center;margin-top:5px}` +
    `.t-barcode svg{display:block;margin:0 auto;height:auto;max-width:100%}` +
    `.t-qr{display:flex;justify-content:center;margin-top:3px}` +
    `.t-qr svg{display:block}` +
    `.t-payload{font-size:${m.tiny}px;overflow-wrap:anywhere;margin-top:2px}` +
    `.t-invoice{font-size:${m.small}px;font-weight:700;margin-top:2px}` +
    `.t-legal{text-align:center;font-size:${m.small}px;margin-top:4px}` +
    `.t-soft{text-align:center;font-size:${m.tiny}px;margin-top:2px}` +
    `.t-58 .t-bottom{display:block}` +
    `.t-58 .t-box{width:100%;max-width:100%;margin-top:4px}` +
    `.t-58 .t-count{padding-top:0}`
  );
}

/**
 * Ticket de vente HTML complet (document autonome, N&B).
 * `fontPx` = taille Studio (9–14 px, repli 11 en 58 mm / 12 en 80 mm).
 */
export function buildReceiptTicketHtml(
  d: ReceiptData,
  width?: ThermalWidth,
  codes: TicketCodes = {},
  fontPx?: number,
): string {
  const m = metricsOf(width, fontPx);
  const narrow = m.widthPx === 200;
  const wm =
    typeof d.watermark === "string" && d.watermark.trim() !== ""
      ? `<div class="t-wm">*** ${escapeHtml(d.watermark.trim().slice(0, 60))} ***</div>`
      : "";
  const note =
    typeof d.headerNote === "string" && d.headerNote.trim() !== ""
      ? `<div class="t-note">${escapeHtml(d.headerNote.trim().slice(0, 200))}</div>`
      : "";
  const seller =
    typeof d.seller === "string" && d.seller.trim() !== ""
      ? `<div class="t-seller">Vendeur : ${escapeHtml(d.seller.trim())}</div>`
      : "";
  const body =
    wm +
    headerHtml(d, m) +
    note +
    `<div class="t-date">${escapeHtml(d.date)}</div>` +
    clientHtml(d) +
    seller +
    itemsHtml(d, m) +
    ticketTotalsHtml(d) +
    ticketSignsHtml(d) +
    ticketThanksHtml(d) +
    ticketCodesHtml(d, codes, m) +
    ticketLegalHtml(d) +
    `<div class="t-soft">Veloria POS</div>`;
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Ticket ${escapeHtml(d.invoice)}</title>` +
    `<style>${stylesOf(m)}</style></head>` +
    `<body><div id="veloria-ticket" class="${narrow ? "t-58" : "t-80"}">${body}</div></body></html>`
  );
}
