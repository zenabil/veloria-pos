// Veloria PoS — Electron: composition d'impression (decoupage, zero changement).
// Source unique des canaux : les register* ci-dessous. Memes exports publics,
// memes canaux IPC, memes schemas Zod, memes messages FR.

import type { BrowserWindow } from "electron";
import { registerReceiptIpc } from "./printing.receipt";
import { registerProformaIpc } from "./printing.proforma";
import { registerReportsLabelsIpc } from "./printing.reports-labels";
import { registerPaymentIpc } from "./printing.payment";
import { registerLogisticsIpc } from "./printing.logistics";
import { registerPdfExportsIpc } from "./printing.pdf-exports";
import { registerStudioIpc } from "./printing.studio";
export {
  getSelectedPrinterName,
  getThermalWidth,
  saveSelectedPrinterName,
} from "./printing.printer-settings";
export {
  activeTemplateSettings,
  mergeTemplateMirror,
  pageOptsOf,
  templateRenderOf,
} from "./printing.templates";

/** Enregistre tous les canaux d'impression (memes canaux qu'avant decoupe). */
export function registerPrintingIpc(getMainWindow: () => BrowserWindow | null): void {
  registerReceiptIpc(getMainWindow);
  registerProformaIpc(getMainWindow);
  registerReportsLabelsIpc(getMainWindow);
  registerPaymentIpc(getMainWindow);
  registerLogisticsIpc(getMainWindow);
  registerPdfExportsIpc(getMainWindow);
  registerStudioIpc(getMainWindow);
}
