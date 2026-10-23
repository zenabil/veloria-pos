// Veloria PoS — Electron: canaux logistiques (decoupage printing.service).
// Aperçu + impression ticket 58/80mm uniquement (jamais A4) — politique
// opération → format : livraison / retour / bon de commande.

import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";
import {
  deliveryPayloadSchema,
  purchaseOrderDocPayloadSchema,
  returnSlipPayloadSchema,
} from "../ipc/validators";
import { guardPrint, isValidationError, unavailable, validationError } from "./printing.guards";
import { enforceRawChannelGates } from "../ipc/raw-guards";
import { assertConfiguredPrinterAvailable, getThermalWidth } from "./printing.printer-settings";
import {
  applyTemplateToReceipt,
  printCopies,
  printHtml,
  templateRenderOf,
} from "./printing.templates";
import { applyInvoiceSettings, withCompanyIdentity, withLogo, withQr } from "./printing.enrich";
import {
  buildDeliveryText,
  buildDeliveryTicketHtml,
  buildPurchaseOrderText,
  buildQrPayload,
  buildReturnSlipText,
  buildReturnSlipTicketHtml,
  thermalHtml,
  toReceiptData,
} from "./receipt-documents";

// P0-3 : documents logistiques — aperçu + impression ticket uniquement.
// Chaque thermique porte le Code 39 (N° du document) + le QR.
function logiCodes(
  d: import("./receipt-documents").LogisticsDocData,
  invoice: string,
): {
  barcode: string;
  qrSvg: string;
  qrPayload: string;
} {
  if (d.qrOff === true)
    return { barcode: d.codesOff === true ? "" : invoice, qrSvg: "", qrPayload: "" };
  return {
    barcode: d.codesOff === true ? "" : invoice,
    qrSvg: d.qrSvg ?? "",
    qrPayload: d.qrPayload || buildQrPayload({ ...d, invoice }),
  };
}
function logisticsOf(
  raw: unknown,
  kind: "delivery" | "return" | "po",
): import("./receipt-documents").LogisticsDocData {
  if (kind === "delivery") {
    const parsed = deliveryPayloadSchema.parse(raw);
    const enriched = withQr(
      withCompanyIdentity(applyInvoiceSettings(withLogo(toReceiptData(parsed)))),
    );
    return applyTemplateToReceipt(
      "bon_livraison",
      enriched,
    ) as import("./receipt-documents").LogisticsDocData;
  }
  if (kind === "return") {
    const parsed = returnSlipPayloadSchema.parse(raw);
    const base = applyTemplateToReceipt(
      "avoir",
      withQr(withCompanyIdentity(applyInvoiceSettings(withLogo(toReceiptData(parsed))))),
    );
    return {
      ...base,
      returnNumber: parsed.returnNumber,
      originNumber: parsed.originNumber,
      reason: parsed.reason,
      refundMinor: parsed.refundMinor,
    };
  }
  const parsed = purchaseOrderDocPayloadSchema.parse(raw);
  const base = withQr(withCompanyIdentity(applyInvoiceSettings(withLogo(toReceiptData(parsed)))));
  return {
    ...base,
    orderNumber: parsed.orderNumber,
    supplierName: parsed.supplierName,
    supplierPhone: parsed.supplierPhone,
    supplierAddress: parsed.supplierAddress,
    validityDays: parsed.validityDays,
  };
}

export function registerLogisticsIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS["printing.previewDelivery"], (_e, raw: unknown) => {
    const denied = guardPrint("invoice-a4", ["sales", "invoices"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.previewDelivery"], raw);
    if (staffDenied) return staffDenied;
    try {
      const d = logisticsOf(raw, "delivery");
      const { width } = templateRenderOf("bon_livraison");
      return {
        ok: true,
        data: {
          text80: buildDeliveryText(d, width),
          html80: buildDeliveryTicketHtml(d, width, logiCodes(d, d.invoice)),
        },
      };
    } catch (err) {
      log("ERROR", "printing", "previewDelivery.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return {
        ok: false,
        code: "PREVIEW_FAILED",
        message: "Aperçu du bon de livraison impossible.",
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printDelivery"], async (_e, raw: unknown) => {
    const denied = guardPrint("invoice-a4", ["sales", "invoices"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.printDelivery"], raw);
    if (staffDenied) return staffDenied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const d = logisticsOf(raw, "delivery");
      const { settings, width } = templateRenderOf("bon_livraison");
      await printCopies(
        buildDeliveryTicketHtml(d, width, logiCodes(d, d.invoice), settings.thermalFontPx),
        settings.copies,
        300,
        { thermalWidth: width },
      );
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "printDelivery.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression du bon de livraison. Vérifiez l'imprimante.");
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.previewReturnSlip"], (_e, raw: unknown) => {
    const denied = guardPrint("receipt-80mm", ["returns"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.previewReturnSlip"], raw);
    if (staffDenied) return staffDenied;
    try {
      const d = logisticsOf(raw, "return");
      const { width } = templateRenderOf("avoir");
      return {
        ok: true,
        data: {
          text80: buildReturnSlipText(d, width),
          html80: buildReturnSlipTicketHtml(d, width, logiCodes(d, d.returnNumber || d.invoice)),
        },
      };
    } catch (err) {
      log("ERROR", "printing", "previewReturn.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return { ok: false, code: "PREVIEW_FAILED", message: "Aperçu du bon de retour impossible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printReturnSlip"], async (_e, raw: unknown) => {
    const denied = guardPrint("receipt-80mm", ["returns"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.printReturnSlip"], raw);
    if (staffDenied) return staffDenied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const d = logisticsOf(raw, "return");
      const { settings, width } = templateRenderOf("avoir");
      await printCopies(
        buildReturnSlipTicketHtml(
          d,
          width,
          logiCodes(d, d.returnNumber || d.invoice),
          settings.thermalFontPx,
        ),
        settings.copies,
        300,
        { thermalWidth: width },
      );
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "printReturn.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression du bon de retour. Vérifiez l'imprimante.");
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.previewPO"], (_e, raw: unknown) => {
    const denied = guardPrint("invoice-a4", ["suppliers"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.previewPO"], raw);
    if (staffDenied) return staffDenied;
    try {
      const d = logisticsOf(raw, "po");
      return {
        ok: true,
        data: { text80: buildPurchaseOrderText(d, getThermalWidth()) },
      };
    } catch (err) {
      log("ERROR", "printing", "previewPO.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return {
        ok: false,
        code: "PREVIEW_FAILED",
        message: "Aperçu du bon de commande impossible.",
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printPO"], async (_e, raw: unknown) => {
    const denied = guardPrint("invoice-a4", ["suppliers"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.printPO"], raw);
    if (staffDenied) return staffDenied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const d = logisticsOf(raw, "po");
      const width = getThermalWidth();
      await printHtml(
        thermalHtml(
          buildPurchaseOrderText(d, width),
          width,
          logiCodes(d, d.orderNumber || d.invoice),
        ),
        300,
        { thermalWidth: width },
      );
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "printPO.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression du bon de commande. Vérifiez l'imprimante.");
    }
  });
}
