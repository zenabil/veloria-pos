// Veloria PoS — Documents purs : ticket 80mm texte + normalisation (pur).

import {
  paymentMethodLabel,
  type ReceiptData,
  type ReceiptLine,
  type ThermalWidth,
} from "./common";
import { amountInWordsFr, formatMinorDa, formatQtyFr, tvaBreakdown } from "./amounts";
import {
  thermalCenter,
  thermalCols,
  thermalField,
  thermalFooterBlock,
  thermalItem,
  thermalRow,
  thermalSep,
  wrapThermal,
} from "./thermal";
import { docQrPayload, identityThermalLines } from "./chrome";

interface PrintReceiptPayload {
  company?: unknown;
  companyPhone?: unknown;
  companyAddress?: unknown;
  companyCity?: unknown;
  companyEmail?: unknown;
  companyRc?: unknown;
  companyNif?: unknown;
  companyNis?: unknown;
  companyArticle?: unknown;
  companyLogo?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  customerAddress?: unknown;
  customerCode?: unknown;
  seller?: unknown;
  tvaRatePercent?: unknown;
  htMinor?: unknown;
  tvaMinor?: unknown;
  stampMinor?: unknown;
  qrPayload?: unknown;
  qrSvg?: unknown;
  paymentMethod?: unknown;
  dueDate?: unknown;
  notes?: unknown;
  footerText?: unknown;
  thankYouMessage?: unknown;
  invoice?: unknown;
  date?: unknown;
  lines?: unknown;
  subtotalMinor?: unknown;
  discountMinor?: unknown;
  deliveryMinor?: unknown;
  totalMinor?: unknown;
  paidMinor?: unknown;
  prevBalanceMinor?: unknown;
  currentBalanceMinor?: unknown;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toReceiptLines(value: unknown): ReceiptLine[] {
  if (!Array.isArray(value)) return [];
  const out: ReceiptLine[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r["name"] === "string" &&
      typeof r["qty"] === "number" &&
      typeof r["unitPriceMinor"] === "number" &&
      typeof r["lineTotalMinor"] === "number"
    ) {
      out.push({
        name: r["name"],
        qty: r["qty"],
        unit: typeof r["unit"] === "string" ? r["unit"] : "",
        unitPriceMinor: r["unitPriceMinor"],
        lineTotalMinor: r["lineTotalMinor"],
        ref: typeof r["ref"] === "string" ? r["ref"] : undefined,
        billedTotalMinor: typeof r["billedTotalMinor"] === "number" ? r["billedTotalMinor"] : null,
      });
    }
  }
  return out;
}

export function toReceiptData(raw: unknown): ReceiptData {
  const payload: PrintReceiptPayload =
    typeof raw === "object" && raw !== null ? (raw as PrintReceiptPayload) : {};
  const tvaRate =
    typeof payload.tvaRatePercent === "number" && Number.isFinite(payload.tvaRatePercent)
      ? Math.min(100, Math.max(0, payload.tvaRatePercent))
      : 0;
  return {
    company: textOf(payload.company) || "Veloria",
    companyPhone: textOf(payload.companyPhone),
    companyAddress: textOf(payload.companyAddress),
    companyCity: textOf(payload.companyCity),
    companyEmail: textOf(payload.companyEmail),
    companyRc: textOf(payload.companyRc),
    companyNif: textOf(payload.companyNif),
    companyNis: textOf(payload.companyNis),
    companyArticle: textOf(payload.companyArticle),
    companyLogo: textOf(payload.companyLogo),
    customerName: textOf(payload.customerName),
    customerPhone: textOf(payload.customerPhone),
    customerAddress: textOf(payload.customerAddress),
    customerCode: textOf(payload.customerCode),
    seller: textOf(payload.seller),
    tvaRatePercent: tvaRate,
    htMinor: toNumberOr(payload.htMinor, 0),
    tvaMinor: toNumberOr(payload.tvaMinor, 0),
    stampMinor: toNumberOr(payload.stampMinor, 0),
    qrPayload: textOf(payload.qrPayload),
    qrSvg: textOf(payload.qrSvg),
    paymentMethod: textOf(payload.paymentMethod),
    dueDate: textOf(payload.dueDate),
    notes: textOf(payload.notes),
    footerText: textOf(payload.footerText),
    thankYouMessage: textOf(payload.thankYouMessage),
    invoice: textOf(payload.invoice),
    date: textOf(payload.date) || new Date().toLocaleString("fr-FR"),
    lines: toReceiptLines(payload.lines),
    subtotalMinor: toNumberOr(payload.subtotalMinor, 0),
    discountMinor: toNumberOr(payload.discountMinor, 0),
    deliveryMinor: toNumberOr(payload.deliveryMinor, 0),
    totalMinor: toNumberOr(payload.totalMinor, 0),
    paidMinor: toNumberOr(payload.paidMinor, 0),
    prevBalanceMinor: toOptionalNumber(payload.prevBalanceMinor),
    currentBalanceMinor: toOptionalNumber(payload.currentBalanceMinor),
  };
}

export function buildReceiptText(d: ReceiptData, width?: ThermalWidth): string {
  const cols = thermalCols(width);
  const sep = thermalSep(cols);
  const fmt = formatMinorDa;
  const out: string[] = [];
  for (const l of wrapThermal(`*** ${d.company} ***`, cols)) out.push(l);
  if (d.companyAddress || d.companyCity) {
    for (const l of wrapThermal(
      [d.companyAddress, d.companyCity].filter(Boolean).join(" – "),
      cols,
    ))
      out.push(l);
  }
  if (d.companyPhone) out.push(...thermalField("Tél", d.companyPhone, cols));
  for (const l of identityThermalLines(d)) for (const w of wrapThermal(l, cols)) out.push(w);
  // C6-bis : note d'en-tête du modèle (sous le cartouche, centrée).
  if (d.headerNote) out.push(...thermalCenter(d.headerNote, cols));
  out.push(sep);
  out.push(`TICKET DE CAISSE`);
  out.push(sep);
  out.push(...thermalField("N°", d.invoice, cols));
  out.push(...thermalField("Date", d.date, cols));
  if (d.seller) out.push(...thermalField("Vendeur", d.seller, cols));
  if (d.customerName) out.push(...thermalField("Client", d.customerName, cols));
  out.push(sep);
  out.push(`PRODUIT · QTÉ x P.U. = TOTAL`);
  for (const l of d.lines) {
    // ADR-131/132 : ligne facturée au MONTANT SAISI — la multiplication
    // « qté x P.U. » serait arithmétiquement fausse (0,071 × 700 ≠ 50,00) ;
    // le ticket affiche donc le détail réel : poids + « montant saisi ».
    const qty = `${formatQtyFr(l.qty)}${l.unit ? ` ${l.unit}` : ""}`;
    const middle =
      l.billedTotalMinor != null ? `${qty} · montant saisi` : `${qty} x ${fmt(l.unitPriceMinor)}`;
    for (const row of thermalItem(
      `${l.ref && l.ref !== "—" ? `[${l.ref}] ` : ""}${l.name}`,
      middle,
      fmt(l.lineTotalMinor),
      cols,
    ))
      out.push(row);
  }
  out.push(sep);
  for (const row of thermalRow("Sous-total", fmt(d.subtotalMinor), cols)) out.push(row);
  // Remise SIGNÉE (ADR-131/132) : une remise négative = majoration (prix
  // facturé > prix catalogue) ou facture au montant saisi. L'écart reste
  // VISIBLE sur le ticket (jamais masqué) et le ticket se recompose à l'œil.
  if (d.discountMinor > 0)
    for (const row of thermalRow("Remise", `−${fmt(d.discountMinor)}`, cols)) out.push(row);
  else if (d.discountMinor < 0)
    for (const row of thermalRow("Majoration", `+${fmt(-d.discountMinor)}`, cols)) out.push(row);
  const rate = typeof d.tvaRatePercent === "number" ? d.tvaRatePercent : 0;
  if (rate > 0) {
    const ht = typeof d.htMinor === "number" ? d.htMinor : 0;
    const tv = typeof d.tvaMinor === "number" ? d.tvaMinor : 0;
    const { htMinor, tvaMinor } =
      ht > 0 || tv > 0 ? { htMinor: ht, tvaMinor: tv } : tvaBreakdown(d.totalMinor, rate);
    for (const row of thermalRow("Total HT", fmt(htMinor), cols)) out.push(row);
    for (const row of thermalRow(`TVA (${rate} %)`, fmt(tvaMinor), cols)) out.push(row);
  }
  if (d.deliveryMinor > 0)
    for (const row of thermalRow("Livraison", fmt(d.deliveryMinor), cols)) out.push(row);
  out.push(...thermalRow("TOTAL TTC", fmt(d.totalMinor), cols));
  // C5 : timbre documentaire LF 2025 (espèces) — net à payer = TTC + timbre.
  const stamp = typeof d.stampMinor === "number" && d.stampMinor > 0 ? d.stampMinor : 0;
  if (stamp > 0)
    for (const row of thermalRow("Timbre fiscal (espèces)", fmt(stamp), cols)) out.push(row);
  const net = d.totalMinor + stamp;
  if (stamp > 0) {
    out.push(``);
    for (const row of thermalRow("NET À PAYER", fmt(net), cols)) out.push(row);
  }
  out.push(``);
  for (const row of thermalRow("Payé", fmt(d.paidMinor), cols)) out.push(row);
  const saleRemaining = d.totalMinor - d.paidMinor;
  const cashDue = net - d.paidMinor;
  if (saleRemaining > 0)
    for (const row of thermalRow("Reste (crédit)", fmt(saleRemaining), cols)) out.push(row);
  else if (cashDue > 0)
    for (const row of thermalRow("Reste (timbre espèces)", fmt(cashDue), cols)) out.push(row);
  else if (d.paidMinor > net)
    for (const row of thermalRow("Monnaie rendue", fmt(d.paidMinor - net), cols)) out.push(row);
  if (d.dueDate) out.push(...thermalField("Échéance", d.dueDate, cols));
  if (d.prevBalanceMinor != null)
    for (const row of thermalRow("Ancien solde", fmt(d.prevBalanceMinor), cols)) out.push(row);
  if (d.currentBalanceMinor != null)
    for (const row of thermalRow("Solde actuel", fmt(d.currentBalanceMinor), cols)) out.push(row);
  const method = paymentMethodLabel(d.paymentMethod);
  if (method) out.push(...thermalField("Mode", method.toUpperCase(), cols));
  for (const row of thermalField("En lettres", amountInWordsFr(net), cols)) out.push(row);
  const qr = docQrPayload(d);
  if (qr) for (const row of thermalField("QR", qr, cols)) out.push(row);
  out.push(sep);
  // C6-bis : pied complet — remerciement, pied du modèle, filigrane, signatures.
  out.push(...thermalFooterBlock(d, cols, ["Merci pour votre achat", "À bientôt !"]));
  out.push(sep);
  out.push(`Veloria POS`);
  return out.join("\n");
}
