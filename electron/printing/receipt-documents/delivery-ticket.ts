// Veloria PoS — Documents purs : bon de livraison HTML (design ADR-134).
import { escapeHtml } from "./html";
import { formatMinorDa } from "./amounts";
import { headerHtml, clientHtml, itemsHtml, metricsOf, stylesOf } from "./ticket-html";
import { ticketCodesHtml, ticketLegalHtml } from "./ticket-blocks";
import type { LogisticsDocData } from "./logistics";
import type { ThermalWidth } from "./common";
import type { TicketCodes } from "./ticket-html";

export function buildDeliveryTicketHtml(
  d: LogisticsDocData,
  width?: ThermalWidth,
  codes: TicketCodes = {},
  fontPx?: number,
): string {
  const m = metricsOf(width, fontPx);
  const narrow = m.widthPx === 200;
  const showPrice = d.hidePrices !== true;
  const totalQty = d.lines.reduce((a, l) => a + (Number.isFinite(l.qty) ? l.qty : 0), 0);
  const title = `<div class="t-note">BON DE LIVRAISON</div>`;
  const items = itemsHtml(d, m);
  const client = clientHtml(d);
  const bottom =
    `<div class="t-bottom">` +
    `<div class="t-count">${d.lines.length} Article(s)</div>` +
    `<div class="t-box"><table class="t-boxtable"><tbody>` +
    (showPrice
      ? `<tr class="t-strong"><td>TOTAL</td><td class="t-num">${escapeHtml(formatMinorDa(d.totalMinor))}</td></tr>`
      : `<tr class="t-strong"><td>TOTAL QUANTITÉ</td><td class="t-num">${escapeHtml(String(Number(totalQty.toFixed(3))))}</td></tr>`) +
    `</tbody></table></div></div>`;
  const body =
    headerHtml(d, m) +
    title +
    `<div class="t-date">${escapeHtml(d.date)}</div>` +
    (client !== "" ? client : "") +
    items +
    bottom +
    ticketCodesHtml(d, codes, m) +
    ticketLegalHtml(d) +
    `<div class="t-soft">Veloria POS</div>`;
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Bon de livraison ${escapeHtml(d.invoice)}</title>` +
    `<style>${stylesOf(m)}</style></head>` +
    `<body><div id="veloria-ticket" class="${narrow ? "t-58" : "t-80"}">${body}</div></body></html>`
  );
}
