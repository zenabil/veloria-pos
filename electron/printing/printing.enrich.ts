// Veloria PoS — Electron: enrichissement des charges (decoupage printing.service, zero changement).
// Reglages facture, logo, identite legale, QR. proformaWithSettings vit en printing.templates.

import { getDb } from "../database/sqlite.service";
import { log } from "../services/logger";
import { readLogoDataUrlFromFile } from "../services/logo";
import { printPayloadSchema } from "../ipc/validators";
import { buildQrPayload, toReceiptData, tvaBreakdown, type ReceiptData } from "./receipt-documents";

/** Réglages facture (logo, soldes, pied de page) appliqués aux charges utiles. */
export function applyInvoiceSettings(d: ReceiptData): ReceiptData {
  let cfg: {
    showLogo?: boolean;
    showCustomerBalance?: boolean;
    showPreviousBalance?: boolean;
    footerText?: string;
    thankYouMessage?: string;
    tvaRatePercent?: number;
    sellerDefault?: string;
    // Aliases historiques écrits par d'anciennes versions renderer.
    vatRate?: number;
    defaultSeller?: string;
  } = {};
  try {
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = 'invoice'`)
      .get() as { value_json: string } | undefined;
    if (row) cfg = JSON.parse(row.value_json) as typeof cfg;
  } catch (err) {
    log("WARN", "printing", "invoiceSettings.unreadable", { error: String(err) });
  }
  const rawRate =
    typeof cfg.tvaRatePercent === "number" && Number.isFinite(cfg.tvaRatePercent)
      ? cfg.tvaRatePercent
      : typeof cfg.vatRate === "number" && Number.isFinite(cfg.vatRate)
        ? cfg.vatRate
        : 0;
  const rate = Math.min(100, Math.max(0, rawRate));
  const sellerDefault =
    typeof cfg.sellerDefault === "string" && cfg.sellerDefault !== ""
      ? cfg.sellerDefault
      : typeof cfg.defaultSeller === "string"
        ? cfg.defaultSeller
        : "";
  const incomingRate = typeof d.tvaRatePercent === "number" ? d.tvaRatePercent : 0;
  const incomingHt = typeof d.htMinor === "number" ? d.htMinor : 0;
  const incomingTv = typeof d.tvaMinor === "number" ? d.tvaMinor : 0;
  const withRate: ReceiptData = {
    ...d,
    tvaRatePercent: incomingRate > 0 ? incomingRate : rate,
    seller: d.seller || sellerDefault,
    htMinor: incomingHt,
    tvaMinor: incomingTv,
  };
  const finalRate = typeof withRate.tvaRatePercent === "number" ? withRate.tvaRatePercent : 0;
  const finalHt = typeof withRate.htMinor === "number" ? withRate.htMinor : 0;
  const finalTv = typeof withRate.tvaMinor === "number" ? withRate.tvaMinor : 0;
  if (finalRate > 0 && !(finalHt > 0 || finalTv > 0)) {
    const v = tvaBreakdown(withRate.totalMinor, finalRate);
    withRate.htMinor = v.htMinor;
    withRate.tvaMinor = v.tvaMinor;
  }
  return {
    ...withRate,
    companyLogo: cfg.showLogo === false ? "" : withRate.companyLogo,
    prevBalanceMinor: cfg.showPreviousBalance === false ? undefined : withRate.prevBalanceMinor,
    currentBalanceMinor:
      cfg.showCustomerBalance === false ? undefined : withRate.currentBalanceMinor,
    footerText: typeof cfg.footerText === "string" ? cfg.footerText : "",
    thankYouMessage: typeof cfg.thankYouMessage === "string" ? cfg.thankYouMessage : "",
  };
}

/** QR réel (lib `qrcode`, SVG N&B) + payload déterministe — meilleur effort, jamais bloquant. */
export function withQr(d: ReceiptData): ReceiptData {
  const payload = d.qrPayload || buildQrPayload(d);
  if (d.qrSvg) return { ...d, qrPayload: payload };
  try {
    // `create` synchrone → SVG N&B construit localement (pas de callback,
    // pipeline d'impression inchangé). Échec = payload texte seul.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("qrcode") as {
      create?: (
        text: string,
        opts?: unknown,
      ) => {
        modules: { size: number; get: (r: number, c: number) => boolean };
      };
    };
    if (typeof mod.create !== "function") return { ...d, qrPayload: payload };
    const qr = mod.create(payload, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const cell = 4;
    const size = n * cell;
    let rects = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.modules.get(r, c)) {
          rects += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="#000"/>`;
        }
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="110" height="110" role="img" aria-label="QR ${escapeQr(payload)}"><rect width="${size}" height="${size}" fill="#fff"/>${rects}</svg>`;
    return { ...d, qrPayload: payload, qrSvg: svg };
  } catch (err) {
    log("WARN", "printing", "qr.unavailable", { error: String(err) });
    return { ...d, qrPayload: payload };
  }
}

export function escapeQr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** QR SVG N&B pour un texte (étiquettes, jamais bloquant — "" si indisponible). */
export function qrSvgOf(text: string, cell: number): string {
  let svg = "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("qrcode") as {
      create?: (
        payload: string,
        opts?: unknown,
      ) => {
        modules: { size: number; get: (r: number, c: number) => boolean };
      };
    };
    if (typeof mod.create === "function") {
      const qr = mod.create(text, { errorCorrectionLevel: "M" });
      const n = qr.modules.size;
      const size = n * cell;
      let rects = "";
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (qr.modules.get(r, c)) {
            rects += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="#000"/>`;
          }
        }
      }
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img"><rect width="${size}" height="${size}" fill="#fff"/>${rects}</svg>`;
    }
  } catch (err) {
    log("WARN", "printing", "qr.unavailable", { error: String(err) });
  }
  return svg;
}

/** Logo entreprise en data URL ("" si absent/illisible) — meilleur effort. */
export function companyLogoDataUrl(): string {
  try {
    const row = getDb().prepare(`SELECT logo_path FROM company_profile WHERE id = 1`).get() as
      { logo_path: string | null } | undefined;
    return readLogoDataUrlFromFile(row?.logo_path) ?? "";
  } catch (err) {
    log("WARN", "printing", "logo.unreadable", { error: String(err) });
    return "";
  }
}

/** Logo entreprise en data URL (meilleur effort, aperçu + impression). */
export function withLogo(d: ReceiptData): ReceiptData {
  const dataUrl = companyLogoDataUrl();
  return dataUrl ? { ...d, companyLogo: dataUrl } : d;
}

/**
 * Identité légale (RC/NIF/NIS/Art) complétée depuis la fiche entreprise quand
 * le payload ne les porte pas (caisse) — meilleur effort, mentions légales.
 */
export function withCompanyIdentity(d: ReceiptData): ReceiptData {
  if (d.companyRc && d.companyNif && d.companyNis && d.companyArticle) return d;
  try {
    const row = getDb()
      .prepare(`SELECT rc_number, nif, nis, article_imposition FROM company_profile WHERE id = 1`)
      .get() as
      | {
          rc_number: string | null;
          nif: string | null;
          nis: string | null;
          article_imposition: string | null;
        }
      | undefined;
    return {
      ...d,
      companyRc: d.companyRc || row?.rc_number || "",
      companyNif: d.companyNif || row?.nif || "",
      companyNis: d.companyNis || row?.nis || "",
      companyArticle: d.companyArticle || row?.article_imposition || "",
    };
  } catch (err) {
    log("WARN", "printing", "companyIdentity.unreadable", { error: String(err) });
    return d;
  }
}

/** Devis avec logo + identité + réglages facture (même pipeline que les factures). */
// P09: pipeline unique logo+réglages+identité — les 4 handlers factures/tickets
// passent par enrichReceipt (plus de bloc répété à dériver).
export function enrichReceipt(raw: unknown): ReceiptData {
  return withQr(
    withCompanyIdentity(
      applyInvoiceSettings(withLogo(toReceiptData(printPayloadSchema.parse(raw)))),
    ),
  );
}

/** Reçu de règlement : même pipeline logo+identité+réglages que les factures. */
export function withLogoPayment<T extends { companyLogo: string }>(d: T): T {
  const dataUrl = companyLogoDataUrl();
  return dataUrl ? { ...d, companyLogo: dataUrl } : d;
}

export function withCompanyIdentityPayment<
  T extends {
    companyRc: string;
    companyNif: string;
    companyNis?: string | undefined;
    companyArticle?: string | undefined;
  },
>(d: T): T {
  if (d.companyRc && d.companyNif && d.companyNis && d.companyArticle) return d;
  try {
    const row = getDb()
      .prepare(`SELECT rc_number, nif, nis, article_imposition FROM company_profile WHERE id = 1`)
      .get() as
      | {
          rc_number: string | null;
          nif: string | null;
          nis: string | null;
          article_imposition: string | null;
        }
      | undefined;
    return {
      ...d,
      companyRc: d.companyRc || row?.rc_number || "",
      companyNif: d.companyNif || row?.nif || "",
      companyNis: d.companyNis || row?.nis || "",
      companyArticle: d.companyArticle || row?.article_imposition || "",
    };
  } catch (err) {
    log("WARN", "printing", "companyIdentity.unreadable", { error: String(err) });
    return d;
  }
}

export function applyPaymentSettings<
  T extends { footerText: string; thankYouMessage: string; companyLogo: string },
>(d: T): T {
  try {
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = 'invoice'`)
      .get() as { value_json: string } | undefined;
    if (!row) return d;
    const cfg = JSON.parse(row.value_json) as {
      footerText?: string;
      thankYouMessage?: string;
      showLogo?: boolean;
    };
    return {
      ...d,
      companyLogo: cfg.showLogo === false ? "" : d.companyLogo,
      footerText: typeof cfg.footerText === "string" ? cfg.footerText : d.footerText,
      thankYouMessage:
        typeof cfg.thankYouMessage === "string" ? cfg.thankYouMessage : d.thankYouMessage,
    };
  } catch (err) {
    log("WARN", "printing", "invoiceSettings.unreadable", { error: String(err) });
    return d;
  }
}

export function receiptCodes(d: ReceiptData): {
  barcode: string;
  qrSvg: string;
  qrPayload: string;
} {
  // Interrupteur Studio « Code-barres » (C6) : le Code 39 disparaît, le QR
  // reste piloté par son propre interrupteur (qrOff).
  const barcode = d.codesOff === true ? "" : d.invoice;
  if (d.qrOff === true) return { barcode, qrSvg: "", qrPayload: "" };
  return { barcode, qrSvg: d.qrSvg ?? "", qrPayload: d.qrPayload || buildQrPayload(d) };
}
