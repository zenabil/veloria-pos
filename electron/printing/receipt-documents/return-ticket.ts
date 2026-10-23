// Veloria PoS — Documents purs : bon de retour HTML (design ADR-134).
import { escapeHtml } from "./html";
import { formatMinorDa, tvaBreakdown } from "./amounts";
import { headerHtml, clientHtml, itemsHtml, metricsOf, stylesOf } from "./ticket-html";
import { ticketCodesHtml, ticketLegalHtml } from "./ticket-blocks";
import type { LogisticsDocData } from "./logistics";
import type { ThermalWidth } from "./common";
import type { TicketCodes } from "./ticket-html";

export function buildReturnSlipTicketHtml(
  d: LogisticsDocData,
  width?: ThermalWidth,
  codes: TicketCodes = {},
  fontPx?: number,
): string {
  const m = metricsOf(width, fontPx);
  const narrow = m.widthPx === 200;
  const refund = typeof d.refundMinor === "number" ? d.refundMinor : 0;
  const rate = typeof d.tvaRatePercent === "number" ? d.tvaRatePercent : 0;
  let ht = typeof d.htMinor === "number" ? d.htMinor : 0;
  let tva = typeof d.tvaMinor === "number" ? d.tvaMinor : 0;
  if (rate > 0 && !(ht > 0 || tva > 0)) {
    const v = tvaBreakdown(d.totalMinor, rate);
    ht = v.htMinor;
    tva = v.tvaMinor;
  }
  const origin =
    typeof d.originNumber === "string" && d.originNumber !== ""
      ? `<div class="t-meta2">Vente d'origine : ${escapeHtml(d.originNumber)}</div>`
      : "";
  const reason =
    typeof d.reason === "string" && d.reason !== ""
      ? `<div class="t-meta2">Motif : ${escapeHtml(d.reason)}</div>`
      : "";
  const client = clientHtml(d);
  const items = itemsHtml(d, m);
  const rows: string[] = [];
  rows.push(
    `<tr><td>Total retourné</td><td class="t-num">${escapeHtml(formatMinorDa(d.totalMinor))}</td></tr>`,
  );
  if (rate > 0) {
    rows.push(`<tr><td>Total HT</td><td class="t-num">${escapeHtml(formatMinorDa(ht))}</td></tr>`);
    rows.push(
      `<tr><td>TVA (${rate} %)</td><td class="t-num">${escapeHtml(formatMinorDa(tva))}</td></tr>`,
    );
  }
  rows.push(
    `<tr class="t-strong"><td>Remboursé</td><td class="t-num">${escapeHtml(formatMinorDa(refund))}</td></tr>`,
  );
  const bottom =
    `<div class="t-bottom">` +
    `<div class="t-count">${d.lines.length} Article(s)</div>` +
    `<div class="t-box"><table class="t-boxtable"><tbody>${rows.join("")}</tbody></table></div>` +
    `</div>`;
  const title = `<div class="t-note">BON DE RETOUR</div>`;
  const num = `<div class="t-date">N° ${escapeHtml(d.returnNumber || d.invoice)}</div>`;
  const body =
    headerHtml(d, m) +
    title +
    num +
    `<div class="t-date">${escapeHtml(d.date)}</div>` +
    origin +
    reason +
    (client !== "" ? client : "") +
    items +
    bottom +
    ticketCodesHtml(d as any, codes, m) +
    ticketLegalHtml(d as any) +
    `<div class="t-soft">Veloria POS</div>`;
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Bon de retour ${escapeHtml(d.returnNumber || d.invoice)}</title>` +
    `<style>${stylesOf(m)}</style></head>` +
    `<body><div id="veloria-ticket" class="${narrow ? "t-58" : "t-80"}">${body}</div></body></html>`
  );
}
