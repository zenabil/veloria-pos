// Veloria PoS — Electron: canaux recus de reglement (decoupage printing.service).

import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";
import { paymentTicketSchema } from "../ipc/validators";
import { guardPrint, isValidationError, unavailable, validationError } from "./printing.guards";
import { enforceRawChannelGates } from "../ipc/raw-guards";
import { assertConfiguredPrinterAvailable } from "./printing.printer-settings";
import { applyTemplateToPayment, printCopies, templateRenderOf } from "./printing.templates";
import {
  applyPaymentSettings,
  withCompanyIdentityPayment,
  withLogoPayment,
} from "./printing.enrich";
import { buildPaymentText, thermalHtml, toPaymentTicketData } from "./receipt-documents";

// Reçu de règlement de dette (ticket تسديد الدين) : aperçu + impression
// ticket 58/80mm uniquement (jamais A4) après encaissement client /
// fournisseur / pain. Garde : ticket 80mm + au moins une page dettes
// (clients/fournisseurs/pain) — le renderer ne peut pas imprimer un
// règlement d'un module non licencié.
export function paymentOf(raw: unknown): {
  text80: string;
  codes: { barcode: string; qrSvg: string; qrPayload: string };
} {
  // Validation Zod d'abord (montants/soldes), normalisation ensuite
  // (null → "" pour les libellés masquables).
  const parsed = paymentTicketSchema.parse(raw);
  const full = withCompanyIdentityPayment(
    applyPaymentSettings(withLogoPayment(toPaymentTicketData(parsed))),
  );
  const base = applyTemplateToPayment(full);
  const qrOn = base.qrOff !== true;
  const qrPayload = qrOn ? `VELORIA|${base.reference || ""}|${base.amountMinor}|${base.date}` : "";
  let qrSvg = "";
  if (qrOn) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("qrcode") as {
        create?: (
          text: string,
          opts?: unknown,
        ) => {
          modules: { size: number; get: (r: number, c: number) => boolean };
        };
      };
      if (typeof mod.create === "function") {
        const qr = mod.create(qrPayload, { errorCorrectionLevel: "M" });
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
        qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="110" height="110" role="img"><rect width="${size}" height="${size}" fill="#fff"/>${rects}</svg>`;
      }
    } catch (err) {
      log("WARN", "printing", "qr.unavailable", { error: String(err) });
    }
  }
  const d = { ...base, qrPayload, qrSvg };
  const codes = { barcode: base.reference || "PAY", qrSvg, qrPayload };
  const { width } = templateRenderOf("recu");
  return {
    text80: buildPaymentText(d, width),
    codes,
  };
}

export function registerPaymentIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS["printing.previewPayment"], (_e, raw: unknown) => {
    const denied = guardPrint("receipt-80mm", ["customers", "suppliers", "debts"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.previewPayment"], raw);
    if (staffDenied) return staffDenied;
    try {
      return { ok: true, data: paymentOf(raw) };
    } catch (err) {
      log("ERROR", "printing", "previewPayment.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return { ok: false, code: "PREVIEW_FAILED", message: "Aperçu du reçu impossible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printPayment"], async (_e, raw: unknown) => {
    const denied = guardPrint("receipt-80mm", ["customers", "suppliers", "debts"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.printPayment"], raw);
    if (staffDenied) return staffDenied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const { text80, codes } = paymentOf(raw);
      const { settings, width } = templateRenderOf("recu");
      const visible = settings.showCodes
        ? codes
        : { barcode: "", qrSvg: codes.qrSvg, qrPayload: codes.qrPayload };
      await printCopies(
        thermalHtml(text80, width, visible, settings.thermalFontPx),
        settings.copies,
        300,
      );
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "printPayment.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression du reçu. Vérifiez l'imprimante.");
    }
  });
}
