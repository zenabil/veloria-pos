// Veloria PoS — Documents purs : livraison / retour / commande (pur).

import { escapeHtml, type ReceiptData, type ThermalWidth } from "./common";
import {
  thermalCols,
  thermalField,
  thermalItem,
  thermalRow,
  thermalSep,
  wrapThermal,
} from "./thermal";
import { tvaBreakdown } from "./amounts";
import {
  codeBlocks,
  companyHead,
  docQrPayload,
  fmtDzd,
  headerNoteHtml,
  legalFooter,
  pageAtRule,
  signsHtml,
  watermarkHtml,
  type PageOpts,
} from "./chrome";

// ---------------------------------------------------------------------------
// P0-3 : documents logistiques — bon de livraison / bon de retour / bon de
// commande. Même hiérarchie N&B + QR + Code39 que la facture, données SQLite.
// ---------------------------------------------------------------------------

export interface LogisticsDocData extends ReceiptData {
  originNumber?: string | undefined;
  deliverer?: string | undefined;
  returnNumber?: string | undefined;
  reason?: string | undefined;
  refundMinor?: number | undefined;
  orderNumber?: string | undefined;
  supplierName?: string | undefined;
  supplierPhone?: string | undefined;
  supplierAddress?: string | undefined;
  validityDays?: number | undefined;
}

const LOGI_CSS_BASE = `body{font-family:Arial,sans-serif;background:#fff;color:#000;font-size:13px}
h1{font-size:22px;margin:0;color:#000}.brand{display:flex;gap:12px;align-items:flex-start}
.brand img{filter:grayscale(1) contrast(1.15)}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.docbox{border:2px solid #000;padding:10px 14px;min-width:220px}
.docbox h1{font-size:20px;text-align:center;margin-bottom:6px}
.muted{color:#000;font-size:12px}.lbl{color:#000}
.client{border:1px solid #000;padding:10px 12px;margin:16px 0;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}
.client h2,.sect{grid-column:1/-1;font-size:13px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em}
table.items{width:100%;border-collapse:collapse}
.items th,.items td{border:1px solid #000;padding:6px 8px;text-align:left;color:#000}
.items th{background:#fff}.num{text-align:right;white-space:nowrap}
.totals{margin-left:auto;width:300px;border-collapse:collapse}
.totals td{border:1px solid #000;padding:6px 8px;color:#000}
.grand{font-weight:bold;font-size:15px}
.barcode,.qr{text-align:center}.barcode svg{max-width:230px;height:auto}.qr svg{width:110px;height:110px}
.codes{display:flex;gap:16px;justify-content:center;align-items:flex-start;margin-top:8px}
.qrpayload{font-family:monospace;font-size:9px;word-break:break-all;color:#000}
.signs{display:flex;gap:24px;margin-top:28px}
.signs div{flex:1;border:1px solid #000;min-height:90px;padding:8px;font-size:12px;color:#000}
.pagefoot{margin-top:24px;border-top:1px solid #000;padding-top:8px;font-size:11px;color:#000;text-align:center}`;

/** C6 : CSS logistique avec papier Studio (jamais de remplacement de chaîne). */
function logiCss(page?: PageOpts): string {
  return `${pageAtRule(page)}${LOGI_CSS_BASE}`;
}

function logiRows(d: LogisticsDocData): string {
  return d.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.ref ?? "—")}</td><td>${escapeHtml(l.name)}</td>` +
        `<td class="num">${l.qty}</td><td class="num">${fmtDzd(l.unitPriceMinor)}</td>` +
        `<td class="num">${fmtDzd(l.lineTotalMinor)}</td></tr>`,
    )
    .join("");
}

function logiMeta(d: LogisticsDocData, extra: string): string {
  const seller = d.seller ? `<div>Vendeur : ${escapeHtml(d.seller)}</div>` : "";
  const qr = docQrPayload(d);
  return `<div>N° : ${escapeHtml(d.invoice)}</div><div>Date : ${escapeHtml(d.date)}</div>${seller}${extra}${d.codesOff === true ? "" : codeBlocks(d.invoice, d.qrSvg ?? "", qr)}`;
}

/** Bon de livraison A4 (vente d'origine + livreur + signatures). */
export function buildDeliveryHtml(d: LogisticsDocData, page?: PageOpts): string {
  const extra = `${d.originNumber ? `<div>Vente d'origine : ${escapeHtml(d.originNumber)}</div>` : ""}${d.deliverer ? `<div>Livreur : ${escapeHtml(d.deliverer)}</div>` : ""}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon de livraison ${escapeHtml(d.invoice)}</title><style>${logiCss(page)}</style></head><body>${watermarkHtml(d.watermark ?? "")}${companyHead(d, "BON DE LIVRAISON", logiMeta(d, extra), d.logoSize)}${headerNoteHtml(d.headerNote ?? "")}<div class="client"><h2>Client</h2><div><span class="lbl">Nom :</span> ${escapeHtml(d.customerName || "—")}</div>${d.customerPhone ? `<div><span class="lbl">Téléphone :</span> ${escapeHtml(d.customerPhone)}</div>` : ""}${d.customerAddress ? `<div><span class="lbl">Adresse :</span> ${escapeHtml(d.customerAddress)}</div>` : ""}</div><table class="items"><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>Prix U.</th><th>Total</th></tr></thead><tbody>${logiRows(d)}</tbody></table><table class="totals"><tbody><tr class="grand"><td>TOTAL</td><td class="num">${fmtDzd(d.totalMinor)}</td></tr></tbody></table>${signsHtml("Signature livreur", "Signature client", d.hideSigns)}${legalFooter(d)}</body></html>`;
}

/** Bon de livraison thermique 58/80mm. */
export function buildDeliveryText(d: LogisticsDocData, width?: ThermalWidth): string {
  const cols = thermalCols(width);
  const sep = thermalSep(cols);
  const fmt = (m: number): string =>
    `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(m / 100)} DA`;
  const out = [...wrapThermal(`*** ${d.company} ***`, cols), `BON DE LIVRAISON`];
  out.push(...thermalField("N°", d.invoice, cols));
  out.push(...thermalField("Date", d.date, cols));
  if (d.originNumber) out.push(...thermalField("Vente", d.originNumber, cols));
  if (d.customerName) out.push(...thermalField("Client", d.customerName, cols));
  out.push(sep);
  out.push(`PRODUIT · QTÉ x P.U. = TOTAL`);
  for (const l of d.lines)
    for (const row of thermalItem(
      `${l.ref && l.ref !== "—" ? `[${l.ref}] ` : ""}${l.name}`,
      `${l.qty} x ${fmt(l.unitPriceMinor)}`,
      fmt(l.lineTotalMinor),
      cols,
    ))
      out.push(row);
  out.push(sep);
  for (const row of thermalRow("TOTAL", fmt(d.totalMinor), cols)) out.push(row);
  const qr = docQrPayload(d);
  if (qr) out.push(...thermalField("QR", qr, cols));
  out.push(`Veloria POS`);
  return out.join("\n");
}

/** Bon de retour A4 (N° retour + cause + remboursement + ventilation TVA). */
export function buildReturnSlipHtml(d: LogisticsDocData, page?: PageOpts): string {
  const extra = `${d.returnNumber ? `<div>N° retour : ${escapeHtml(d.returnNumber)}</div>` : ""}${d.originNumber ? `<div>Vente d'origine : ${escapeHtml(d.originNumber)}</div>` : ""}${d.reason ? `<div>Motif : ${escapeHtml(d.reason)}</div>` : ""}`;
  const refund = typeof d.refundMinor === "number" ? d.refundMinor : 0;
  const tvaRows = (() => {
    const rate = typeof d.tvaRatePercent === "number" ? d.tvaRatePercent : 0;
    if (!(rate > 0)) return "";
    const ht0 = typeof d.htMinor === "number" ? d.htMinor : 0;
    const tv0 = typeof d.tvaMinor === "number" ? d.tvaMinor : 0;
    const v =
      ht0 > 0 || tv0 > 0 ? { htMinor: ht0, tvaMinor: tv0 } : tvaBreakdown(d.totalMinor, rate);
    return `<tr><td>Total HT</td><td class="num">${fmtDzd(v.htMinor)}</td></tr><tr><td>TVA (${rate} %)</td><td class="num">${fmtDzd(v.tvaMinor)}</td></tr>`;
  })();
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon de retour ${escapeHtml(d.returnNumber || d.invoice)}</title><style>${logiCss(page)}</style></head><body>${watermarkHtml(d.watermark ?? "")}${companyHead(d, "BON DE RETOUR", logiMeta(d, extra), d.logoSize)}${headerNoteHtml(d.headerNote ?? "")}<div class="client"><h2>Partie</h2><div><span class="lbl">Nom :</span> ${escapeHtml(d.customerName || d.supplierName || "—")}</div></div><table class="items"><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>Prix U.</th><th>Total</th></tr></thead><tbody>${logiRows(d)}</tbody></table><table class="totals"><tbody><tr><td>Total retourné</td><td class="num">${fmtDzd(d.totalMinor)}</td></tr>${tvaRows}<tr class="grand"><td>Remboursé</td><td class="num">${fmtDzd(refund)}</td></tr></tbody></table>${signsHtml("Signature client", "Signature / Cachet", d.hideSigns)}${legalFooter(d)}</body></html>`;
}

/** Bon de retour thermique. */
export function buildReturnSlipText(d: LogisticsDocData, width?: ThermalWidth): string {
  const cols = thermalCols(width);
  const sep = thermalSep(cols);
  const fmt = (m: number): string =>
    `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(m / 100)} DA`;
  const refund = typeof d.refundMinor === "number" ? d.refundMinor : 0;
  const out = [
    ...wrapThermal(`*** ${d.company} ***`, cols),
    `BON DE RETOUR`,
    ...thermalField("N°", d.returnNumber || d.invoice, cols),
    ...thermalField("Date", d.date, cols),
  ];
  if (d.originNumber) out.push(...thermalField("Vente d'origine", d.originNumber, cols));
  if (d.reason) out.push(...thermalField("Motif", d.reason, cols));
  out.push(sep);
  out.push(`PRODUIT · QTÉ = TOTAL`);
  for (const l of d.lines)
    for (const row of thermalItem(
      `${l.ref && l.ref !== "—" ? `[${l.ref}] ` : ""}${l.name}`,
      `${l.qty}`,
      fmt(l.lineTotalMinor),
      cols,
    ))
      out.push(row);
  out.push(sep);
  for (const row of thermalRow("Total retourné", fmt(d.totalMinor), cols)) out.push(row);
  const rate = typeof d.tvaRatePercent === "number" ? d.tvaRatePercent : 0;
  if (rate > 0) {
    const ht0 = typeof d.htMinor === "number" ? d.htMinor : 0;
    const tv0 = typeof d.tvaMinor === "number" ? d.tvaMinor : 0;
    const v =
      ht0 > 0 || tv0 > 0 ? { htMinor: ht0, tvaMinor: tv0 } : tvaBreakdown(d.totalMinor, rate);
    for (const row of thermalRow("Total HT", fmt(v.htMinor), cols)) out.push(row);
    for (const row of thermalRow(`TVA (${rate} %)`, fmt(v.tvaMinor), cols)) out.push(row);
  }
  for (const row of thermalRow("Remboursé", fmt(refund), cols)) out.push(row);
  const qr = docQrPayload(d);
  if (qr) out.push(...thermalField("QR", qr, cols));
  out.push(`Veloria POS`);
  return out.join("\n");
}

/** Bon de commande fournisseur A4. */
export function buildPurchaseOrderHtml(d: LogisticsDocData, page?: PageOpts): string {
  const extra = `${d.orderNumber ? `<div>N° : ${escapeHtml(d.orderNumber)}</div>` : ""}<div>Date : ${escapeHtml(d.date)}</div><div>Validité : ${typeof d.validityDays === "number" ? d.validityDays : 30} jours</div>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon de commande ${escapeHtml(d.orderNumber || d.invoice)}</title><style>${logiCss(page)}</style></head><body>${watermarkHtml(d.watermark ?? "")}${companyHead(d, "BON DE COMMANDE", `${extra}${d.codesOff === true ? "" : codeBlocks(d.orderNumber || d.invoice, d.qrSvg ?? "", docQrPayload({ ...d, invoice: d.orderNumber || d.invoice }))}`, d.logoSize)}${headerNoteHtml(d.headerNote ?? "")}<div class="client"><h2>Fournisseur</h2><div><span class="lbl">Nom :</span> ${escapeHtml(d.supplierName || d.customerName || "—")}</div>${d.supplierPhone ? `<div><span class="lbl">Téléphone :</span> ${escapeHtml(d.supplierPhone)}</div>` : ""}${d.supplierAddress ? `<div><span class="lbl">Adresse :</span> ${escapeHtml(d.supplierAddress)}</div>` : ""}</div><table class="items"><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>Coût U.</th><th>Total</th></tr></thead><tbody>${logiRows(d)}</tbody></table><table class="totals"><tbody><tr class="grand"><td>TOTAL</td><td class="num">${fmtDzd(d.totalMinor)}</td></tr></tbody></table>${signsHtml("Signature fournisseur", "Signature / Cachet", d.hideSigns)}${legalFooter(d)}</body></html>`;
}

/** Bon de commande thermique. */
export function buildPurchaseOrderText(d: LogisticsDocData, width?: ThermalWidth): string {
  const cols = thermalCols(width);
  const sep = thermalSep(cols);
  const fmt = (m: number): string =>
    `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(m / 100)} DA`;
  const out = [
    ...wrapThermal(`*** ${d.company} ***`, cols),
    `BON DE COMMANDE`,
    ...thermalField("N°", d.orderNumber || d.invoice, cols),
    ...thermalField("Date", d.date, cols),
    ...thermalField("Fournisseur", d.supplierName || d.customerName || "—", cols),
    sep,
    `PRODUIT · QTÉ x COÛT = TOTAL`,
  ];
  for (const l of d.lines)
    for (const row of thermalItem(
      `${l.ref && l.ref !== "—" ? `[${l.ref}] ` : ""}${l.name}`,
      `${l.qty} x ${fmt(l.unitPriceMinor)}`,
      fmt(l.lineTotalMinor),
      cols,
    ))
      out.push(row);
  out.push(sep);
  for (const row of thermalRow("TOTAL", fmt(d.totalMinor), cols)) out.push(row);
  const qr = docQrPayload({ ...d, invoice: d.orderNumber || d.invoice });
  if (qr) out.push(...thermalField("QR", qr, cols));
  out.push(`Veloria POS`);
  return out.join("\n");
}
