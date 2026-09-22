// Veloria PoS — Electron: printing adapters (Windows).
// Rendu déterministe dans receipt-documents.ts (pur, testé) ; ici : validation,
// imprimante configurée, fenêtre cachée. Les pannes n'arrêtent jamais l'app.

import { dialog, ipcMain, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { log } from "../services/logger";
import { assertSafeUserFolder } from "../security/security";
import { readLogoDataUrlFromFile } from "../services/logo";
import { getDb } from "../database/sqlite.service";
import { IPC_CHANNELS } from "../ipc/channels";
import { prodLicenseDeps } from "../licensing/prod-deps";
import {
  requireLicensedFeature,
  requireLicensedMutation,
  requireLicensedPage,
} from "../licensing/license-service";
import {
  labelsPayloadSchema,
  pdfFilePathSchema,
  printerSaveSchema,
  printPayloadSchema,
  reportPayloadSchema,
} from "../ipc/validators";
import {
  buildA4Html,
  buildLabelsHtml,
  buildProformaA4Html,
  buildProformaText,
  buildReceiptText,
  buildReportHtml,
  escapePreText,
  proformaFromReceipt,
  toReceiptData,
  toReportData,
  type LabelItem,
  type ProformaData,
  type ReceiptData,
} from "./receipt-documents";

function validationError(): { ok: false; code: string; message: string } {
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    message: "Document d'impression invalide.",
  };
}

function isValidationError(err: unknown): boolean {
  return err instanceof Error && err.name === "ZodError";
}

function unavailable(message: string): { ok: false; code: string; message: string } {
  return { ok: false, code: "PRINTER_UNAVAILABLE", message };
}

/**
 * Garde capabilities d'impression (§11) : vérifiée dans le main sur le
 * payload signé. Au moins une page de `pages` suffit ; `feature` requise.
 * Retourne null si autorisé, sinon un outcome FR (jamais d'exception brute).
 */
function guardPrint(
  feature: string,
  pages: readonly string[],
): { ok: false; code: string; message: string } | null {
  try {
    const deps = prodLicenseDeps();
    let pageOk = false;
    let lastErr: unknown = null;
    for (const page of pages) {
      try {
        requireLicensedPage(deps, page);
        pageOk = true;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!pageOk) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error("Fonction non disponible dans votre licence. Contactez votre fournisseur.");
    }
    requireLicensedFeature(deps, feature);
    return null;
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Fonction protégée : activez Veloria POS avec une licence valide.";
    const code = /n'est pas incluse/i.test(msg)
      ? "FEATURE_NOT_LICENSED"
      : /non disponible dans votre licence/i.test(msg)
        ? "PAGE_NOT_LICENSED"
        : "LICENSE_REQUIRED";
    log("WARN", "printing", "license.denied", { error: msg });
    return { ok: false, code, message: msg };
  }
}

export function saveSelectedPrinterName(name: string | null, now: string): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('printer', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    )
    .run(JSON.stringify({ name }), now);
}

/** Imprimante configurée (Paramètres) ou null = imprimante par défaut du système. */
// P07: panne n'arrête jamais la caisse, mais journalisée (plus de catch muet).
export function getSelectedPrinterName(): string | null {
  try {
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = 'printer'`)
      .get() as { value_json: string } | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.value_json) as { name?: string | null };
    return typeof parsed.name === "string" && parsed.name.length > 0 ? parsed.name : null;
  } catch (err) {
    log("WARN", "printing", "printerSettings.unreadable", { error: String(err) });
    return null;
  }
}

function printOptions(): { silent: boolean; deviceName?: string } {
  const deviceName = getSelectedPrinterName();
  let silent = true;
  try {
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = 'printing'`)
      .get() as { value_json: string } | undefined;
    if (row) silent = (JSON.parse(row.value_json) as { silent?: boolean }).silent !== false;
  } catch (err) {
    log("WARN", "printing", "printingSettings.unreadable", { error: String(err) });
  }
  return deviceName ? { silent, deviceName } : { silent };
}

/** Réglages facture (logo, soldes, pied de page) appliqués aux charges utiles. */
function applyInvoiceSettings(d: ReceiptData): ReceiptData {
  let cfg: {
    showLogo?: boolean;
    showCustomerBalance?: boolean;
    showPreviousBalance?: boolean;
    footerText?: string;
    thankYouMessage?: string;
  } = {};
  try {
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = 'invoice'`)
      .get() as { value_json: string } | undefined;
    if (row) cfg = JSON.parse(row.value_json) as typeof cfg;
  } catch (err) {
    log("WARN", "printing", "invoiceSettings.unreadable", { error: String(err) });
  }
  return {
    ...d,
    companyLogo: cfg.showLogo === false ? "" : d.companyLogo,
    prevBalanceMinor: cfg.showPreviousBalance === false ? undefined : d.prevBalanceMinor,
    currentBalanceMinor: cfg.showCustomerBalance === false ? undefined : d.currentBalanceMinor,
    footerText: typeof cfg.footerText === "string" ? cfg.footerText : "",
    thankYouMessage: typeof cfg.thankYouMessage === "string" ? cfg.thankYouMessage : "",
  };
}

async function printHtml(html: string, waitMs: number): Promise<void> {
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
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await loaded;
    await new Promise<void>((resolve, reject) => {
      printWin.webContents.print(printOptions(), (success, err) => {
        if (!success) reject(new Error(err || "print failed"));
        else resolve();
      });
    });
  } finally {
    printWin.destroy();
  }
}

function receiptTextOf(d: ReceiptData): string {
  return buildReceiptText(d);
}

/** Nom de fichier PDF sûr dérivé du nº de facture (`FAC-2026-00001` → tel quel). */
function safeInvoiceFileName(invoice: string, suffix: string): string {
  const clean = invoice.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "document";
  return `${clean}-${suffix}.pdf`;
}

/**
 * Export PDF (requête 4) : même pipeline de rendu que l'impression, sortie
 * `printToPDF` au lieu d'imprimante. Sans `filePath` explicite : dialogue
 * natif d'enregistrement (dossier Documents, nom pré-rempli). Avec
 * `filePath` (tests/automatisation) : validé strictement — absolu,
 * extension .pdf, dossier parent via `assertSafeUserFolder` (fail-closed,
 * jamais d'écriture hors dossier sûr).
 */
async function exportDocumentPdf(
  getMainWindow: () => BrowserWindow | null,
  args: {
    html: string;
    waitMs: number;
    defaultName: string;
    explicitPath: string | null;
    pageSize: "A4" | { width: number; height: number };
  },
): Promise<{ saved: boolean; path: string | null }> {
  const { BrowserWindow: BW } = await import("electron");
  let target: string | null = null;
  if (args.explicitPath) {
    const p = path.normalize(args.explicitPath);
    if (!path.isAbsolute(p) || !p.toLowerCase().endsWith(".pdf")) {
      throw new Error("Chemin de fichier PDF invalide.");
    }
    // Dossier parent validé (système/réseau/racine refusés) avant écriture.
    assertSafeUserFolder(path.dirname(p));
    target = p;
  } else {
    const win = getMainWindow();
    const saveOpts = {
      title: "Exporter en PDF",
      defaultPath: args.defaultName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    };
    const chosen = win
      ? await dialog.showSaveDialog(win, saveOpts)
      : await dialog.showSaveDialog(saveOpts);
    if (chosen.canceled || !chosen.filePath) return { saved: false, path: null };
    target = chosen.filePath;
  }
  const pdfWin = new BW({
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
      pdfWin.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    } catch {
      /* session indisponible en test */
    }
    pdfWin.webContents.on("will-navigate", (event) => event.preventDefault());
    pdfWin.webContents.on("will-redirect", (event) => event.preventDefault());
    pdfWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    const loaded = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.max(args.waitMs, 1500));
      pdfWin.webContents.once("did-finish-load", () => {
        clearTimeout(timer);
        setTimeout(resolve, Math.min(args.waitMs, 300));
      });
    });
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(args.html)}`);
    await loaded;
    const data =
      args.pageSize === "A4"
        ? await pdfWin.webContents.printToPDF({ pageSize: "A4", printBackground: true })
        : await pdfWin.webContents.printToPDF({
            pageSize: args.pageSize,
            printBackground: true,
          });
    fs.writeFileSync(target, data);
    log("INFO", "printing", "pdf.exported", { file: target, bytes: data.length });
    return { saved: true, path: target };
  } finally {
    pdfWin.destroy();
  }
}

/** Double garde export : format (papier) + `pdf-export` (capability dédiée). */
function guardPdfExport(
  formatFeature: string,
  pages: readonly string[],
): { ok: false; code: string; message: string } | null {
  const denied = guardPrint(formatFeature, pages);
  if (denied) return denied;
  try {
    requireLicensedFeature(prodLicenseDeps(), "pdf-export");
    return null;
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Cette fonction n'est pas incluse dans votre licence.";
    log("WARN", "printing", "pdf.license_denied", { error: msg });
    return {
      ok: false,
      code: /n'est pas incluse/i.test(msg) ? "FEATURE_NOT_LICENSED" : "LICENSE_REQUIRED",
      message: msg,
    };
  }
}

/**
 * PRINTING FAIL-CLOSED (§20) : si une imprimante est CONFIGURÉE par
 * l'opérateur mais introuvable (renommée/débranchée), on REFUSE avec un
 * message FR explicite au lieu d'imprimer silencieusement ailleurs.
 * Sans imprimante configurée, l'imprimante par défaut du système reste le
 * choix explicite (aucun changement pour les postes standards).
 */
async function assertConfiguredPrinterAvailable(
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  const configured = getSelectedPrinterName();
  if (!configured) return;
  const win = getMainWindow();
  if (!win) throw new Error("Fenêtre d'impression indisponible.");
  let names: string[];
  try {
    const list = await win.webContents.getPrintersAsync();
    names = list.map((p) => p.name);
  } catch {
    throw new Error(`Imprimante « ${configured} » inaccessible : vérifiez l'imprimante.`);
  }
  if (!names.includes(configured)) {
    throw new Error(
      `Imprimante « ${configured} » introuvable : rebranchez-la ou choisissez-en une autre dans Paramètres.`,
    );
  }
}

/** Logo entreprise en data URL (meilleur effort, aperçu + impression). */
function withLogo(d: ReceiptData): ReceiptData {
  try {
    const row = getDb().prepare(`SELECT logo_path FROM company_profile WHERE id = 1`).get() as
      | { logo_path: string | null }
      | undefined;
    const dataUrl = readLogoDataUrlFromFile(row?.logo_path);
    return dataUrl ? { ...d, companyLogo: dataUrl } : d;
  } catch (err) {
    log("WARN", "printing", "logo.unreadable", { error: String(err) });
    return d;
  }
}

/**
 * Identité légale (RC/NIF) complétée depuis la fiche entreprise quand le
 * payload ne les porte pas (caisse) — meilleur effort, mentions légales.
 */
function withCompanyIdentity(d: ReceiptData): ReceiptData {
  if (d.companyRc && d.companyNif) return d;
  try {
    const row = getDb().prepare(`SELECT rc_number, nif FROM company_profile WHERE id = 1`).get() as
      | { rc_number: string | null; nif: string | null }
      | undefined;
    return {
      ...d,
      companyRc: d.companyRc || row?.rc_number || "",
      companyNif: d.companyNif || row?.nif || "",
    };
  } catch {
    return d;
  }
}

/** Devis avec logo + identité + réglages facture (même pipeline que les factures). */
// P09: pipeline unique logo+réglages+identité — les 4 handlers factures/tickets
// passent par enrichReceipt (plus de bloc répété à dériver).
function enrichReceipt(raw: unknown): ReceiptData {
  return withCompanyIdentity(
    applyInvoiceSettings(withLogo(toReceiptData(printPayloadSchema.parse(raw)))),
  );
}

function proformaWithSettings(raw: unknown): ProformaData {
  const receipt = enrichReceipt(raw);
  return proformaFromReceipt(receipt);
}

function thermalHtml(text: string): string {
  // P28: échappement central (escapePreText), pas un replace partiel.
  return `<pre style="font-family:monospace;width:280px">${escapePreText(text)}</pre>`;
}

export function registerPrintingIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS["printing.listPrinters"], async (event) => {
    try {
      const contents = event.sender;
      const printers = await contents.getPrintersAsync();
      return {
        ok: true,
        data: {
          printers: printers.map((p) => ({
            name: p.name,
            isDefault: (p as unknown as { isDefault?: boolean }).isDefault ?? false,
          })),
          selected: getSelectedPrinterName(),
        },
      };
    } catch (err) {
      log("ERROR", "printing", "list.failed", { error: String(err) });
      return { ok: false, code: "PRINTER_UNAVAILABLE", message: "Imprimante indisponible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printReceipt"], async (_e, raw: unknown) => {
    const denied = guardPrint("receipt-80mm", ["sales"]);
    if (denied) return denied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const d = enrichReceipt(raw);
      await printHtml(thermalHtml(receiptTextOf(d)), 300);
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "print.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression. Vérifiez l'imprimante.");
    }
  });

  // Aperçu avant impression (source unique : builders main, pas de doublon renderer).
  ipcMain.handle(IPC_CHANNELS["printing.preview"], (_e, raw: unknown) => {
    const denied = guardPrint("receipt-80mm", ["sales"]);
    if (denied) return denied;
    try {
      const d = enrichReceipt(raw);
      return { ok: true, data: { text80: receiptTextOf(d), htmlA4: buildA4Html(d) } };
    } catch (err) {
      log("ERROR", "printing", "preview.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return { ok: false, code: "PREVIEW_FAILED", message: "Aperçu impossible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printA4"], async (_e, raw: unknown) => {
    const denied = guardPrint("invoice-a4", ["invoices", "sales"]);
    if (denied) return denied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const html = buildA4Html(enrichReceipt(raw));
      await printHtml(html, 400);
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "printA4.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression A4. Vérifiez l'imprimante.");
    }
  });

  // Aperçu devis (80mm + A4) avant impression.
  ipcMain.handle(IPC_CHANNELS["printing.previewProforma"], (_e, raw: unknown) => {
    const denied = guardPrint("proformas", ["proformas"]);
    if (denied) return denied;
    try {
      const d = proformaWithSettings(raw);
      return { ok: true, data: { text80: buildProformaText(d), htmlA4: buildProformaA4Html(d) } };
    } catch (err) {
      log("ERROR", "printing", "previewProforma.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return { ok: false, code: "PREVIEW_FAILED", message: "Aperçu du devis impossible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printProformaA4"], async (_e, raw: unknown) => {
    const denied = guardPrint("invoice-a4", ["proformas"]);
    if (denied) return denied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const html = buildProformaA4Html(proformaWithSettings(raw));
      await printHtml(html, 400);
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "printProformaA4.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression du devis. Vérifiez l'imprimante.");
    }
  });

  ipcMain.handle(IPC_CHANNELS["printer.get"], () => {
    try {
      return { ok: true, data: { name: getSelectedPrinterName() } };
    } catch (err) {
      log("ERROR", "printing", "selectedGet.failed", { error: String(err) });
      return { ok: false, code: "UNKNOWN_ERROR", message: "Imprimante indisponible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printer.save"], (_e, raw: unknown) => {
    // EL-22: écriture de configuration — même garde que settings.save
    // (poste non activé/expiré ne persiste pas l'imprimante).
    try {
      requireLicensedMutation(prodLicenseDeps());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Licence requise.";
      log("WARN", "printing", "printerSave.denied", { error: msg });
      return { ok: false, code: "LICENSE_REQUIRED", message: msg };
    }
    try {
      const input = printerSaveSchema.parse(raw ?? {});
      saveSelectedPrinterName(input.name, new Date().toISOString());
      return { ok: true, data: { saved: true } };
    } catch (err) {
      log("ERROR", "printing", "selectedSave.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return { ok: false, code: "UNKNOWN_ERROR", message: "Enregistrement impossible." };
    }
  });

  // Rapport générique (tableaux de bord validés, reconstruits côté main).
  ipcMain.handle(IPC_CHANNELS["printing.previewReport"], (_e, raw: unknown) => {
    const denied = guardPrint("advanced-reports", ["reports"]);
    if (denied) return denied;
    try {
      const d = toReportData(reportPayloadSchema.parse(raw));
      return { ok: true, data: { htmlA4: buildReportHtml(d) } };
    } catch (err) {
      log("ERROR", "printing", "previewReport.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return { ok: false, code: "PREVIEW_FAILED", message: "Aperçu du rapport impossible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printReport"], async (_e, raw: unknown) => {
    const denied = guardPrint("advanced-reports", ["reports"]);
    if (denied) return denied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const html = buildReportHtml(toReportData(reportPayloadSchema.parse(raw)));
      await printHtml(html, 400);
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "printReport.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression du rapport. Vérifiez l'imprimante.");
    }
  });

  // Étiquettes code-barres (planche A4 : aperçu = impression).
  // BL-24 + §21 LABEL MEMORY LIMIT: refus explicite au-delà de 200 AU TOTAL
  // (somme copies × articles, vérifiée AVANT expansion — pas de fenêtre où
  // 5000 éléments coexisteraient en mémoire). L'opérateur ajuste au lieu de
  // perdre des étiquettes silencieusement.
  function labelsOf(raw: unknown): LabelItem[] {
    const parsed = labelsPayloadSchema.parse(raw);
    let total = 0;
    for (const it of parsed.items) total += it.copies;
    if (total > 200) {
      throw new Error("Trop d'étiquettes : 200 maximum par planche.");
    }
    const out: LabelItem[] = [];
    for (const it of parsed.items) {
      for (let i = 0; i < it.copies && out.length < 200; i++) {
        out.push({ name: it.name, priceMinor: it.priceMinor, barcode: it.barcode });
      }
    }
    return out;
  }

  ipcMain.handle(IPC_CHANNELS["printing.previewLabels"], (_e, raw: unknown) => {
    const denied = guardPrint("barcode-scanner", ["products"]);
    if (denied) return denied;
    try {
      return { ok: true, data: { htmlA4: buildLabelsHtml(labelsOf(raw)) } };
    } catch (err) {
      log("ERROR", "printing", "labels.preview_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return { ok: false, code: "PREVIEW_FAILED", message: "Aperçu des étiquettes impossible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printLabels"], async (_e, raw: unknown) => {
    const denied = guardPrint("barcode-scanner", ["products"]);
    if (denied) return denied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      await printHtml(buildLabelsHtml(labelsOf(raw)), 400);
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "labels.print_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression des étiquettes. Vérifiez l'imprimante.");
    }
  });

  // Exports PDF (requête 4) : ticket 80mm + facture A4, même rendu validé
  // que l'impression. Double garde : format + `pdf-export`.
  ipcMain.handle(IPC_CHANNELS["printing.exportReceiptPdf"], async (_e, raw: unknown) => {
    const denied = guardPdfExport("receipt-80mm", ["sales"]);
    if (denied) return denied;
    try {
      const input = printPayloadSchema.parse(raw ?? {});
      const { filePath } = pdfFilePathSchema.parse(raw ?? {});
      const d = enrichReceipt(input);
      const res = await exportDocumentPdf(getMainWindow, {
        html: thermalHtml(receiptTextOf(d)),
        waitMs: 300,
        defaultName: safeInvoiceFileName(String(input.invoice || "ticket"), "ticket-80mm"),
        explicitPath: filePath ?? null,
        // 80mm de large (microns) ; hauteur page A4, contenu paginé si long.
        pageSize: { width: 80000, height: 297000 },
      });
      return { ok: true, data: res };
    } catch (err) {
      log("ERROR", "printing", "pdf.receipt_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return {
        ok: false,
        code: "PDF_EXPORT_FAILED",
        message: err instanceof Error ? err.message : "Export PDF impossible.",
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.exportA4Pdf"], async (_e, raw: unknown) => {
    const denied = guardPdfExport("invoice-a4", ["invoices", "sales"]);
    if (denied) return denied;
    try {
      const input = printPayloadSchema.parse(raw ?? {});
      const { filePath } = pdfFilePathSchema.parse(raw ?? {});
      const d = enrichReceipt(input);
      const res = await exportDocumentPdf(getMainWindow, {
        html: buildA4Html(d),
        waitMs: 400,
        defaultName: safeInvoiceFileName(String(input.invoice || "facture"), "facture-A4"),
        explicitPath: filePath ?? null,
        pageSize: "A4",
      });
      return { ok: true, data: res };
    } catch (err) {
      log("ERROR", "printing", "pdf.a4_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return {
        ok: false,
        code: "PDF_EXPORT_FAILED",
        message: err instanceof Error ? err.message : "Export PDF impossible.",
      };
    }
  });

  // Page de test (contenu démo fixe, aucune donnée métier).
  // EL-21: impression physique → même garde que printReceipt (pas d'appel
  // sans receipt-80mm + page sales).
  ipcMain.handle(IPC_CHANNELS["printing.testPage"], async () => {
    const denied = guardPrint("receipt-80mm", ["sales"]);
    if (denied) return denied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      const text = buildReceiptText({
        company: "Veloria",
        companyPhone: "",
        companyAddress: "",
        companyCity: "",
        companyEmail: "",
        companyRc: "",
        companyNif: "",
        companyLogo: "",
        customerName: "",
        customerPhone: "",
        customerAddress: "",
        customerCode: "",
        paymentMethod: "",
        dueDate: "",
        notes: "",
        footerText: "",
        thankYouMessage: "",
        invoice: "TEST",
        date: new Date().toLocaleString("fr-FR"),
        lines: [
          {
            name: "Article de test",
            qty: 1,
            unit: "",
            unitPriceMinor: 10000,
            lineTotalMinor: 10000,
          },
        ],
        subtotalMinor: 10000,
        discountMinor: 0,
        deliveryMinor: 0,
        totalMinor: 10000,
        paidMinor: 10000,
      });
      await printHtml(thermalHtml(`${text}\n[PAGE DE TEST]`), 300);
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "test.failed", { error: String(err) });
      return unavailable("Échec d'impression. Vérifiez l'imprimante.");
    }
  });
}
