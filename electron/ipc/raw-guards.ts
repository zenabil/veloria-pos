// Veloria PoS — IPC: garde centrale pour les handlers BRUTS (backup/printing/ocr).
// Cause racine H1 : ces handlers utilisent ipcMain.handle direct (retours
// métier spécifiques) et contournaient handle() → enforceStaffGates jamais
// appelée. Correctif radical : UN point de passage obligé qui applique les
// mêmes décisions que handle() (staff-gates ; la licence reste vérifiée par
// guardBackup/guardPrint existants, spécifiques au domaine).
// Usage : au début de chaque handler brut, après le parse Zod :
//   const staffDenied = enforceRawChannelGates(CHANNEL, input);
//   if (staffDenied) return staffDenied;
// Jamais d'exception brute vers le renderer : outcome FR.

import { IPC_CHANNELS } from "./channels";
import { enforceStaffGates } from "./staff-gates";

type RawDenied = { ok: false; code: string; message: string };

export function enforceRawChannelGates(channel: string, input: unknown): RawDenied | null {
  try {
    enforceStaffGates(channel, input);
    return null;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Action non autorisée pour cet utilisateur.";
    // Code stable pour le renderer : session manquante vs permission.
    const code = /Session requise/i.test(message) ? "STAFF_SESSION_REQUIRED" : "STAFF_FORBIDDEN";
    return { ok: false, code, message };
  }
}

/** Canaux bruts couverts (garde-fou de revue : tout nouveau handler brut doit s'y ajouter). */
export const RAW_GUARDED_CHANNELS: readonly string[] = [
  IPC_CHANNELS["backup.create"],
  IPC_CHANNELS["backup.export"],
  IPC_CHANNELS["backup.autoSave"],
  IPC_CHANNELS["backup.restore"],
  IPC_CHANNELS["printing.printReceipt"],
  IPC_CHANNELS["printing.preview"],
  IPC_CHANNELS["printing.printA4"],
  IPC_CHANNELS["printing.listPrinters"],
  IPC_CHANNELS["printer.save"],
  IPC_CHANNELS["printing.testPage"],
  IPC_CHANNELS["printing.previewProforma"],
  IPC_CHANNELS["printing.printProformaA4"],
  IPC_CHANNELS["printing.printProforma80mm"],
  IPC_CHANNELS["printing.previewPayment"],
  IPC_CHANNELS["printing.printPayment"],
  IPC_CHANNELS["printing.previewDelivery"],
  IPC_CHANNELS["printing.printDelivery"],
  IPC_CHANNELS["printing.previewReturnSlip"],
  IPC_CHANNELS["printing.printReturnSlip"],
  IPC_CHANNELS["printing.previewPO"],
  IPC_CHANNELS["printing.printPO"],
  IPC_CHANNELS["printing.previewReport"],
  IPC_CHANNELS["printing.printReport"],
  IPC_CHANNELS["printing.previewLabels"],
  IPC_CHANNELS["printing.printLabels"],
  IPC_CHANNELS["printing.exportLabelsPdf"],
  IPC_CHANNELS["printing.exportReceiptPdf"],
  IPC_CHANNELS["printing.exportA4Pdf"],
  IPC_CHANNELS["printing.exportProformaPdf"],
  IPC_CHANNELS["printing.exportPaymentPdf"],
  IPC_CHANNELS["printing.exportReportPdf"],
  IPC_CHANNELS["templates.preview"],
  IPC_CHANNELS["templates.testPrint"],
  IPC_CHANNELS["ocr.selectFile"],
  IPC_CHANNELS["ocr.analyze"],
  IPC_CHANNELS["ocr.cancel"],
  IPC_CHANNELS["ocr.dispose"],
];
