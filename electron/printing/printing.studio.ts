// Veloria PoS — Electron: canaux Studio (decoupage printing.service).
// Apercu d'un modele + impression test sur echantillons demo.

import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";
import { getTemplate } from "../ipc/handlers/templates.repo";
import { templatePreviewSchema, templateTestPrintSchema } from "../ipc/validators";
import { guardPrint, isValidationError, unavailable, validationError } from "./printing.guards";
import { enforceRawChannelGates } from "../ipc/raw-guards";
import { assertConfiguredPrinterAvailable } from "./printing.printer-settings";
import {
  activeTemplateSettings,
  mergeTemplateMirror,
  printHtml,
  templateRenderOf,
  type TemplateSettings,
} from "./printing.templates";
import { renderTemplateSample } from "./printing.samples";
import {
  LABEL_FORMATS,
  labelPageMicrons,
  thermalHtml,
  type LabelFormat,
} from "./receipt-documents";

/** Papier modèle → gabarit étiquette (défaut 58×30 si valeur inattendue). */
function labelFormatOf(paper: string): LabelFormat {
  return (LABEL_FORMATS as readonly string[]).includes(paper) ? (paper as LabelFormat) : "58x30";
}

export function registerStudioIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS["templates.preview"], (_e, raw: unknown) => {
    try {
      const input = templatePreviewSchema.parse(raw ?? {});
      // R1 RADICAL : studio = permission settings (comme templates.save).
      const staffDenied = enforceRawChannelGates(IPC_CHANNELS["templates.preview"], input);
      if (staffDenied) return staffDenied;
      const settings = mergeTemplateMirror(input.docType, input.settings);
      const html = renderTemplateSample(input.docType, settings);
      return { ok: true, data: html };
    } catch (err) {
      log("ERROR", "printing", "templatePreview.failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      if (isValidationError(err)) return validationError();
      return { ok: false, code: "PREVIEW_FAILED", message: "Aperçu du modèle impossible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["templates.testPrint"], async (_e, raw: unknown) => {
    const denied = guardPrint("receipt-80mm", ["sales"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["templates.testPrint"], raw);
    if (staffDenied) return staffDenied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      const input = templateTestPrintSchema.parse(raw ?? {});
      let override: TemplateSettings | undefined;
      if (input.templateId != null) {
        const row = getTemplate(input.templateId);
        override = mergeTemplateMirror(row.doc_type, row.settings);
      }
      const s = override ?? activeTemplateSettings(input.docType);
      const html = renderTemplateSample(input.docType, s);
      await assertConfiguredPrinterAvailable(getMainWindow);
      if (input.docType === "etiquette") {
        // Gabarit exact en microns (jamais de planche A4) : 1 étiquette = 1 page.
        const microns = labelPageMicrons({ format: labelFormatOf(s.paper) });
        await printHtml(html.htmlA4, 400, { pageSizeMicrons: microns });
      } else if (s.paper === "A4") {
        // Seul le devis reste en A4 ; tout le reste est thermique 58/80.
        await printHtml(html.htmlA4, 400);
      } else {
        const { width } = templateRenderOf(input.docType);
        await printHtml(
          thermalHtml(
            html.text80,
            width,
            { barcode: "TEST", qrSvg: "", qrPayload: "" },
            s.thermalFontPx,
          ),
          300,
        );
      }
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "templateTestPrint.failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression test. Vérifiez l'imprimante.");
    }
  });
}
