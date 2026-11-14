// Veloria PoS — Electron: canaux export PDF (decoupage printing.service).
// Politique opération → format : ticket PDF pour la vente / le règlement,
// A4 réservé au devis et aux documents administratifs (rapports).

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
  templateRenderOf,
  thermalDocumentHtml,
} from "./printing.templates";
import { companyLogoDataUrl, enrichReceipt, receiptCodes } from "./printing.enrich";
import { paymentOf } from "./printing.payment";
import { labelOptsOf, labelsOf } from "./printing.reports-labels";
import {
  buildLabelsHtml,
  buildProformaA4Html,
  buildReceiptTicketHtml,
  buildReportHtml,
  labelPageMicrons,
  toReportData,
} from "./receipt-documents";

export function registerPdfExportsIpc(getMainWindow: () => BrowserWindow | null): void {
  // Exports PDF : ticket thermique (vente), même rendu validé que l'impression.
  // Double garde : format + `pdf-export`.
  ipcMain.handle(IPC_CHANNELS["printing.exportReceiptPdf"], async (event, raw: unknown) => {
    const denied = guardPdfExport("receipt-80mm", ["sales"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(
      IPC_CHANNELS["printing.exportReceiptPdf"],
      raw,
      event,
    );
    if (staffDenied) return staffDenied;
    try {
      const input = printPayloadSchema.parse(raw ?? {});
      const { filePath } = pdfFilePathSchema.parse(raw ?? {});
      const d = applyTemplateToReceipt("ticket", enrichReceipt(input));
      const { settings, width } = templateRenderOf("ticket");
      const res = await exportDocumentPdf(getMainWindow, {
        // ADR-134 : PDF ticket = exactement le HTML imprimé (design unique).
        html: buildReceiptTicketHtml(d, width, receiptCodes(d), settings.thermalFontPx),
        waitMs: 300,
        defaultName: safeInvoiceFileName(String(input.invoice || "ticket"), "ticket-80mm"),
        explicitPath: filePath ?? null,
        // Page = largeur du rouleau + hauteur RÉELLE du contenu (mesurée) ;
        // le repli garde l'ancien gabarit si la mesure échoue.
        pageSize: { width: width === "58mm" ? 58000 : 80000, height: 297000 },
        thermalWidth: width,
      });
      return { ok: true, data: res };
    } catch (err) {
      log("ERROR", "printing", "pdf.receipt_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return pdfExportFailed(err);
    }
  });

  // Exports PDF manquants (chaque document aperçu/imprimé est exportable) :
  // devis, reçu de règlement, rapport, étiquettes. Même pipeline validé
  // que l'impression + double garde format/pdf-export.
  ipcMain.handle(IPC_CHANNELS["printing.exportProformaPdf"], async (event, raw: unknown) => {
    const denied = guardPdfExport("proformas", ["proformas"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(
      IPC_CHANNELS["printing.exportProformaPdf"],
      raw,
      event,
    );
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

  ipcMain.handle(IPC_CHANNELS["printing.exportPaymentPdf"], async (event, raw: unknown) => {
    const denied = guardPdfExport("receipt-80mm", ["customers", "suppliers", "debts"]);
    if (denied) return denied;
    const staffDeniedPayment = enforceRawChannelGates(
      IPC_CHANNELS["printing.exportPaymentPdf"],
      raw,
      event,
    );
    if (staffDeniedPayment) return staffDeniedPayment;
    try {
      const { filePath } = pdfFilePathSchema.parse(raw ?? {});
      const { text80, codes } = paymentOf(raw);
      const parsed = paymentTicketSchema.parse(raw);
      const { settings, width } = templateRenderOf("recu");
      const res = await exportDocumentPdf(getMainWindow, {
        html: thermalDocumentHtml({
          settings,
          width,
          text: text80,
          codes,
          logo: companyLogoDataUrl(),
        }),
        waitMs: 300,
        defaultName: safeInvoiceFileName(String(parsed.reference || "recu"), "recu"),
        explicitPath: filePath ?? null,
        pageSize: { width: width === "58mm" ? 58000 : 80000, height: 297000 },
        thermalWidth: width,
      });
      return { ok: true, data: res };
    } catch (err) {
      log("ERROR", "printing", "pdf.payment_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return pdfExportFailed(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.exportReportPdf"], async (event, raw: unknown) => {
    const denied = guardPdfExport("advanced-reports", ["reports"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(
      IPC_CHANNELS["printing.exportReportPdf"],
      raw,
      event,
    );
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

  ipcMain.handle(IPC_CHANNELS["printing.exportLabelsPdf"], async (event, raw: unknown) => {
    const denied = guardPdfExport("barcode-scanner", ["products"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(
      IPC_CHANNELS["printing.exportLabelsPdf"],
      raw,
      event,
    );
    if (staffDenied) return staffDenied;
    try {
      const { filePath } = pdfFilePathSchema.parse(raw ?? {});
      const l = labelsOf(raw);
      const pageSize = labelPageMicrons({
        format: l.format,
        customWidthMm: l.customWidthMm,
        customHeightMm: l.customHeightMm,
      });
      const res = await exportDocumentPdf(getMainWindow, {
        html: buildLabelsHtml(l.items, labelOptsOf(l)),
        waitMs: 400,
        defaultName: "etiquettes.pdf",
        explicitPath: filePath ?? null,
        pageSize,
      });
      return { ok: true, data: res };
    } catch (err) {
      log("ERROR", "printing", "pdf.labels_failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return pdfExportFailed(err);
    }
  });
}
