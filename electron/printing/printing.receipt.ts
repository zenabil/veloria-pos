// Veloria PoS — Electron: canaux ticket de vente (decoupage printing.service).

import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";
import { prodLicenseDeps } from "../licensing/prod-deps";
import { requireLicensedMutation } from "../licensing/license-service";
import { emptyPayloadSchema, printerSaveSchema } from "../ipc/validators";
import { guardPrint, isValidationError, unavailable, validationError } from "./printing.guards";
import { enforceRawChannelGates } from "../ipc/raw-guards";
import {
  assertConfiguredPrinterAvailable,
  getSelectedPrinterName,
  getThermalWidth,
  saveSelectedPrinterName,
} from "./printing.printer-settings";
import { enrichReceipt, receiptCodes } from "./printing.enrich";
import {
  applyTemplateToReceipt,
  printCopies,
  printHtml,
  receiptTextOf,
  templateRenderOf,
  thermalDocumentHtml,
} from "./printing.templates";
import { buildReceiptText, thermalHtml } from "./receipt-documents";

export function registerReceiptIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS["printing.listPrinters"], async (event, raw: unknown) => {
    try {
      // RADICAL-FIX: charge vide validée comme tous les canaux (AGENTS.md §3).
      const input = emptyPayloadSchema.parse(raw ?? {});
      // R1 RADICAL : lecture matériel = permission settings (écran paramètres).
      const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.listPrinters"], input);
      if (staffDenied) return staffDenied;
      const contents = event.sender;
      const printers = await contents.getPrintersAsync();
      return {
        ok: true,
        data: {
          printers: printers.map((p) => ({
            name: p.name,
            isDefault: (p as unknown as { isDefault?: boolean }).isDefault ?? false,
          })),
          selected: getSelectedPrinterName(),
        },
      };
    } catch (err) {
      log("ERROR", "printing", "list.failed", { error: String(err) });
      return { ok: false, code: "PRINTER_UNAVAILABLE", message: "Imprimante indisponible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printReceipt"], async (_e, raw: unknown) => {
    const denied = guardPrint("receipt-80mm", ["sales"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.printReceipt"], raw);
    if (staffDenied) return staffDenied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      await assertConfiguredPrinterAvailable(getMainWindow);
      const d = applyTemplateToReceipt("ticket", enrichReceipt(raw));
      const { settings, width } = templateRenderOf("ticket");
      await printCopies(
        thermalDocumentHtml({
          settings,
          width,
          text: receiptTextOf(d, width),
          codes: receiptCodes(d),
          logo: d.companyLogo,
        }),
        settings.copies,
        300,
      );
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "print.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return unavailable("Échec d'impression. Vérifiez l'imprimante.");
    }
  });

  // Aperçu avant impression (source unique : builders main, pas de doublon renderer).
  // Ticket uniquement : la vente ne sort jamais en A4 (politique opération → format).
  ipcMain.handle(IPC_CHANNELS["printing.preview"], (_e, raw: unknown) => {
    const denied = guardPrint("receipt-80mm", ["sales"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.preview"], raw);
    if (staffDenied) return staffDenied;
    try {
      const t = applyTemplateToReceipt("ticket", enrichReceipt(raw));
      const { width } = templateRenderOf("ticket");
      return { ok: true, data: { text80: receiptTextOf(t, width) } };
    } catch (err) {
      log("ERROR", "printing", "preview.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return { ok: false, code: "PREVIEW_FAILED", message: "Aperçu impossible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printer.get"], (_e, raw: unknown) => {
    try {
      emptyPayloadSchema.parse(raw ?? {});
      return { ok: true, data: { name: getSelectedPrinterName() } };
    } catch (err) {
      log("ERROR", "printing", "selectedGet.failed", { error: String(err) });
      return { ok: false, code: "UNKNOWN_ERROR", message: "Imprimante indisponible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printer.save"], (_e, raw: unknown) => {
    // EL-22: écriture de configuration — même garde que settings.save
    // (poste non activé/expiré ne persiste pas l'imprimante).
    try {
      requireLicensedMutation(prodLicenseDeps());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Licence requise.";
      log("WARN", "printing", "printerSave.denied", { error: msg });
      return { ok: false, code: "LICENSE_REQUIRED", message: msg };
    }
    try {
      const input = printerSaveSchema.parse(raw ?? {});
      // R1 RADICAL : écriture matériel = permission settings (comme settings.save).
      const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printer.save"], input);
      if (staffDenied) return staffDenied;
      saveSelectedPrinterName(input.name, new Date().toISOString(), input.operationId ?? null);
      return { ok: true, data: { saved: true } };
    } catch (err) {
      log("ERROR", "printing", "selectedSave.failed", { error: String(err) });
      if (isValidationError(err)) return validationError();
      return { ok: false, code: "UNKNOWN_ERROR", message: "Enregistrement impossible." };
    }
  });

  // Page de test (contenu démo fixe, aucune donnée métier).
  // EL-21: impression physique → même garde que printReceipt (pas d'appel
  // sans receipt-80mm + page sales).
  ipcMain.handle(IPC_CHANNELS["printing.testPage"], async (_e, raw: unknown) => {
    const denied = guardPrint("receipt-80mm", ["sales"]);
    if (denied) return denied;
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["printing.testPage"], raw);
    if (staffDenied) return staffDenied;
    if (!getMainWindow()) return unavailable("Fenêtre d'impression indisponible.");
    try {
      emptyPayloadSchema.parse(raw ?? {});
      const width = getThermalWidth();
      const text = buildReceiptText({
        company: "Veloria",
        companyPhone: "",
        companyAddress: "",
        companyCity: "",
        companyEmail: "",
        companyRc: "",
        companyNif: "",
        companyLogo: "",
        customerName: "",
        customerPhone: "",
        customerAddress: "",
        customerCode: "",
        paymentMethod: "",
        dueDate: "",
        notes: "",
        footerText: "",
        thankYouMessage: "",
        invoice: "TEST",
        date: new Date().toLocaleString("fr-FR"),
        lines: [
          {
            name: "Article de test",
            qty: 1,
            unit: "",
            unitPriceMinor: 10000,
            lineTotalMinor: 10000,
          },
        ],
        subtotalMinor: 10000,
        discountMinor: 0,
        deliveryMinor: 0,
        totalMinor: 10000,
        paidMinor: 10000,
      });
      await printHtml(
        thermalHtml(`${text}\n[PAGE DE TEST ${width} — N&B]`, width, { barcode: "TEST" }),
        300,
      );
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "test.failed", { error: String(err) });
      return unavailable("Échec d'impression. Vérifiez l'imprimante.");
    }
  });
}
