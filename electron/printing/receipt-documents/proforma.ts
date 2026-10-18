// Veloria PoS — Documents purs : devis / proforma (pur).

import { escapeHtml } from "./html";
import type { ReceiptData, ReceiptLine } from "./common";
import { amountInWordsFr, buildQrPayload, tvaBreakdown } from "./amounts";
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
// Devis / proforma : document SANS valeur fiscale (jamais intitulé « Facture »).
// Même charge utile validée que le ticket (printPayloadSchema), où `invoice`
// transporte le numéro proforma (PRO-AAAA-00001).
// ---------------------------------------------------------------------------

export interface ProformaData {
  company: string;
  companyPhone: string;
  companyAddress: string;
  companyCity: string;
  companyEmail: string;
  companyRc: string;
  companyNif: string;
  /** C5 : NIS + article (mentions légales du devis). */
  companyNis?: string | undefined;
  companyArticle?: string | undefined;
  footerText: string;
  /** Logo en data URL (injecté côté main), absent = aucun bloc logo. */
  companyLogo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  seller?: string | undefined;
  tvaRatePercent?: number | undefined;
  htMinor?: number | undefined;
  tvaMinor?: number | undefined;
  qrPayload?: string | undefined;
  qrSvg?: string | undefined;
  number: string;
  date: string;
  dueDate: string;
  notes: string;
  lines: ReceiptLine[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  /** C6 : options Studio (voir ReceiptData). */
  logoSize?: string | undefined;
  hideSigns?: boolean | undefined;
  qrOff?: boolean | undefined;
  codesOff?: boolean | undefined;
  hideZeroRows?: boolean | undefined;
  watermark?: string | undefined;
  headerNote?: string | undefined;
}

/** Projection reçu → devis (le logo injecté côté main est conservé). */
export function proformaFromReceipt(d: ReceiptData): ProformaData {
  return {
    company: d.company,
    companyPhone: d.companyPhone,
    companyAddress: d.companyAddress,
    companyCity: d.companyCity,
    companyEmail: d.companyEmail,
    companyRc: d.companyRc,
    companyNif: d.companyNif,
    companyNis: d.companyNis,
    companyArticle: d.companyArticle,
    footerText: d.footerText,
    companyLogo: d.companyLogo,
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    customerAddress: d.customerAddress,
    seller: d.seller,
    tvaRatePercent: d.tvaRatePercent,
    htMinor: d.htMinor,
    tvaMinor: d.tvaMinor,
    qrPayload: d.qrPayload || buildQrPayload({ ...d, invoice: d.invoice }),
    qrSvg: d.qrSvg,
    number: d.invoice,
    date: d.date,
    dueDate: d.dueDate,
    notes: d.notes,
    lines: d.lines,
    subtotalMinor: d.subtotalMinor,
    discountMinor: d.discountMinor,
    totalMinor: d.totalMinor,
    logoSize: d.logoSize,
    hideSigns: d.hideSigns,
    qrOff: d.qrOff,
    codesOff: d.codesOff,
    hideZeroRows: d.hideZeroRows,
    watermark: d.watermark,
    headerNote: d.headerNote,
  };
}

/** Devis A4 (maquette : destinataire, validité, conditions, non comptabilisé). */
export function buildProformaA4Html(d: ProformaData, page?: PageOpts): string {
  const rows = d.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.ref ?? "—")}</td><td>${escapeHtml(l.name)}</td>` +
        `<td class="num">${l.qty}</td><td class="num">${fmtDzd(l.unitPriceMinor)}</td>` +
        `<td class="num">${fmtDzd(l.lineTotalMinor)}</td></tr>`,
    )
    .join("");
  const destRows = [
    `<div><span class="lbl">Nom :</span> ${escapeHtml(d.customerName || "—")}</div>`,
    d.customerPhone
      ? `<div><span class="lbl">Téléphone :</span> ${escapeHtml(d.customerPhone)}</div>`
      : "",
    d.customerAddress
      ? `<div><span class="lbl">Adresse :</span> ${escapeHtml(d.customerAddress)}</div>`
      : "",
  ].join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Devis ${escapeHtml(d.number)}</title>
<style>${pageAtRule(page)}body{font-family:Arial,sans-serif;background:#fff;color:#000;font-size:13px}
h1{font-size:22px;margin:0;color:#000}.brand{display:flex;gap:12px;align-items:flex-start}
.brand img{filter:grayscale(1) contrast(1.15)}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.docbox{border:2px solid #000;padding:10px 14px;min-width:220px}
.docbox h1{font-size:20px;text-align:center;margin-bottom:6px}
.muted{color:#000;font-size:12px}.lbl{color:#000}
.client{border:1px solid #000;padding:10px 12px;margin:16px 0;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}
.client h2,.sect{grid-column:1/-1;font-size:13px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em}
table.items{width:100%;border-collapse:collapse}
.items th,.items td{border:1px solid #000;padding:6px 8px;text-align:left}
.items th{background:#fff}.num{text-align:right;white-space:nowrap}
.totals{margin-left:auto;width:300px;border-collapse:collapse}
.totals td{border:1px solid #000;padding:6px 8px}
.grand{font-weight:bold;font-size:15px}
.barcode{margin-top:8px;text-align:center}.barcode svg{max-width:230px;height:auto}
.codes{display:flex;gap:16px;justify-content:center;align-items:flex-start;margin-top:8px}
.qr{text-align:center}.qr svg{width:110px;height:110px}.qrpayload{font-family:monospace;font-size:9px;word-break:break-all;color:#000}
.stamp{display:inline-block;margin-top:16px;padding:6px 14px;border:2px solid #000;font-weight:bold;color:#000}
.signs{display:flex;gap:24px;margin-top:28px}
.signs div{flex:1;border:1px solid #000;min-height:90px;padding:8px;font-size:12px;color:#000}
.foot{margin-top:24px}</style>
</head><body>
${watermarkHtml(d.watermark ?? "")}
${companyHead(
  d,
  "PROFORMA / DEVIS",
  `<div>N° : ${escapeHtml(d.number)}</div><div>Date : ${escapeHtml(d.date)}</div><div>Validité : ${escapeHtml(d.dueDate || "30 jours")}</div>${d.seller ? `<div>Vendeur : ${escapeHtml(d.seller)}</div>` : ""}${d.codesOff === true ? "" : codeBlocks(d.number, d.qrSvg ?? "", docQrPayload({ ...d, invoice: d.number }))}`,
  d.logoSize,
)}
${headerNoteHtml(d.headerNote ?? "")}
<div class="client"><h2>Destinataire</h2>${destRows}</div>
<table class="items"><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>Prix U.</th><th>Total</th></tr></thead>
<tbody>${rows}</tbody></table>
<table class="totals"><tbody>
<tr><td>Sous-total</td><td class="num">${fmtDzd(d.subtotalMinor)}</td></tr>
${d.discountMinor > 0 || d.hideZeroRows !== true ? `<tr><td>Remise</td><td class="num">${fmtDzd(d.discountMinor)}</td></tr>` : ""}
${(() => {
  const rate = typeof d.tvaRatePercent === "number" ? d.tvaRatePercent : 0;
  if (!(rate > 0)) return "";
  const ht0 = typeof d.htMinor === "number" ? d.htMinor : 0;
  const tv0 = typeof d.tvaMinor === "number" ? d.tvaMinor : 0;
  const v = ht0 > 0 || tv0 > 0 ? { htMinor: ht0, tvaMinor: tv0 } : tvaBreakdown(d.totalMinor, rate);
  return `<tr><td>Total HT</td><td class="num">${fmtDzd(v.htMinor)}</td></tr><tr><td>TVA (${rate} %)</td><td class="num">${fmtDzd(v.tvaMinor)}</td></tr>`;
})()}
<tr class="grand"><td>TOTAL</td><td class="num">${fmtDzd(d.totalMinor)}</td></tr>
</tbody></table>
<div class="words">Montant en lettres : ${escapeHtml(amountInWordsFr(d.totalMinor))}</div>
<div class="sect">Conditions :</div><div>${escapeHtml(d.notes || "—")}</div>
<div>Validité du proforma : ${escapeHtml(d.dueDate || "30 jours")}</div>
<div><span class="stamp">Document non comptabilisé</span></div>
${signsHtml("Signature client", "Signature / Cachet", d.hideSigns)}
${legalFooter(d)}
</body></html>`;
}
