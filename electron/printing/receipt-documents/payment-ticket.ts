// Veloria PoS — Documents purs : recu de reglement (pur).

import { escapeHtml } from "./html";
import { paymentMethodLabel, type ThermalWidth } from "./common";
import { amountInWordsFr, formatMinorDa } from "./amounts";
import { thermalCols, thermalField, thermalRow, thermalSep, wrapThermal } from "./thermal";
import {
  barcodeBlock,
  companyHead,
  fmtDzd,
  headerNoteHtml,
  legalFooter,
  pageAtRule,
  safeQrSvg,
  signsHtml,
  watermarkHtml,
  type PageOpts,
} from "./chrome";

// ---------------------------------------------------------------------------
// Reçu de règlement de dette (ticket تسديد الدين) : reçu client/fournisseur/
// pain après encaissement d'un paiement (comptant partiel ou total).
// Pur et déterministe comme les autres builders (zéro import).
// ---------------------------------------------------------------------------

export type PaymentTicketKind = "customer" | "supplier";

export interface PaymentTicketData {
  company: string;
  companyPhone: string;
  companyAddress: string;
  companyCity: string;
  companyEmail: string;
  companyRc: string;
  companyNif: string;
  /** C5 : NIS + article (mentions légales du reçu). */
  companyNis?: string | undefined;
  companyArticle?: string | undefined;
  companyLogo: string;
  /** Libellé partie : « Nom — CL-00125 » / « Fournisseur … » / client pain. */
  partyLabel: string;
  kind: PaymentTicketKind;
  /** Référence du paiement (ex. « PAY-00042 ») ou vide. */
  reference: string;
  date: string;
  amountMinor: number;
  paymentMethod: string;
  prevBalanceMinor: number;
  newBalanceMinor: number;
  notes: string;
  footerText: string;
  thankYouMessage: string;
  qrPayload?: string | undefined;
  qrSvg?: string | undefined;
  /** C6 : options Studio (voir ReceiptData). */
  logoSize?: string | undefined;
  hideSigns?: boolean | undefined;
  qrOff?: boolean | undefined;
  codesOff?: boolean | undefined;
  watermark?: string | undefined;
  headerNote?: string | undefined;
}

export function paymentTicketKindLabel(kind: PaymentTicketKind): string {
  if (kind === "supplier") return "RÈGLEMENT FOURNISSEUR";
  return "REÇU DE RÈGLEMENT";
}

/** Reçu 80mm (thermique) : montants FR, reste avant/après, mode masqué si inconnu. */
export function buildPaymentText(d: PaymentTicketData, width?: ThermalWidth): string {
  const cols = thermalCols(width);
  const sep = thermalSep(cols);
  const fmt = formatMinorDa;
  const out: string[] = [];
  for (const l of wrapThermal(`*** ${d.company} ***`, cols)) out.push(l);
  out.push(paymentTicketKindLabel(d.kind));
  if (d.reference) out.push(...thermalField("Réf", d.reference, cols));
  out.push(...thermalField("Date", d.date, cols));
  if (d.partyLabel) out.push(...thermalField("Partie", d.partyLabel, cols));
  out.push(sep);
  for (const row of thermalRow("Montant réglé", fmt(d.amountMinor), cols)) out.push(row);
  for (const row of thermalRow("Reste avant", fmt(d.prevBalanceMinor), cols)) out.push(row);
  for (const row of thermalRow("Reste après", fmt(d.newBalanceMinor), cols)) out.push(row);
  const method = paymentMethodLabel(d.paymentMethod);
  if (method) out.push(...thermalField("Mode", method.toUpperCase(), cols));
  if (d.notes) out.push(...thermalField("Note", d.notes, cols));
  for (const row of thermalField("En lettres", amountInWordsFr(d.amountMinor), cols)) out.push(row);
  const pqr =
    d.qrOff === true
      ? ""
      : d.qrPayload || `VELORIA|${d.reference || ""}|${d.amountMinor}|${d.date}`;
  if (pqr) out.push(...thermalField("QR", pqr, cols));
  out.push(sep);
  if (d.thankYouMessage) {
    for (const l of wrapThermal(d.thankYouMessage, cols)) out.push(l);
  } else {
    out.push(`Merci pour votre règlement`);
    out.push(`À bientôt !`);
  }
  out.push(sep);
  out.push(`Veloria POS`);
  return out.join("\n");
}

/** Reçu de règlement : charge validée → données typées (jamais de throw). */
export function toPaymentTicketData(raw: unknown): PaymentTicketData {
  const p: Record<string, unknown> =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const int = (v: unknown): number =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0;
  const kind: PaymentTicketKind = p["kind"] === "supplier" ? "supplier" : "customer";
  return {
    company: str(p["company"]) || "Veloria",
    companyPhone: str(p["companyPhone"]),
    companyAddress: str(p["companyAddress"]),
    companyCity: str(p["companyCity"]),
    companyEmail: str(p["companyEmail"]),
    companyRc: str(p["companyRc"]),
    companyNif: str(p["companyNif"]),
    companyNis: str(p["companyNis"]),
    companyArticle: str(p["companyArticle"]),
    companyLogo: str(p["companyLogo"]),
    partyLabel: str(p["partyLabel"]),
    kind,
    reference: str(p["reference"]),
    date: str(p["date"]) || new Date().toLocaleString("fr-FR"),
    amountMinor: int(p["amountMinor"]),
    paymentMethod: str(p["paymentMethod"]),
    prevBalanceMinor: int(p["prevBalanceMinor"]),
    newBalanceMinor: int(p["newBalanceMinor"]),
    notes: str(p["notes"]),
    footerText: str(p["footerText"]),
    thankYouMessage: str(p["thankYouMessage"]),
  };
}

/** Reçu A4 (maquette : cartouche, partie, tableau du règlement, soldes, signatures). */
export function buildPaymentTicketA4Html(d: PaymentTicketData, page?: PageOpts): string {
  const title = paymentTicketKindLabel(d.kind);
  const method = paymentMethodLabel(d.paymentMethod);
  const showCodes = d.codesOff !== true;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${escapeHtml(title)}${d.reference ? ` ${escapeHtml(d.reference)}` : ""}</title>
<style>${pageAtRule(page)}body{font-family:Arial,sans-serif;background:#fff;color:#000;font-size:13px}
h1{font-size:22px;margin:0;color:#000}.brand{display:flex;gap:12px;align-items:flex-start}
.brand img{filter:grayscale(1) contrast(1.15)}
.brand img{filter:grayscale(1) contrast(1.15)}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.docbox{border:2px solid #000;padding:10px 14px;min-width:220px}
.docbox h1{font-size:20px;text-align:center;margin-bottom:6px}
.muted{color:#000;font-size:12px}.lbl{color:#000}
.client{border:1px solid #000;padding:10px 12px;margin:16px 0;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}
.client h2{grid-column:1/-1;font-size:13px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em}
table.items{width:100%;border-collapse:collapse}
.items th,.items td{border:1px solid #000;padding:6px 8px;text-align:left}
.items th{background:#fff}.num{text-align:right;white-space:nowrap}
.totals{margin-left:auto;width:300px;border-collapse:collapse}
.totals td{border:1px solid #000;padding:6px 8px}
.totals .nb{border:none}.grand{font-weight:bold;font-size:15px}
.qr{text-align:center;margin-top:8px}.qr svg{width:110px;height:110px}.qrpayload{font-family:monospace;font-size:9px;word-break:break-all;color:#000}
.signs{display:flex;gap:24px;margin-top:28px}
.signs div{flex:1;border:1px solid #000;min-height:90px;padding:8px;font-size:12px;color:#000}
.pagefoot{margin-top:24px;border-top:1px solid #000;padding-top:8px;font-size:11px;color:#000;text-align:center}</style>
</head><body>
${watermarkHtml(d.watermark ?? "")}
${companyHead(
  d,
  title,
  `<div>${d.reference ? `Réf : ${escapeHtml(d.reference)}` : "Sans référence"}</div><div>Date : ${escapeHtml(d.date)}</div>`,
  d.logoSize,
)}
${headerNoteHtml(d.headerNote ?? "")}
<div class="client"><h2>Partie</h2><div><span class="lbl">Nom :</span> ${escapeHtml(d.partyLabel || "—")}</div>${method ? `<div><span class="lbl">Mode :</span> ${escapeHtml(method)}</div>` : ""}</div>
${showCodes ? barcodeBlock(d.reference) : ""}${d.qrOff === true ? "" : safeQrSvg(d.qrSvg) ? `<div class="qr">${safeQrSvg(d.qrSvg)}<div class="qrpayload">${escapeHtml(d.qrPayload || d.reference)}</div></div>` : d.qrPayload ? `<div class="qrpayload">${escapeHtml(d.qrPayload)}</div>` : ""}
<table class="items"><thead><tr><th>Désignation</th><th class="num">Montant</th></tr></thead>
<tbody><tr><td>Règlement${d.notes ? ` — ${escapeHtml(d.notes)}` : ""}</td><td class="num">${fmtDzd(d.amountMinor)}</td></tr></tbody></table>
<table class="totals"><tbody>
<tr><td>Reste avant</td><td class="num">${fmtDzd(d.prevBalanceMinor)}</td></tr>
<tr><td>Montant réglé</td><td class="num">${fmtDzd(d.amountMinor)}</td></tr>
<tr class="grand"><td>Reste après</td><td class="num">${fmtDzd(d.newBalanceMinor)}</td></tr>
</tbody></table>
${signsHtml("Signature client", "Signature / Cachet", d.hideSigns)}
${legalFooter({ ...d, footerText: d.footerText })}
</body></html>`;
}
