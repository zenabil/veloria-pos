// Veloria PoS — Documents purs : recu de reglement (pur).

import { paymentMethodLabel, type ThermalWidth } from "./common";
import { amountInWordsFr, formatMinorDa } from "./amounts";
import {
  thermalCenter,
  thermalCols,
  thermalField,
  thermalFooterBlock,
  thermalRow,
  thermalSep,
  wrapThermal,
} from "./thermal";
import { identityThermalLines } from "./chrome";

// ---------------------------------------------------------------------------
// Reçu de règlement de dette (ticket de règlement) : reçu client/fournisseur/
// pain après encaissement d'un paiement (comptant partiel ou total).
// Ticket uniquement (jamais A4) — politique opération → format.
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
  /** C6-bis : pied du modèle (imprimé seulement si le modèle le définit). */
  footerNote?: string | undefined;
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
  // C6-bis : identité légale + note d'en-tête du modèle (comme le ticket).
  for (const l of identityThermalLines(d)) for (const w of wrapThermal(l, cols)) out.push(w);
  if (d.headerNote) out.push(...thermalCenter(d.headerNote, cols));
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
  // C6-bis : pied complet — remerciement, pied du modèle, filigrane, signatures.
  out.push(
    ...thermalFooterBlock(
      d,
      cols,
      ["Merci pour votre règlement", "À bientôt !"],
      ["Signature", "Cachet / Signature"],
    ),
  );
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
