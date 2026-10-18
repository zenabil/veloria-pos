// Veloria PoS — Documents purs : livraison / retour / commande (pur).

import type { ReceiptData, ThermalWidth } from "./common";
import {
  thermalCols,
  thermalField,
  thermalItem,
  thermalRow,
  thermalSep,
  wrapThermal,
} from "./thermal";
import { tvaBreakdown, formatMinorDa } from "./amounts";
import { docQrPayload } from "./chrome";

// ---------------------------------------------------------------------------
// P0-3 : documents logistiques — bon de livraison / bon de retour / bon de
// commande. Ticket 58/80mm uniquement (jamais A4) — politique opération →
// format. Données SQLite, même hiérarchie N&B + QR.
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

/** Bon de livraison thermique 58/80mm. */
export function buildDeliveryText(d: LogisticsDocData, width?: ThermalWidth): string {
  const cols = thermalCols(width);
  const sep = thermalSep(cols);
  const fmt = formatMinorDa;
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

/** Bon de retour thermique. */
export function buildReturnSlipText(d: LogisticsDocData, width?: ThermalWidth): string {
  const cols = thermalCols(width);
  const sep = thermalSep(cols);
  const fmt = formatMinorDa;
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

/** Bon de commande thermique. */
export function buildPurchaseOrderText(d: LogisticsDocData, width?: ThermalWidth): string {
  const cols = thermalCols(width);
  const sep = thermalSep(cols);
  const fmt = formatMinorDa;
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
