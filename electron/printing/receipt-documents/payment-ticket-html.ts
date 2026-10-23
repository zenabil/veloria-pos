// Veloria PoS — Documents purs : reçu de règlement HTML (design ADR-134).
import { escapeHtml } from "./html";
import { amountInWordsFr, formatMinorDa } from "./amounts";
import { headerHtml, metricsOf, stylesOf } from "./ticket-html";
import { ticketCodesHtml, ticketLegalHtml } from "./ticket-blocks";
import type { PaymentTicketData } from "./payment-ticket";
import type { ReceiptData, ThermalWidth } from "./common";
import type { TicketCodes } from "./ticket-html";

export function buildPaymentTicketHtml(
  d: PaymentTicketData,
  width?: ThermalWidth,
  codes: TicketCodes = {},
  fontPx?: number,
): string {
  const m = metricsOf(width, fontPx);
  const narrow = m.widthPx === 200;
  const method = d.paymentMethod ? d.paymentMethod.toUpperCase() : "";
  const rows: string[] = [];
  rows.push(
    `<tr><td>Montant réglé</td><td class="t-num">${escapeHtml(formatMinorDa(d.amountMinor))}</td></tr>`,
  );
  rows.push(
    `<tr><td>Reste avant</td><td class="t-num">${escapeHtml(formatMinorDa(d.prevBalanceMinor))}</td></tr>`,
  );
  rows.push(
    `<tr><td>Reste après</td><td class="t-num">${escapeHtml(formatMinorDa(d.newBalanceMinor))}</td></tr>`,
  );
  if (method) rows.push(`<tr><td>Mode</td><td class="t-num">${escapeHtml(method)}</td></tr>`);
  const bottom =
    `<div class="t-bottom">` +
    `<div class="t-count">Règlement</div>` +
    `<div class="t-box"><table class="t-boxtable"><tbody>${rows.join("")}</tbody></table></div>` +
    `</div>` +
    `<div class="t-words"><b>En lettres :</b> ${escapeHtml(amountInWordsFr(d.amountMinor))}</div>`;
  const notes =
    typeof d.notes === "string" && d.notes.trim() !== ""
      ? `<div class="t-meta2">Note : ${escapeHtml(d.notes.trim())}</div>`
      : "";
  const title = `<div class="t-note">${escapeHtml(d.kind === "supplier" ? "RÈGLEMENT FOURNISSEUR" : "REÇU DE RÈGLEMENT")}</div>`;
  const body =
    headerHtml(
      {
        company: d.company,
        companyPhone: d.companyPhone,
        companyAddress: d.companyAddress,
        companyCity: d.companyCity,
        companyEmail: d.companyEmail,
        companyRc: d.companyRc,
        companyNif: d.companyNif,
        companyNis: d.companyNis,
        companyArticle: d.companyArticle,
        companyLogo: d.companyLogo,
        customerName: d.partyLabel,
        customerPhone: "",
        customerAddress: "",
        customerCode: "",
        paymentMethod: d.paymentMethod,
        dueDate: "",
        notes: d.notes,
        footerText: d.footerText,
        thankYouMessage: d.thankYouMessage,
        invoice: d.reference,
        date: d.date,
        lines: [],
        subtotalMinor: d.amountMinor,
        discountMinor: 0,
        deliveryMinor: 0,
        totalMinor: d.amountMinor,
        paidMinor: d.amountMinor,
        prevBalanceMinor: d.prevBalanceMinor,
        currentBalanceMinor: d.newBalanceMinor,
        logoSize: d.logoSize,
        hideSigns: d.hideSigns,
        qrOff: d.qrOff,
        codesOff: d.codesOff,
        watermark: d.watermark,
        headerNote: d.headerNote,
        footerNote: d.footerNote,
      } as ReceiptData,
      m,
    ) +
    title +
    `<div class="t-date">${escapeHtml(d.date)}</div>` +
    (d.reference ? `<div class="t-meta2">Réf : ${escapeHtml(d.reference)}</div>` : "") +
    bottom +
    notes +
    ticketCodesHtml({ invoice: d.reference } as unknown as ReceiptData, codes, m) +
    ticketLegalHtml({ footerNote: d.footerNote } as unknown as ReceiptData) +
    `<div class="t-thanks">${escapeHtml(d.thankYouMessage.trim() || "Merci pour votre règlement.")}</div>` +
    `<div class="t-soft">Veloria POS</div>`;
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Reçu ${escapeHtml(d.reference)}</title>` +
    `<style>${stylesOf(m)}</style></head>` +
    `<body><div id="veloria-ticket" class="${narrow ? "t-58" : "t-80"}">${body}</div></body></html>`
  );
}
