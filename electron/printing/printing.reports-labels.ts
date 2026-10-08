// Veloria PoS — Electron: canaux rapports + etiquettes (decoupage printing.service, zero changement).

import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";
import { labelsPayloadSchema, reportPayloadSchema } from "../ipc/validators";
import { guardPrint, isValidationError, unavailable, validationError } from "./printing.guards";
import { assertConfiguredPrinterAvailable } from "./printing.printer-settings";
import { activeTemplateSettings, printHtml } from "./printing.templates";
import { qrSvgOf } from "./printing.enrich";
import {
  buildLabelsHtml,
  buildReportHtml,
  toReportData,
  type LabelItem,
} from "./receipt-documents";

// Étiquettes code-barres (formats thermiques + planche A4 : aperçu = impression).
// BL-24 + §21 LABEL MEMORY LIMIT: refus explicite au-delà de 200 AU TOTAL
// (somme copies × articles, vérifiée AVANT expansion — pas de fenêtre où
// 5000 éléments coexisteraient en mémoire). L'opérateur ajuste au lieu de
// perdre des étiquettes silencieusement.
export function labelsOf(raw: unknown): {
  items: LabelItem[];
  format: "30x20" | "50x30" | "58x40" | "A4-24" | "custom";
  customWidthMm: number;
  customHeightMm: number;
} {
  const parsed = labelsPayloadSchema.parse(raw);
  let total = 0;
  for (const it of parsed.items) total += it.copies;
  if (total > 200) {
    throw new Error("Trop d'étiquettes : 200 maximum par planche.");
  }
  // C6 : le modèle étiquette peut activer le QR par défaut (payload prioritaire).
  const tplQr = activeTemplateSettings("etiquette").showQr;
  const wantQr = parsed.qr || tplQr;
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
  };
}

export function registerReportsLabelsIpc(getMainWindow: () => BrowserWindow | null): void {
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

  ipcMain.handle(IPC_CHANNELS["printing.previewLabels"], (_e, raw: unknown) => {
    const denied = guardPrint("barcode-scanner", ["products"]);
    if (denied) return denied;
    try {
      const l = labelsOf(raw);
      return {
        ok: true,
        data: {
          htmlA4: buildLabelsHtml(l.items, {
            format: l.format,
            customWidthMm: l.customWidthMm,
            customHeightMm: l.customHeightMm,
          }),
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
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const l = labelsOf(raw);
      await printHtml(
        buildLabelsHtml(l.items, {
          format: l.format,
          customWidthMm: l.customWidthMm,
          customHeightMm: l.customHeightMm,
        }),
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
