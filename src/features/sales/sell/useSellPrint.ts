// Veloria PoS — Vente : impression ticket/facture + devis (extrait de SellScreen).
// Aperçu 80mm/A4, impression auto après vente, boutons devis (A4/80mm/PDF).
import { playSound } from "@shared/sound/sound.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { api } from "@shared/types/ipc-client.ts";
import type { Notify } from "@shared/ui/primitives.tsx";
import { buildPrintPayload, type CompanyFields } from "./sell-totals.ts";
import type { LastSale, ProformaDoc } from "./sell-types.ts";

export function useSellPrint({
  preview,
  proformaDoc,
  printMode,
  company,
  notify,
}: {
  preview: { sale: LastSale; text80: string; htmlA4: string } | null;
  proformaDoc: ProformaDoc | null;
  printMode: "80mm" | "A4";
  company: CompanyFields;
  notify: Notify;
}): {
  print: () => Promise<void>;
  printProforma: () => Promise<void>;
  printProforma80: () => Promise<void>;
  exportProformaPdf: () => Promise<void>;
} {
  async function print(): Promise<void> {
    if (!preview) return;
    try {
      if (printMode === "A4")
        await api.printA4(buildPrintPayload(company, preview.sale, preview.sale.balances));
      else await api.printReceipt(buildPrintPayload(company, preview.sale, preview.sale.balances));
      playSound("print");
      notify(printMode === "A4" ? "Facture A4 envoyée." : "Ticket envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    }
  }

  async function printProforma(): Promise<void> {
    if (!proformaDoc) return;
    try {
      await api.proformaPrintA4(proformaDoc.payload);
      notify(`Devis ${proformaDoc.number} envoyé (A4).`, "ok");
    } catch (e) {
      notify(frError(e, "Impression du devis impossible."), "err");
    }
  }

  async function printProforma80(): Promise<void> {
    if (!proformaDoc) return;
    try {
      await api.proformaPrint80mm(proformaDoc.payload);
      notify(`Devis ${proformaDoc.number} envoyé (80mm).`, "ok");
    } catch (e) {
      notify(frError(e, "Impression du devis impossible."), "err");
    }
  }

  async function exportProformaPdf(): Promise<void> {
    if (!proformaDoc) return;
    try {
      const res = (await api.proformaExportPdf(proformaDoc.payload)) as { path: string };
      notify(`PDF enregistré : ${res.path}`, "ok");
    } catch (e) {
      notify(frError(e, "Export PDF impossible."), "err");
    }
  }

  return { print, printProforma, printProforma80, exportProformaPdf };
}
