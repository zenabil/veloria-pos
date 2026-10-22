// Veloria PoS — Documents purs : blocs du ticket de vente HTML (ADR-134).
// Encadré de soldes, totaux fins, codes et pied — zéro import hors modules purs.

import { amountInWordsFr, formatMinorDa, tvaBreakdown } from "./amounts";
import { code39ModuleFor, code39Svg } from "./barcode39";
import { safeQrSvg } from "./chrome";
import { paymentMethodLabel, type ReceiptData } from "./common";
import { escapeHtml } from "./html";

/** Métriques du ticket (px CSS) calculées par le builder principal. */
export interface TicketMetrics {
  widthPx: number;
  base: number;
  small: number;
  tiny: number;
  brand: number;
  table: number;
  box: number;
  qr: number;
  maxCodes: number;
}

/** Codes du document (vides = blocs masqués par le modèle Studio). */
export interface TicketCodes {
  barcode?: string | undefined;
  qrSvg?: string | undefined;
  qrPayload?: string | undefined;
}

function money(minor: number): string {
  return formatMinorDa(minor);
}

function fineRow(label: string, value: string): string {
  return `<div class="t-fine"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function boxRow(label: string, value: string, strong: boolean): string {
  const cls = strong ? ` class="t-strong"` : "";
  return `<tr${cls}><td>${escapeHtml(label)}</td><td class="t-num">${escapeHtml(value)}</td></tr>`;
}

/**
 * Totaux : détail fiscal discret (sous-total, remise, TVA, livraison, timbre)
 * puis encadré « Ancien solde / Total vente / Versement / Nouveau solde » —
 * la disposition demandée par le propriétaire (reçu de superette).
 */
export function ticketTotalsHtml(d: ReceiptData): string {
  const stamp = typeof d.stampMinor === "number" && d.stampMinor > 0 ? d.stampMinor : 0;
  const net = d.totalMinor + stamp;
  const rate = typeof d.tvaRatePercent === "number" ? d.tvaRatePercent : 0;
  let ht = typeof d.htMinor === "number" ? d.htMinor : 0;
  let tva = typeof d.tvaMinor === "number" ? d.tvaMinor : 0;
  if (rate > 0 && !(ht > 0 || tva > 0)) {
    const v = tvaBreakdown(d.totalMinor, rate);
    ht = v.htMinor;
    tva = v.tvaMinor;
  }
  const fine: string[] = [];
  if (d.discountMinor !== 0 || d.deliveryMinor > 0 || rate > 0) {
    fine.push(fineRow("Sous-total", money(d.subtotalMinor)));
    if (d.discountMinor > 0) fine.push(fineRow("Remise", `−${money(d.discountMinor)}`));
    else if (d.discountMinor < 0) fine.push(fineRow("Majoration", `+${money(-d.discountMinor)}`));
    if (rate > 0) {
      fine.push(fineRow("Total HT", money(ht)));
      fine.push(fineRow(`TVA (${rate} %)`, money(tva)));
    }
    if (d.deliveryMinor > 0) fine.push(fineRow("Livraison", money(d.deliveryMinor)));
  }
  if (stamp > 0) fine.push(fineRow("Timbre fiscal (espèces)", money(stamp)));

  const rows: string[] = [];
  if (d.prevBalanceMinor != null)
    rows.push(boxRow("Ancien solde", money(d.prevBalanceMinor), false));
  rows.push(boxRow("Total vente", money(d.totalMinor), false));
  if (stamp > 0) rows.push(boxRow("Timbre fiscal", money(stamp), false));
  rows.push(boxRow("Versement", money(d.paidMinor), false));
  const saleRemaining = d.totalMinor - d.paidMinor;
  const cashDue = net - d.paidMinor;
  if (d.currentBalanceMinor != null) {
    rows.push(boxRow("Nouveau solde", money(d.currentBalanceMinor), true));
  } else if (saleRemaining > 0) {
    rows.push(boxRow("Reste à payer", money(saleRemaining), true));
  } else if (cashDue > 0) {
    rows.push(boxRow("Reste (timbre)", money(cashDue), true));
  } else if (d.paidMinor > net) {
    rows.push(boxRow("Monnaie rendue", money(d.paidMinor - net), false));
  }

  const meta: string[] = [];
  const method = paymentMethodLabel(d.paymentMethod);
  if (method) meta.push(`Règlement : ${method.toUpperCase()}`);
  if (d.dueDate) meta.push(`Échéance : ${d.dueDate}`);

  return (
    (fine.length > 0 ? `<div class="t-finebox">${fine.join("")}</div>` : "") +
    `<div class="t-bottom">` +
    `<div class="t-count">${d.lines.length} Article(s)</div>` +
    `<div class="t-box"><table class="t-boxtable"><tbody>${rows.join("")}</tbody></table></div>` +
    `</div>` +
    `<div class="t-words"><b>En lettres :</b> ${escapeHtml(amountInWordsFr(net))}</div>` +
    (meta.length > 0
      ? `<div class="t-meta2">${meta.map((x) => escapeHtml(x)).join(" · ")}</div>`
      : "")
  );
}

/** Code 39 complet (numéro lisible sous les barres) + QR de contrôle. */
export function ticketCodesHtml(d: ReceiptData, codes: TicketCodes, m: TicketMetrics): string {
  const raw = typeof codes.barcode === "string" ? codes.barcode : "";
  const svg = raw ? code39Svg(raw, 40, code39ModuleFor(raw, m.maxCodes)) : "";
  const bar = svg
    ? `<div class="t-barcode">${svg.replace("<svg ", `<svg style="max-width:${m.maxCodes}px;height:auto" `)}</div>`
    : "";
  const qr = safeQrSvg(codes.qrSvg);
  const qrHtml = qr
    ? `<div class="t-qr">${qr.replace("<svg ", `<svg style="width:${m.qr}px;height:${m.qr}px" `)}</div>`
    : "";
  const payload =
    qr === "" && typeof codes.qrPayload === "string" && codes.qrPayload !== ""
      ? `<div class="t-payload">${escapeHtml(codes.qrPayload)}</div>`
      : "";
  const number =
    bar === "" && d.invoice !== ""
      ? `<div class="t-invoice">N° ${escapeHtml(d.invoice)}</div>`
      : "";
  if (bar === "" && qrHtml === "" && payload === "" && number === "") return "";
  return `<div class="t-codes">${bar}${number}${qrHtml}${payload}</div>`;
}

/** Remerciement (personnalisé, sinon formule de la maison). */
export function ticketThanksHtml(d: ReceiptData): string {
  const t = typeof d.thankYouMessage === "string" ? d.thankYouMessage.trim() : "";
  return `<div class="t-thanks">${escapeHtml(t || "Merci de votre visite.")}</div>`;
}

/** Mention légale du pied (modèle Studio, sinon mention ticket par défaut). */
export function ticketLegalHtml(d: ReceiptData): string {
  const t = typeof d.footerNote === "string" ? d.footerNote.trim() : "";
  return `<div class="t-legal">${escapeHtml(t || "Ticket obligatoire pour toutes réclamations")}</div>`;
}

/** Signatures masquables (modèle sans signatures = aucun bloc). */
export function ticketSignsHtml(d: ReceiptData): string {
  if (d.hideSigns === true) return "";
  return `<div class="t-signs"><div>Signature client</div><div>Cachet / Signature</div></div>`;
}
