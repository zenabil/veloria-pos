// Veloria PoS — Electron: canaux Studio (decoupage printing.service, zero changement).
// Apercu d'un modele + impression test sur echantillons demo.

import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";
import { getTemplate } from "../ipc/handlers/templates.repo";
import { templatePreviewSchema, templateTestPrintSchema } from "../ipc/validators";
import { guardPrint, isValidationError, unavailable, validationError } from "./printing.guards";
import { assertConfiguredPrinterAvailable } from "./printing.printer-settings";
import {
  activeTemplateSettings,
  mergeTemplateMirror,
  printHtml,
  templateRenderOf,
  type TemplateSettings,
} from "./printing.templates";
import { renderTemplateSample } from "./printing.samples";
import { thermalHtml } from "./receipt-documents";

export function registerStudioIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS["templates.preview"], (_e, raw: unknown) => {
    try {
      const input = templatePreviewSchema.parse(raw ?? {});
      const settings = mergeTemplateMirror(input.docType, input.settings);
      const html = renderTemplateSample(
        input.docType,
        settings,
        input.format === "80mm" ? "80mm" : undefined,
      );
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
      if (input.docType === "etiquette" || s.paper === "A4" || s.paper === "A5") {
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
