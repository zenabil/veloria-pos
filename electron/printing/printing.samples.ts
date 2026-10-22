// Veloria PoS — Electron: echantillons demo Studio (decoupage printing.service, zero changement).

import {
  activeTemplateSettings,
  applySettingsToPayment,
  applySettingsToReceipt,
  thermalWidthFor,
  type TemplateSettings,
} from "./printing.templates";
import { companyLogoDataUrl, qrSvgOf, receiptCodes, withQr } from "./printing.enrich";
import {
  buildDeliveryText,
  buildLabelsHtml,
  buildPaymentText,
  buildProformaA4Html,
  buildReceiptText,
  buildReceiptTicketHtml,
  buildReturnSlipText,
  LABEL_FORMATS,
  proformaFromReceipt,
  type LabelFormat,
  type LabelItem,
  type ReceiptData,
  type ThermalWidth,
} from "./receipt-documents";

// ---------------------------------------------------------------------------
// C6 : échantillons démo déterministes (Studio — aucune donnée métier).
// Totaux cohérents au centime (y compris timbre espèces quand applicable).
// ---------------------------------------------------------------------------

export function sampleLines(): {
  name: string;
  qty: number;
  unit: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  ref: string;
}[] {
  return [
    {
      name: "Sucre 1kg",
      qty: 4,
      unit: "PIECE",
      unitPriceMinor: 12_000,
      lineTotalMinor: 48_000,
      ref: "00007",
    },
    {
      name: "Huile 5L",
      qty: 1,
      unit: "PIECE",
      unitPriceMinor: 4_500,
      lineTotalMinor: 4_500,
      ref: "00012",
    },
  ];
}

export function sampleReceipt(): ReceiptData {
  // Cohérent au centime : 48000 + 4500 = 52500 ; HT = arrondi(52500×100/119) ;
  // timbre espèces = 6 tranches × 1 DA (525 DA > 300 DA).
  return {
    company: "SARL Démo",
    companyPhone: "0550 00 00 00",
    companyAddress: "Rue des Frères, Alger",
    companyCity: "Alger",
    companyEmail: "contact@demo.dz",
    companyRc: "16/00-1234567",
    companyNif: "000123456789012",
    companyNis: "123456789012345",
    companyArticle: "12345678901",
    companyLogo: "",
    customerName: "Client Démo — CL-00001",
    customerPhone: "",
    customerAddress: "",
    customerCode: "CL-00001",
    seller: "Yacine",
    tvaRatePercent: 19,
    htMinor: 44_118,
    tvaMinor: 8_382,
    stampMinor: 600,
    qrPayload: "",
    qrSvg: "",
    paymentMethod: "cash",
    dueDate: "",
    notes: "",
    footerText: "",
    thankYouMessage: "Merci pour votre confiance",
    invoice: "FAC-2026-00001",
    date: "03/10/2026, 10:00:00",
    lines: sampleLines(),
    subtotalMinor: 52_500,
    discountMinor: 0,
    deliveryMinor: 0,
    totalMinor: 52_500,
    paidMinor: 52_500,
  };
}

// -------------------------------------------------------------------------
// C6 : Print Studio — aperçu d'un modèle (réglages fournis ou actifs) et
// impression test, sur échantillons démo (aucune donnée métier).
// -------------------------------------------------------------------------

export function renderTemplateSample(
  docType: string,
  override: TemplateSettings | undefined,
  forceWidth?: ThermalWidth,
): { text80: string; html80: string; htmlA4: string } {
  const s = override ?? activeTemplateSettings(docType);
  const width = forceWidth ?? thermalWidthFor(s.paper);
  const page = { page: "A4", marginMm: s.marginMm };
  // Logo réel de l'entreprise (meilleur effort) injecté dans l'échantillon :
  // l'aperçu A4 et l'impression test montrent le placement exact du logo.
  const logo = companyLogoDataUrl();
  if (docType === "etiquette") {
    const items: LabelItem[] = [0, 1].map((i) => ({
      name: i === 0 ? "Sucre 1kg" : "Huile 5L",
      priceMinor: i === 0 ? 12_000 : 4_500,
      barcode: i === 0 ? "6191234567890" : "6190987654321",
      qrSvg: s.showQr ? qrSvgOf(i === 0 ? "6191234567890" : "6190987654321", 2) : undefined,
    }));
    // Gabarit d'étiquette = papier du modèle (jamais A4).
    const fmt: LabelFormat = (LABEL_FORMATS as readonly string[]).includes(s.paper)
      ? (s.paper as LabelFormat)
      : "58x30";
    return {
      text80: "",
      html80: "",
      htmlA4: buildLabelsHtml(items, {
        format: fmt,
        showName: s.showProductName,
        showPrice: s.showPrice,
      }),
    };
  }
  if (docType === "recu") {
    const base = applySettingsToPayment(s, {
      company: "SARL Démo",
      companyPhone: "0550 00 00 00",
      companyAddress: "Rue des Frères, Alger",
      companyCity: "Alger",
      companyEmail: "",
      companyRc: "16/00-1234567",
      companyNif: "000123456789012",
      companyNis: "123456789012345",
      companyArticle: "12345678901",
      companyLogo: "",
      partyLabel: "Client Démo — CL-00001",
      kind: "customer",
      reference: "PAY-00042",
      date: "03/10/2026, 10:00:00",
      amountMinor: 10_000,
      paymentMethod: "cash",
      prevBalanceMinor: 15_000,
      newBalanceMinor: 5_000,
      notes: "",
      footerText: "",
      thankYouMessage: "Merci pour votre règlement",
      qrPayload: "",
      qrSvg: "",
    });
    const qrPayload = base.qrOff === true ? "" : "VELORIA|PAY-00042|10000|03/10/2026";
    const d = { ...base, qrPayload, qrSvg: "" };
    return {
      text80: buildPaymentText(d, width),
      html80: "",
      htmlA4: "",
    };
  }
  const receipt = applySettingsToReceipt(s, withQr({ ...sampleReceipt(), companyLogo: logo }));
  if (docType === "proforma") {
    const p = proformaFromReceipt({
      ...receipt,
      invoice: "PRO-2026-00042",
      date: "03/10/2026, 10:00:00",
    });
    // Devis = A4 uniquement (jamais de ticket).
    return { text80: "", html80: "", htmlA4: buildProformaA4Html(p, page) };
  }
  if (docType === "bon_livraison") {
    const d = {
      ...receipt,
      originNumber: "FAC-2026-00001",
      deliverer: "Livreur Démo",
    };
    return {
      text80: buildDeliveryText(d, width),
      html80: "",
      htmlA4: "",
    };
  }
  if (docType === "avoir") {
    const d = {
      ...receipt,
      returnNumber: "RET-C-00042",
      originNumber: "FAC-2026-00001",
      reason: "Article défectueux",
      refundMinor: 12_000,
    };
    return {
      text80: buildReturnSlipText(d, width),
      html80: "",
      htmlA4: "",
    };
  }
  // Ticket : le HTML du design réel (l'aperçu Studio montre le papier).
  return {
    text80: buildReceiptText(receipt, width),
    html80: buildReceiptTicketHtml(receipt, width, receiptCodes(receipt), s.thermalFontPx),
    htmlA4: "",
  };
}
