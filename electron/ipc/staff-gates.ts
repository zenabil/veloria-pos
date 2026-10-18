// Veloria PoS - IPC: gates d'autorisation équipe par canal (0041/0042 + 0046).
// Appelée par handle() après les gardes licence et avant fn(input).
// Le renderer filtre l'affichage ; ici la décision réelle (session main).
// Principe (ADR-087, R2 RADICAL) : TOUTES les mutations sont mappées.
// Lectures métier gardées (ventes, stock, dettes, dépenses, retours, clôtures,
// paramètres) : un utilisateur ne voit que ce que sa permission autorise.
// Restent ouverts SANS session : staff.list/login/recover (porte d'entrée),
// carts.load (brouillons éphémères du poste), recherches catalogue et relevés
// publics (customers/suppliers/paymentReceipt/statement/stats, purchase.list/
// detail, proformas.list/detail/stats). Canaux absents = lectures ouvertes.
// dashboard.summary / reports.summary / history.* sont ouverts mais FILTRÉS
// par auteur (0046) : le gérant voit tout, l'utilisateur ses opérations.

import { IPC_CHANNELS } from "./channels";
import { getCurrentStaffUser } from "./handlers/staff-session";
import { userHasPermission } from "./handlers/staff.repo";

/** Canal → permission requise (union EXACTE des 10 clés 0041). */
const STAFF_CHANNEL_PERMISSION: Record<string, string> = {
  // Caisse
  [IPC_CHANNELS["sales.create"]]: "sales",
  [IPC_CHANNELS["sales.get"]]: "sales",
  [IPC_CHANNELS["sales.history"]]: "sales",
  [IPC_CHANNELS["sales.cancel"]]: "cancel",
  [IPC_CHANNELS["sales.setDueDate"]]: "cancel",
  // Stock
  [IPC_CHANNELS["stock.overview"]]: "stock",
  [IPC_CHANNELS["stock.products"]]: "stock",
  [IPC_CHANNELS["stock.movements"]]: "stock",
  [IPC_CHANNELS["stock.inventory"]]: "stock",
  [IPC_CHANNELS["stock.ledger"]]: "stock",
  [IPC_CHANNELS["stock.adjust"]]: "stock",
  [IPC_CHANNELS["stock.intake"]]: "stock",
  [IPC_CHANNELS["stock.intakes"]]: "stock",
  // Dettes et encaissements clients
  [IPC_CHANNELS["debts.list"]]: "debts",
  [IPC_CHANNELS["debts.detail"]]: "debts",
  [IPC_CHANNELS["debts.stats"]]: "debts",
  [IPC_CHANNELS["customers.recordPayment"]]: "debts",
  // Dépenses
  [IPC_CHANNELS["expenses.create"]]: "expenses",
  [IPC_CHANNELS["expenses.list"]]: "expenses",
  [IPC_CHANNELS["expenses.update"]]: "expenses",
  [IPC_CHANNELS["expenses.delete"]]: "expenses",
  [IPC_CHANNELS["expenses.stats"]]: "expenses",
  // Retours
  [IPC_CHANNELS["returns.create"]]: "returns",
  [IPC_CHANNELS["returns.list"]]: "returns",
  [IPC_CHANNELS["returns.detail"]]: "returns",
  [IPC_CHANNELS["returns.saleItems"]]: "returns",
  [IPC_CHANNELS["returns.intakeItems"]]: "returns",
  [IPC_CHANNELS["returns.refund"]]: "returns",
  [IPC_CHANNELS["returns.cancel"]]: "returns",
  [IPC_CHANNELS["returns.stats"]]: "returns",
  // Clôture
  [IPC_CHANNELS["closings.get"]]: "closings",
  [IPC_CHANNELS["closings.create"]]: "closings",
  // Paramètres et matériel
  [IPC_CHANNELS["settings.get"]]: "settings",
  [IPC_CHANNELS["settings.save"]]: "settings",
  [IPC_CHANNELS["templates.list"]]: "settings",
  [IPC_CHANNELS["templates.get"]]: "settings",
  [IPC_CHANNELS["templates.save"]]: "settings",
  [IPC_CHANNELS["templates.activate"]]: "settings",
  [IPC_CHANNELS["templates.remove"]]: "settings",
  [IPC_CHANNELS["templates.reset"]]: "settings",
  [IPC_CHANNELS["templates.preview"]]: "settings",
  [IPC_CHANNELS["templates.testPrint"]]: "settings",
  [IPC_CHANNELS["company.update"]]: "settings",
  [IPC_CHANNELS["printer.save"]]: "settings",
  // Équipe (le repo exige en plus le rôle gérant)
  [IPC_CHANNELS["staff.create"]]: "users",
  [IPC_CHANNELS["staff.setPermissions"]]: "users",
  [IPC_CHANNELS["staff.setActive"]]: "users",
  [IPC_CHANNELS["staff.regenRecovery"]]: "users",
  // Catalogue (mutations ; recherches et codes-barres ouverts pour la vente)
  [IPC_CHANNELS["products.create"]]: "stock",
  [IPC_CHANNELS["products.update"]]: "stock",
  [IPC_CHANNELS["products.delete"]]: "stock",
  [IPC_CHANNELS["products.archive"]]: "stock",
  [IPC_CHANNELS["products.restore"]]: "stock",
  [IPC_CHANNELS["products.import"]]: "stock",
  [IPC_CHANNELS["products.setSuppliers"]]: "stock",
  [IPC_CHANNELS["categories.create"]]: "stock",
  // Fournisseurs et achats (mutations ; relevés ouverts)
  [IPC_CHANNELS["suppliers.create"]]: "stock",
  [IPC_CHANNELS["suppliers.update"]]: "stock",
  [IPC_CHANNELS["suppliers.delete"]]: "stock",
  [IPC_CHANNELS["suppliers.deleteMany"]]: "stock",
  [IPC_CHANNELS["suppliers.pay"]]: "stock",
  [IPC_CHANNELS["purchase.create"]]: "stock",
  [IPC_CHANNELS["purchase.order"]]: "stock",
  [IPC_CHANNELS["purchase.cancel"]]: "stock",
  [IPC_CHANNELS["purchase.receive"]]: "stock",
  // Clients et devis (mutations ; relevés et QR ouverts)
  [IPC_CHANNELS["customers.create"]]: "debts",
  [IPC_CHANNELS["customers.update"]]: "debts",
  [IPC_CHANNELS["customers.archive"]]: "debts",
  [IPC_CHANNELS["customers.restore"]]: "debts",
  [IPC_CHANNELS["customers.accessActivate"]]: "debts",
  [IPC_CHANNELS["customers.accessRevoke"]]: "debts",
  [IPC_CHANNELS["proformas.create"]]: "sales",
  [IPC_CHANNELS["proformas.update"]]: "sales",
  [IPC_CHANNELS["proformas.delete"]]: "sales",
  [IPC_CHANNELS["proformas.status"]]: "sales",
  [IPC_CHANNELS["proformas.convert"]]: "sales",
  // Destructeur et publication (restauration, base, miroir)
  [IPC_CHANNELS["backup.restore"]]: "settings",
  [IPC_CHANNELS["backup.create"]]: "settings",
  [IPC_CHANNELS["backup.export"]]: "settings",
  [IPC_CHANNELS["backup.autoSave"]]: "settings",
  [IPC_CHANNELS["database.reset"]]: "settings",
  [IPC_CHANNELS["database.relocate"]]: "settings",
  [IPC_CHANNELS["sync.saveConfig"]]: "settings",
  // R2 RADICAL (P0) : mutations sortantes vers le miroir gardées — un
  // utilisateur sans `settings` ne pilote plus la file de synchro.
  [IPC_CHANNELS["sync.enqueue"]]: "settings",
  [IPC_CHANNELS["sync.markSent"]]: "settings",
  [IPC_CHANNELS["sync.pushNow"]]: "settings",
  [IPC_CHANNELS["announcements.save"]]: "settings",
  // R2 RADICAL (P0) : paramètres + calculs zakat = mutations gardées.
  [IPC_CHANNELS["zakat.saveParams"]]: "settings",
  [IPC_CHANNELS["zakat.save"]]: "settings",
  // R2 RADICAL (P0) : brouillon panier = écriture vendeur (la vente reste
  // gardée par sales.create ; carts.load reste ouvert : poste éphémère).
  [IPC_CHANNELS["carts.save"]]: "sales",
  // R1 RADICAL : impressions = sorties métier gardées (pas de contournement
  // par les handlers bruts printing/*). Vente pour les documents de vente,
  // stock pour BC/étiquettes, settings pour le matériel/studio.
  [IPC_CHANNELS["printing.printReceipt"]]: "sales",
  [IPC_CHANNELS["printing.printA4"]]: "sales",
  [IPC_CHANNELS["printing.preview"]]: "sales",
  [IPC_CHANNELS["printing.previewProforma"]]: "sales",
  [IPC_CHANNELS["printing.printProformaA4"]]: "sales",
  [IPC_CHANNELS["printing.printProforma80mm"]]: "sales",
  [IPC_CHANNELS["printing.exportProformaPdf"]]: "sales",
  [IPC_CHANNELS["printing.previewPayment"]]: "sales",
  [IPC_CHANNELS["printing.printPayment"]]: "sales",
  [IPC_CHANNELS["printing.exportPaymentPdf"]]: "sales",
  [IPC_CHANNELS["printing.previewDelivery"]]: "sales",
  [IPC_CHANNELS["printing.printDelivery"]]: "sales",
  [IPC_CHANNELS["printing.previewReturnSlip"]]: "returns",
  [IPC_CHANNELS["printing.printReturnSlip"]]: "returns",
  [IPC_CHANNELS["printing.previewReport"]]: "sales",
  [IPC_CHANNELS["printing.printReport"]]: "sales",
  [IPC_CHANNELS["printing.exportReportPdf"]]: "sales",
  [IPC_CHANNELS["printing.exportReceiptPdf"]]: "sales",
  [IPC_CHANNELS["printing.exportA4Pdf"]]: "sales",
  [IPC_CHANNELS["printing.previewPO"]]: "stock",
  [IPC_CHANNELS["printing.printPO"]]: "stock",
  [IPC_CHANNELS["printing.previewLabels"]]: "stock",
  [IPC_CHANNELS["printing.printLabels"]]: "stock",
  [IPC_CHANNELS["printing.exportLabelsPdf"]]: "stock",
  [IPC_CHANNELS["printing.testPage"]]: "sales",
  [IPC_CHANNELS["printing.listPrinters"]]: "settings",
  // R1 RADICAL : OCR = import stock (facture fournisseur). Sélection +
  // analyse gardées ; cancel/dispose = cycle de vie du job, ouverts.
  // ocr.progress est un event main→renderer (pas un handle).
  [IPC_CHANNELS["ocr.selectFile"]]: "stock",
  [IPC_CHANNELS["ocr.analyze"]]: "stock",
  [IPC_CHANNELS["ocr.cancel"]]: "stock",
  [IPC_CHANNELS["ocr.dispose"]]: "stock",
};

/** Remise : toute ligne à prix réduit exige la permission `discount`. */
function saleHasDiscount(input: unknown): boolean {
  const sale = input as {
    lines?: Array<{ originalUnitPriceMinor?: unknown; unitPriceMinor?: unknown }>;
  };
  if (!Array.isArray(sale.lines)) return false;
  return sale.lines.some(
    (l) =>
      typeof l.originalUnitPriceMinor === "number" &&
      typeof l.unitPriceMinor === "number" &&
      l.originalUnitPriceMinor > l.unitPriceMinor,
  );
}

export function enforceStaffGates(channel: string, input: unknown): void {
  const required: string[] = [];
  const base = STAFF_CHANNEL_PERMISSION[channel];
  if (base) required.push(base);
  // Remise dans les lignes (P0-7) : permission dédiée en plus de `sales`.
  if (channel === IPC_CHANNELS["sales.create"] && saleHasDiscount(input)) {
    required.push("discount");
  }
  if (required.length === 0) return;
  const session = getCurrentStaffUser();
  if (session == null) throw new Error("Session requise : choisissez un utilisateur.");
  for (const key of required) {
    if (!userHasPermission(session, key)) {
      throw new Error("Action non autorisée pour cet utilisateur.");
    }
  }
}
