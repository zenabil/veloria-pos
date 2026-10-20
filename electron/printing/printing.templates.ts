// Veloria PoS — Electron: modeles Print Studio + primitifs (decoupage printing.service, zero changement).

import { z } from "zod";
import { log } from "../services/logger";
import { getActiveTemplate } from "../ipc/handlers/templates.repo";
import { templateSettingsSchema, type ParsedTemplateSettings } from "../ipc/validators";
import { getThermalWidth, printOptions } from "./printing.printer-settings";
import { factorySettingsMirror, neutralizeForDocType } from "./printing.capabilities";
import { enrichReceipt } from "./printing.enrich";
import {
  buildReceiptText,
  proformaFromReceipt,
  thermalHtml,
  type PaymentTicketData,
  type ProformaData,
  type ReceiptData,
  type ThermalWidth,
} from "./receipt-documents";

export function renderCopies(docType: string): number {
  try {
    return activeTemplateSettings(docType).copies;
  } catch {
    return 1;
  }
}

// ---------------------------------------------------------------------------
// C6 : Print Studio — application du modèle actif (SQLite, migration 0036).
// Contenu via les données (jamais de SQL générique), mise en page via les
// options explicites des builders. Repli = rendu historique (défauts).
// ---------------------------------------------------------------------------

export interface TemplateRender {
  settings: TemplateSettings;
}

/** Réglages du modèle actif (défauts d'usine si absent/illisible). */
export function activeTemplateSettings(docType: string): TemplateSettings {
  try {
    const row = getActiveTemplate(docType);
    return mergeTemplateMirror(docType, row ? row.settings : {});
  } catch (err) {
    log("WARN", "printing", "template.unreadable", { docType, error: String(err) });
    return mergeTemplateMirror(docType, {});
  }
}

/**
 * C6 : fusion main des réglages — MIROIR de
 * `src/domain/print/template-rules.ts#mergeTemplateSettings`
 * (electron ne peut pas importer src/). Toute modification ici doit être
 * répercutée là-bas (parité testée). C6-bis : la matrice de capacités du type
 * (`printing.capabilities.ts`) neutralise les réglages hors sujet et porte les
 * défauts d'usine (opt-in des capacités thermiques).
 */
export function mergeTemplateMirror(docType: string, raw: unknown): TemplateSettings {
  const parsed = templateSettingsSchema.parse(raw ?? {});
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const allowed: readonly string[] =
    docType === "etiquette"
      ? ["30x20", "45x20", "50x30", "58x30", "58x40"]
      : docType === "proforma"
        ? ["A4"]
        : ["80mm", "58mm"];
  const fallbackPaper = docType === "etiquette" ? "58x30" : docType === "proforma" ? "A4" : "80mm";
  const paper =
    obj["paper"] !== undefined && allowed.includes(parsed.paper) ? parsed.paper : fallbackPaper;
  // Défauts d'usine du type pour les clés ABSENTES du JSON (Zod applique les
  // défauts globaux) — miroir exact de factorySettings côté domaine.
  const merged: Record<string, unknown> = { ...parsed, paper };
  for (const [key, value] of Object.entries(factorySettingsMirror(docType))) {
    if (obj[key] === undefined) merged[key] = value;
  }
  return neutralizeForDocType(docType, merged as ParsedTemplateSettings);
}

/** Papier effectif : modèle Studio, sinon largeur thermique configurée. */
export function thermalWidthFor(paper: string): ThermalWidth {
  if (paper === "58mm" || paper === "80mm") return paper;
  return getThermalWidth();
}

/** Enveloppe de rendu (papier + police thermique) pour un type. */
export function templateRenderOf(docType: string): {
  settings: TemplateRender["settings"];
  width: ThermalWidth;
} {
  const settings = activeTemplateSettings(docType);
  return { settings, width: thermalWidthFor(settings.paper) };
}

/** Options @page (A4 + marges) pour un type — seul le devis reste A4. */
export function pageOptsOf(docType: string): { page: string; marginMm: number } {
  const s = activeTemplateSettings(docType);
  return { page: "A4", marginMm: s.marginMm };
}

export type TemplateSettings = z.infer<typeof templateSettingsSchema>;

/**
 * C6-bis : HTML thermique d'un document à partir des réglages du modèle —
 * point unique (impression, PDF, aperçu Studio) pour que l'aperçu, le papier
 * et le PDF sortent identiques (logo de l'entreprise compris).
 */
export function thermalDocumentHtml(args: {
  settings: TemplateSettings;
  width: ThermalWidth;
  text: string;
  codes: { barcode: string; qrSvg: string; qrPayload: string };
  logo?: string | undefined;
}): string {
  return thermalHtml(args.text, args.width, args.codes, args.settings.thermalFontPx, {
    logo: args.settings.showLogo ? (args.logo ?? "") : "",
    logoSize: args.settings.logoSize,
  });
}

export function applySettingsToReceipt(s: TemplateSettings, d: ReceiptData): ReceiptData {
  return {
    ...d,
    companyLogo: s.showLogo ? d.companyLogo : "",
    companyRc: s.showIdentity ? d.companyRc : "",
    companyNif: s.showIdentity ? d.companyNif : "",
    companyNis: s.showIdentity ? (d.companyNis ?? "") : "",
    companyArticle: s.showIdentity ? (d.companyArticle ?? "") : "",
    tvaRatePercent: s.showTva ? d.tvaRatePercent : 0,
    htMinor: s.showTva ? d.htMinor : 0,
    tvaMinor: s.showTva ? d.tvaMinor : 0,
    qrSvg: s.showQr ? d.qrSvg : "",
    qrPayload: s.showQr ? d.qrPayload : "",
    qrOff: !s.showQr,
    codesOff: !s.showCodes,
    footerText: s.footerText !== "" ? s.footerText : d.footerText,
    // Pied du MODÈLE (thermique) : jamais le pied des paramètres, pour qu'un
    // ticket muet avant C6-bis le reste tant que le modèle ne dit rien.
    footerNote: s.footerText !== "" ? s.footerText : undefined,
    headerNote: s.headerText !== "" ? s.headerText : undefined,
    watermark: s.showWatermark ? s.watermarkText : undefined,
    logoSize: s.logoSize,
    hideSigns: !s.showSignatures,
    hideZeroRows: !s.showDiscountZero,
    hidePrices: !s.showPrice,
  };
}

export function applyTemplateToReceipt(docType: string, d: ReceiptData): ReceiptData {
  return applySettingsToReceipt(activeTemplateSettings(docType), d);
}

export function applyTemplateToPayment(d: PaymentTicketData): PaymentTicketData {
  return applySettingsToPayment(activeTemplateSettings("recu"), d);
}

export function applySettingsToPayment(
  s: TemplateSettings,
  d: PaymentTicketData,
): PaymentTicketData {
  return {
    ...d,
    companyLogo: s.showLogo ? d.companyLogo : "",
    companyRc: s.showIdentity ? d.companyRc : "",
    companyNif: s.showIdentity ? d.companyNif : "",
    companyNis: s.showIdentity ? (d.companyNis ?? "") : "",
    companyArticle: s.showIdentity ? (d.companyArticle ?? "") : "",
    qrSvg: s.showQr ? (d.qrSvg ?? "") : "",
    qrPayload: s.showQr ? (d.qrPayload ?? "") : "",
    logoSize: s.logoSize,
    hideSigns: !s.showSignatures,
    qrOff: !s.showQr,
    codesOff: !s.showCodes,
    watermark: s.showWatermark ? s.watermarkText : undefined,
    headerNote: s.headerText !== "" ? s.headerText : undefined,
    footerNote: s.footerText !== "" ? s.footerText : undefined,
  };
}

/** Impression N exemplaires (double copie Studio) — boucle explicite. */
export async function printCopies(html: string, copies: number, waitMs: number): Promise<void> {
  const n = Number.isInteger(copies) && copies >= 1 ? Math.min(5, copies) : 1;
  for (let i = 0; i < n; i++) {
    await printHtml(html, waitMs);
  }
}

export interface PrintPage {
  html: string;
  pageSizeMicrons?: { width: number; height: number } | undefined;
}

export async function printHtml(
  html: string,
  waitMs: number,
  extra?: { pageSizeMicrons?: { width: number; height: number } | undefined },
): Promise<void> {
  await printHtmlPages([{ html, pageSizeMicrons: extra?.pageSizeMicrons }], waitMs);
}

/**
 * Imprime N pages dans UNE seule fenêtre cachée, UN job par page.
 * Étiquettes rouleau : 1 étiquette = 1 job = 1 avance papier — demander 2
 * étiquettes ne peut plus sortir 1 seule (plus de pagination Chromium
 * multi-étiquettes sur une page pilote trop grande).
 */
export async function printHtmlPages(pages: PrintPage[], waitMs: number): Promise<void> {
  const { BrowserWindow: BW } = await import("electron");
  // Fenêtre cachée durcie : aucun preload, aucun Node côté document —
  // le HTML est généré par des builders qui échappent déjà les entrées.
  // EL-05: mêmes garde-fous que les fenêtres visibles (permissions refusées,
  // navigation interne refusée, pas de window.open).
  const printWin = new BW({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });
  try {
    try {
      printWin.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    } catch {
      /* session indisponible en test */
    }
    printWin.webContents.on("will-navigate", (event) => event.preventDefault());
    // P3: redirect aussi refusé (pas seulement navigate).
    printWin.webContents.on("will-redirect", (event) => event.preventDefault());
    printWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    for (const page of pages) {
      // P06: attendre did-finish-load (logo/base64 volumineux) au lieu d'un délai
      // fixe seul — le délai reste en garde-fou maximal.
      const loaded = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.max(waitMs, 1500));
        printWin.webContents.once("did-finish-load", () => {
          clearTimeout(timer);
          // Un tick de rendu pour les images dataURL avant print.
          setTimeout(resolve, Math.min(waitMs, 300));
        });
      });
      await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page.html)}`);
      await loaded;
      // Étiquettes rouleau : format exact en microns + marges nulles, sinon
      // Chromium imprime au format du pilote et fait sortir des vierges.
      const base = printOptions();
      const printOpts = page.pageSizeMicrons
        ? { ...base, pageSize: page.pageSizeMicrons, margins: { marginType: "none" as const } }
        : base;
      await new Promise<void>((resolve, reject) => {
        printWin.webContents.print(printOpts, (success, err) => {
          if (!success) reject(new Error(err || "print failed"));
          else resolve();
        });
      });
    }
  } finally {
    printWin.destroy();
  }
}

export function receiptTextOf(d: ReceiptData, width?: ThermalWidth): string {
  return buildReceiptText(d, width ?? getThermalWidth());
}

export function proformaWithSettings(raw: unknown): ProformaData {
  const receipt = applyTemplateToReceipt("proforma", enrichReceipt(raw));
  return proformaFromReceipt(receipt);
}
