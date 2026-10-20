// Veloria PoS — Electron: canaux rapports + etiquettes (decoupage printing.service, zero changement).

import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";
import { labelsPayloadSchema, reportPayloadSchema } from "../ipc/validators";
import { guardPrint, isValidationError, unavailable, validationError } from "./printing.guards";
import { enforceRawChannelGates } from "../ipc/raw-guards";
import { assertConfiguredPrinterAvailable } from "./printing.printer-settings";
import { activeTemplateSettings, printHtml, printHtmlPages } from "./printing.templates";
import { qrSvgOf } from "./printing.enrich";
import {
  buildLabelsHtml,
  buildReportHtml,
  labelPageMicrons,
  toReportData,
  type LabelFormat,
  type LabelItem,
} from "./receipt-documents";

// Étiquettes code-barres (gabarits thermiques uniquement — jamais A4 ;
// aperçu = impression). BL-24 + §21 LABEL MEMORY LIMIT: refus explicite
// au-delà de 200 AU TOTAL (somme copies × articles, vérifiée AVANT
// expansion — pas de fenêtre où 5000 éléments coexisteraient en mémoire).
// L'opérateur ajuste au lieu de perdre des étiquettes silencieusement.
export function labelsOf(raw: unknown): {
  items: LabelItem[];
  format: LabelFormat;
  customWidthMm: number;
  customHeightMm: number;
  /** C6-bis : nom du produit affiché (réglage du modèle étiquettes). */
  showName: boolean;
  /** C6-bis : prix affiché (réglage du modèle étiquettes). */
  showPrice: boolean;
} {
  const parsed = labelsPayloadSchema.parse(raw);
  let total = 0;
  for (const it of parsed.items) total += it.copies;
  if (total > 200) {
    throw new Error("Trop d'étiquettes : 200 maximum par lot.");
  }
  // C6 : le modèle étiquette pilote le QR par défaut (payload prioritaire)
  // et l'affichage nom/prix de la planche.
  const tpl = activeTemplateSettings("etiquette");
  const wantQr = parsed.qr || tpl.showQr;
  // C5 : QR opt-in — un SVG par code-barres distinct (cache local).
  const qrCache = new Map<string, string>();
  const qrOf = (barcode: string): string => {
    const hit = qrCache.get(barcode);
    if (hit) return hit;
    const svg = qrSvgOf(barcode, 2);
    qrCache.set(barcode, svg);
    return svg;
  };
  const out: LabelItem[] = [];
  for (const it of parsed.items) {
    for (let i = 0; i < it.copies && out.length < 200; i++) {
      out.push({
        name: it.name,
        priceMinor: it.priceMinor,
        barcode: it.barcode,
        qrSvg: wantQr && it.barcode ? qrOf(it.barcode) : undefined,
      });
    }
  }
  return {
    items: out,
    format: parsed.format,
    customWidthMm: parsed.customWidthMm,
    customHeightMm: parsed.customHeightMm,
    showName: tpl.showProductName,
    showPrice: tpl.showPrice,
  };
}

/** Options de planche étiquettes (gabarit + réglages du modèle) — point unique. */
export function labelOptsOf(l: ReturnType<typeof labelsOf>): {
  format: LabelFormat;
  customWidthMm: number;
  customHeightMm: number;
  showName: boolean;
  showPrice: boolean;
} {
  return {
    format: l.format,
    customWidthMm: l.customWidthMm,
    customHeightMm: l.customHeightMm,
    showName: l.showName,
    showPrice: l.showPrice,
  };
}

export function registerReportsLabelsIpc(getMainWindow: () => BrowserWindow | null): void {
  // Rapport générique (tableaux de bord validés, reconstruits côté main).
  ipcMain.handle(IPC_CHANNELS["printing.previewReport"], (_e, raw: unknown) => {
    const denied = guardPrint("advanced-reports", ["reports"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.previewReport"], raw);
    if (staffDenied) return staffDenied;
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
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.printReport"], raw);
    if (staffDenied) return staffDenied;
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

  ipcMain.handle(IPC_CHANNELS["printing.previewLabels"], (_e, raw: unknown) => {
    const denied = guardPrint("barcode-scanner", ["products"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.previewLabels"], raw);
    if (staffDenied) return staffDenied;
    try {
      const l = labelsOf(raw);
      return {
        ok: true,
        data: {
          html: buildLabelsHtml(l.items, labelOptsOf(l)),
        },
      };
    } catch (err) {
      log("ERROR", "printing", "labels.preview_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return { ok: false, code: "PREVIEW_FAILED", message: "Aperçu des étiquettes impossible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printLabels"], async (_e, raw: unknown) => {
    const denied = guardPrint("barcode-scanner", ["products"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.printLabels"], raw);
    if (staffDenied) return staffDenied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const l = labelsOf(raw);
      // 1 étiquette = 1 job = 1 avance papier (même fenêtre cachée).
      // Plusieurs étiquettes sur une seule page Chromium se retrouvaient
      // sur une page pilote trop grande → 2 demandées = 1 sortie.
      const labelOpts = labelOptsOf(l);
      const microns = labelPageMicrons(labelOpts);
      await printHtmlPages(
        l.items.map((item) => ({
          html: buildLabelsHtml([item], labelOpts),
          pageSizeMicrons: microns,
        })),
        400,
      );
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "labels.print_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression des étiquettes. Vérifiez l'imprimante.");
    }
  });
}
