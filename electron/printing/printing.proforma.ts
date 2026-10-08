// Veloria PoS — Electron: canaux devis (decoupage printing.service, zero changement).

import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";
import { guardPrint, isValidationError, unavailable, validationError } from "./printing.guards";
import { assertConfiguredPrinterAvailable } from "./printing.printer-settings";
import {
  pageOptsOf,
  printCopies,
  proformaWithSettings,
  renderCopies,
  templateRenderOf,
} from "./printing.templates";
import { buildProformaA4Html, buildProformaText, thermalHtml } from "./receipt-documents";

export function registerProformaIpc(getMainWindow: () => BrowserWindow | null): void {
  // Aperçu devis (80mm + A4) avant impression.
  ipcMain.handle(IPC_CHANNELS["printing.previewProforma"], (_e, raw: unknown) => {
    const denied = guardPrint("proformas", ["proformas"]);
    if (denied) return denied;
    try {
      const d = proformaWithSettings(raw);
      const { width } = templateRenderOf("proforma");
      return {
        ok: true,
        data: {
          text80: buildProformaText(d, width),
          htmlA4: buildProformaA4Html(d, pageOptsOf("proforma")),
        },
      };
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
      const html = buildProformaA4Html(proformaWithSettings(raw), pageOptsOf("proforma"));
      await printCopies(html, renderCopies("proforma"), 400);
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "printProformaA4.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression du devis. Vérifiez l'imprimante.");
    }
  });

  // Devis thermique 80mm (le texte existait sans canal : buildProformaText
  // orphelin — désormais imprimable comme le ticket de caisse).
  ipcMain.handle(IPC_CHANNELS["printing.printProforma80mm"], async (_e, raw: unknown) => {
    const denied = guardPrint("proformas", ["proformas"]);
    if (denied) return denied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const proforma = proformaWithSettings(raw);
      const { settings, width } = templateRenderOf("proforma");
      await printCopies(
        thermalHtml(
          buildProformaText(proforma, width),
          width,
          settings.showCodes
            ? {
                barcode: proforma.number,
                qrSvg: proforma.qrSvg ?? "",
                qrPayload: proforma.qrPayload || "",
              }
            : { barcode: "", qrSvg: "", qrPayload: "" },
          settings.thermalFontPx,
        ),
        settings.copies,
        300,
      );
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "printProforma80.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression du devis. Vérifiez l'imprimante.");
    }
  });
}
