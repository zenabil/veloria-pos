// Veloria PoS — Documents purs : facture A4 (pur).

import { escapeHtml } from "./html";
import { paymentMethodLabel, type ReceiptData } from "./common";
import { amountInWordsFr, tvaBreakdown } from "./amounts";
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

/** Facture A4 (maquette : en-tête, client, lignes avec Réf., totaux TTC, lettres, signatures). */
export function buildA4Html(d: ReceiptData, page?: PageOpts): string {
  const rows = d.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.ref ?? "—")}</td><td>${escapeHtml(l.name)}</td>` +
        `<td class="num">${l.qty}</td><td class="num">${fmtDzd(l.unitPriceMinor)}</td>` +
        `<td class="num">${fmtDzd(l.lineTotalMinor)}</td></tr>`,
    )
    .join("");
  // C5 : reste documentaire sur le net à payer (TTC + timbre espèces).
  const docStamp = typeof d.stampMinor === "number" && d.stampMinor > 0 ? d.stampMinor : 0;
  const remaining = d.totalMinor + docStamp - d.paidMinor;
  const method = paymentMethodLabel(d.paymentMethod);
  const clientRows = [
    `<div><span class="lbl">Nom :</span> ${escapeHtml(d.customerName || "—")}</div>`,
    d.customerPhone
      ? `<div><span class="lbl">Téléphone :</span> ${escapeHtml(d.customerPhone)}</div>`
      : "",
    d.customerAddress
      ? `<div><span class="lbl">Adresse :</span> ${escapeHtml(d.customerAddress)}</div>`
      : "",
    d.customerCode
      ? `<div><span class="lbl">Code client :</span> ${escapeHtml(d.customerCode)}</div>`
      : "",
  ].join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Facture ${escapeHtml(d.invoice)}</title>
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
.items th,.items td{border:1px solid #000;padding:6px 8px;text-align:left;color:#000}
.items th{background:#fff}.num{text-align:right;white-space:nowrap}
.totals{margin-left:auto;width:300px;border-collapse:collapse}
.totals td{border:1px solid #000;padding:6px 8px;color:#000}
.totals .nb{border:none}.grand{font-weight:bold;font-size:15px}
.barcode{margin-top:8px;text-align:center}.barcode svg{max-width:230px;height:auto}
.codes{display:flex;gap:16px;justify-content:center;align-items:flex-start;margin-top:8px}
.qr{text-align:center}.qr svg{width:110px;height:110px}.qrpayload{font-family:monospace;font-size:9px;word-break:break-all;color:#000}
.words{margin:12px 0}.signs{display:flex;gap:24px;margin-top:28px}
.signs div{flex:1;border:1px solid #000;min-height:90px;padding:8px;font-size:12px;color:#000}
.foot{margin-top:24px;text-align:center;color:#000}.pagefoot{margin-top:24px;border-top:1px solid #000;padding-top:8px;font-size:11px;color:#000;text-align:center}</style>
</head><body>
${watermarkHtml(d.watermark ?? "")}
${companyHead(d, "FACTURE", `<div>N° : ${escapeHtml(d.invoice)}</div><div>Date : ${escapeHtml(d.date)}</div>${d.seller ? `<div>Vendeur : ${escapeHtml(d.seller)}</div>` : ""}${d.dueDate ? `<div>Échéance : ${escapeHtml(d.dueDate)}</div>` : ""}${d.codesOff === true ? "" : codeBlocks(d.invoice, d.qrSvg ?? "", docQrPayload(d))}`, d.logoSize)}
${headerNoteHtml(d.headerNote ?? "")}
<div class="client"><h2>Client</h2>${clientRows}</div>
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
<tr class="grand"><td>TOTAL TTC</td><td class="num">${fmtDzd(d.totalMinor)}</td></tr>
${(() => {
  const stamp = typeof d.stampMinor === "number" && d.stampMinor > 0 ? d.stampMinor : 0;
  if (stamp <= 0) return "";
  const net = d.totalMinor + stamp;
  return `<tr><td>Timbre fiscal (espèces, LF 2025)</td><td class="num">${fmtDzd(stamp)}</td></tr><tr class="grand"><td>NET À PAYER</td><td class="num">${fmtDzd(net)}</td></tr>`;
})()}
<tr><td>Payé</td><td class="num">${fmtDzd(d.paidMinor)}</td></tr>
<tr class="grand"><td>RESTE</td><td class="num">${fmtDzd(remaining)}</td></tr>
</tbody></table>
<div class="words">Montant en lettres : ${escapeHtml(amountInWordsFr(d.totalMinor + (typeof d.stampMinor === "number" && d.stampMinor > 0 ? d.stampMinor : 0)))}</div>
${method ? `<div>Mode de paiement : ${escapeHtml(method)}</div>` : ""}
${d.notes ? `<div class="sect">Notes :</div><div>${escapeHtml(d.notes)}</div>` : ""}
<div class="foot">${escapeHtml(d.thankYouMessage || "Merci pour votre confiance")}</div>
${signsHtml("Signature client", "Signature / Cachet", d.hideSigns)}
${legalFooter(d)}
</body></html>`;
}
