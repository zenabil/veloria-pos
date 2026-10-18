// Veloria PoS — Vente : impression ticket + devis (extrait de SellScreen).
// Politique opération → format : la vente s'imprime TOUJOURS en ticket 58/80 ;
// le devis s'imprime/exporte en A4 uniquement (jamais de ticket pour un devis).
import { playSound } from "@shared/sound/sound.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { api } from "@shared/types/ipc-client.ts";
import type { Notify } from "@shared/ui/primitives.tsx";
import { buildPrintPayload, type CompanyFields } from "./sell-totals.ts";
import type { LastSale, ProformaDoc } from "./sell-types.ts";

export function useSellPrint({
  preview,
  proformaDoc,
  company,
  notify,
}: {
  preview: { sale: LastSale; text80: string } | null;
  proformaDoc: ProformaDoc | null;
  company: CompanyFields;
  notify: Notify;
}): {
  print: () => Promise<void>;
  printProforma: () => Promise<void>;
  exportProformaPdf: () => Promise<void>;
} {
  async function print(): Promise<void> {
    if (!preview) return;
    try {
      await api.printReceipt(buildPrintPayload(company, preview.sale, preview.sale.balances));
      playSound("print");
      notify("Ticket envoyé.", "ok");
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

  async function exportProformaPdf(): Promise<void> {
    if (!proformaDoc) return;
    try {
      const res = (await api.proformaExportPdf(proformaDoc.payload)) as { path: string };
      notify(`PDF enregistré : ${res.path}`, "ok");
    } catch (e) {
      notify(frError(e, "Export PDF impossible."), "err");
    }
  }

  return { print, printProforma, exportProformaPdf };
}
