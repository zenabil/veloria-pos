// Veloria PoS — Electron: canaux logistiques (decoupage printing.service, zero changement).

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
  pageOptsOf,
  printCopies,
  printHtml,
  templateRenderOf,
} from "./printing.templates";
import { applyInvoiceSettings, withCompanyIdentity, withLogo, withQr } from "./printing.enrich";
import {
  buildDeliveryHtml,
  buildDeliveryText,
  buildPurchaseOrderHtml,
  buildPurchaseOrderText,
  buildQrPayload,
  buildReturnSlipHtml,
  buildReturnSlipText,
  thermalHtml,
  toReceiptData,
} from "./receipt-documents";

// P0-3 : documents logistiques — aperçu + impression A4/thermique.
// Chaque thermique porte le Code 39 (N° du document) + le QR, comme les A4.
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
          htmlA4: buildDeliveryHtml(d, pageOptsOf("bon_livraison")),
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
      const useA4 = deliveryPayloadSchema.parse(raw).format === "A4";
      const { settings, width } = templateRenderOf("bon_livraison");
      if (useA4)
        await printCopies(buildDeliveryHtml(d, pageOptsOf("bon_livraison")), settings.copies, 400);
      else
        await printCopies(
          thermalHtml(
            buildDeliveryText(d, width),
            width,
            logiCodes(d, d.invoice),
            settings.thermalFontPx,
          ),
          settings.copies,
          300,
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
          htmlA4: buildReturnSlipHtml(d, pageOptsOf("avoir")),
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
      const useA4 = returnSlipPayloadSchema.parse(raw).format === "A4";
      const { settings, width } = templateRenderOf("avoir");
      if (useA4)
        await printCopies(buildReturnSlipHtml(d, pageOptsOf("avoir")), settings.copies, 400);
      else
        await printCopies(
          thermalHtml(
            buildReturnSlipText(d, width),
            width,
            logiCodes(d, d.returnNumber || d.invoice),
            settings.thermalFontPx,
          ),
          settings.copies,
          300,
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
        data: {
          text80: buildPurchaseOrderText(d, getThermalWidth()),
          htmlA4: buildPurchaseOrderHtml(d),
        },
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
      const useA4 = purchaseOrderDocPayloadSchema.parse(raw).format !== "80mm";
      const width = getThermalWidth();
      if (useA4) await printHtml(buildPurchaseOrderHtml(d), 400);
      else
        await printHtml(
          thermalHtml(
            buildPurchaseOrderText(d, width),
            width,
            logiCodes(d, d.orderNumber || d.invoice),
          ),
          300,
        );
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "printPO.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression du bon de commande. Vérifiez l'imprimante.");
    }
  });
}
