// Veloria PoS — Electron: canaux export PDF (decoupage printing.service, zero changement).

import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";
import {
  paymentTicketSchema,
  pdfFilePathSchema,
  printPayloadSchema,
  reportPayloadSchema,
} from "../ipc/validators";
import { guardPdfExport, isValidationError, validationError } from "./printing.guards";
import { enforceRawChannelGates } from "../ipc/raw-guards";
import { exportDocumentPdf, pdfExportFailed, safeInvoiceFileName } from "./printing.pdf";
import {
  applyTemplateToReceipt,
  pageOptsOf,
  proformaWithSettings,
  receiptTextOf,
  templateRenderOf,
} from "./printing.templates";
import { enrichReceipt, receiptCodes } from "./printing.enrich";
import { paymentOf } from "./printing.payment";
import { labelsOf } from "./printing.reports-labels";
import {
  buildA4Html,
  buildLabelsHtml,
  buildProformaA4Html,
  buildReportHtml,
  thermalHtml,
  toReportData,
} from "./receipt-documents";

export function registerPdfExportsIpc(getMainWindow: () => BrowserWindow | null): void {
  // Exports PDF (requête 4) : ticket 80mm + facture A4, même rendu validé
  // que l'impression. Double garde : format + `pdf-export`.
  ipcMain.handle(IPC_CHANNELS["printing.exportReceiptPdf"], async (_e, raw: unknown) => {
    const denied = guardPdfExport("receipt-80mm", ["sales"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.exportReceiptPdf"], raw);
    if (staffDenied) return staffDenied;
    try {
      const input = printPayloadSchema.parse(raw ?? {});
      const { filePath } = pdfFilePathSchema.parse(raw ?? {});
      const d = applyTemplateToReceipt("ticket", enrichReceipt(input));
      const { settings, width } = templateRenderOf("ticket");
      const res = await exportDocumentPdf(getMainWindow, {
        html: thermalHtml(receiptTextOf(d, width), width, receiptCodes(d), settings.thermalFontPx),
        waitMs: 300,
        defaultName: safeInvoiceFileName(String(input.invoice || "ticket"), "ticket-80mm"),
        explicitPath: filePath ?? null,
        // Largeur thermique réelle (microns) ; hauteur A4, contenu paginé si long.
        pageSize: { width: width === "58mm" ? 58000 : 80000, height: 297000 },
      });
      return { ok: true, data: res };
    } catch (err) {
      log("ERROR", "printing", "pdf.receipt_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return pdfExportFailed(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.exportA4Pdf"], async (_e, raw: unknown) => {
    const denied = guardPdfExport("invoice-a4", ["invoices", "sales"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.exportA4Pdf"], raw);
    if (staffDenied) return staffDenied;
    try {
      const input = printPayloadSchema.parse(raw ?? {});
      const { filePath } = pdfFilePathSchema.parse(raw ?? {});
      const d = applyTemplateToReceipt("facture", enrichReceipt(input));
      const res = await exportDocumentPdf(getMainWindow, {
        html: buildA4Html(d, pageOptsOf("facture")),
        waitMs: 400,
        defaultName: safeInvoiceFileName(String(input.invoice || "facture"), "facture-A4"),
        explicitPath: filePath ?? null,
        pageSize: "A4",
      });
      return { ok: true, data: res };
    } catch (err) {
      log("ERROR", "printing", "pdf.a4_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return pdfExportFailed(err);
    }
  });

  // Exports PDF manquants (chaque document aperçu/imprimé est exportable) :
  // devis, reçu de règlement, rapport, étiquettes. Même pipeline validé
  // que l'impression + double garde format/pdf-export.
  ipcMain.handle(IPC_CHANNELS["printing.exportProformaPdf"], async (_e, raw: unknown) => {
    const denied = guardPdfExport("proformas", ["proformas"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.exportProformaPdf"], raw);
    if (staffDenied) return staffDenied;
    try {
      const input = printPayloadSchema.parse(raw ?? {});
      const { filePath } = pdfFilePathSchema.parse(raw ?? {});
      const d = proformaWithSettings(input);
      const res = await exportDocumentPdf(getMainWindow, {
        html: buildProformaA4Html(d, pageOptsOf("proforma")),
        waitMs: 400,
        defaultName: safeInvoiceFileName(String(input.invoice || "devis"), "devis-A4"),
        explicitPath: filePath ?? null,
        pageSize: "A4",
      });
      return { ok: true, data: res };
    } catch (err) {
      log("ERROR", "printing", "pdf.proforma_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return pdfExportFailed(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.exportPaymentPdf"], async (_e, raw: unknown) => {
    const denied = guardPdfExport("receipt-80mm", ["customers", "suppliers", "debts"]);
    if (denied) return denied;
    const staffDeniedPayment = enforceRawChannelGates(
      IPC_CHANNELS["printing.exportPaymentPdf"],
      raw,
    );
    if (staffDeniedPayment) return staffDeniedPayment;
    try {
      const { filePath } = pdfFilePathSchema.parse(raw ?? {});
      const { text80, htmlA4, codes } = paymentOf(raw);
      const parsed = paymentTicketSchema.parse(raw);
      const useA4 = parsed.format === "A4";
      const { settings, width } = templateRenderOf("recu");
      const res = await exportDocumentPdf(getMainWindow, {
        html: useA4 ? htmlA4 : thermalHtml(text80, width, codes, settings.thermalFontPx),
        waitMs: 300,
        defaultName: safeInvoiceFileName(String(parsed.reference || "recu"), "recu"),
        explicitPath: filePath ?? null,
        pageSize: useA4 ? "A4" : { width: width === "58mm" ? 58000 : 80000, height: 297000 },
      });
      return { ok: true, data: res };
    } catch (err) {
      log("ERROR", "printing", "pdf.payment_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return pdfExportFailed(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.exportReportPdf"], async (_e, raw: unknown) => {
    const denied = guardPdfExport("advanced-reports", ["reports"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.exportReportPdf"], raw);
    if (staffDenied) return staffDenied;
    try {
      const d = toReportData(reportPayloadSchema.parse(raw ?? {}));
      const { filePath } = pdfFilePathSchema.parse(raw ?? {});
      const res = await exportDocumentPdf(getMainWindow, {
        html: buildReportHtml(d),
        waitMs: 400,
        defaultName: safeInvoiceFileName(d.title || "rapport", "rapport-A4"),
        explicitPath: filePath ?? null,
        pageSize: "A4",
      });
      return { ok: true, data: res };
    } catch (err) {
      log("ERROR", "printing", "pdf.report_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return pdfExportFailed(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.exportLabelsPdf"], async (_e, raw: unknown) => {
    const denied = guardPdfExport("barcode-scanner", ["products"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.exportLabelsPdf"], raw);
    if (staffDenied) return staffDenied;
    try {
      const { filePath } = pdfFilePathSchema.parse(raw ?? {});
      const l = labelsOf(raw);
      const res = await exportDocumentPdf(getMainWindow, {
        html: buildLabelsHtml(l.items, {
          format: l.format,
          customWidthMm: l.customWidthMm,
          customHeightMm: l.customHeightMm,
        }),
        waitMs: 400,
        defaultName: "etiquettes-A4.pdf",
        explicitPath: filePath ?? null,
        pageSize: "A4",
      });
      return { ok: true, data: res };
    } catch (err) {
      log("ERROR", "printing", "pdf.labels_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return pdfExportFailed(err);
    }
  });
}
