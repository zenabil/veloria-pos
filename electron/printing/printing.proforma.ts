// Veloria PoS — Electron: canaux devis (decoupage printing.service).
// Devis = A4 uniquement (jamais de ticket pour un proforma).

import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";
import { guardPrint, isValidationError, unavailable, validationError } from "./printing.guards";
import { enforceRawChannelGates } from "../ipc/raw-guards";
import { assertConfiguredPrinterAvailable } from "./printing.printer-settings";
import { pageOptsOf, printCopies, proformaWithSettings, renderCopies } from "./printing.templates";
import { buildProformaA4Html } from "./receipt-documents";

export function registerProformaIpc(getMainWindow: () => BrowserWindow | null): void {
  // Aperçu devis A4 (seul format autorisé) avant impression.
  ipcMain.handle(IPC_CHANNELS["printing.previewProforma"], (_e, raw: unknown) => {
    const denied = guardPrint("proformas", ["proformas"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.previewProforma"], raw);
    if (staffDenied) return staffDenied;
    try {
      const d = proformaWithSettings(raw);
      return {
        ok: true,
        data: { htmlA4: buildProformaA4Html(d, pageOptsOf("proforma")) },
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
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.printProformaA4"], raw);
    if (staffDenied) return staffDenied;
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
}
