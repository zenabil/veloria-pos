// Veloria PoS - IPC: gates d'autorisation équipe par canal (0041/0042 + 0046).
// Appelée par handle() après les gardes licence et avant fn(input).
// Le renderer filtre l'affichage ; ici la décision réelle (session main).
// Principe (ADR-087, R2 RADICAL) : TOUTES les mutations sont mappées.
// Lectures métier gardées (ventes, stock, dettes, dépenses, retours, clôtures,
// paramètres) : un utilisateur ne voit que ce que sa permission autorise.
// Restent ouverts SANS session : staff.list/login/recover (porte d'entrée),
// recherches catalogue et relevés
// publics (customers/suppliers/paymentReceipt/statement/stats, purchase.list/
// detail, proformas.list/detail/stats). Canaux absents = lectures ouvertes.
// dashboard.summary / reports.summary / history.* sont ouverts mais FILTRÉS
// par auteur (0046) : le gérant voit tout, l'utilisateur ses opérations.

import { IPC_CHANNELS } from "./channels";
import { getCurrentStaffUser } from "./handlers/staff-session";
import { getStaffRole, userHasPermission } from "./handlers/staff.repo";

/** Canal → permission requise (union EXACTE des 10 clés 0041). */
const STAFF_CHANNEL_PERMISSION: Record<string, string> = {
  // Caisse
  [IPC_CHANNELS["sales.create"]]: "sales",
  [IPC_CHANNELS["sales.get"]]: "sales",
  [IPC_CHANNELS["sales.history"]]: "sales",
  [IPC_CHANNELS["sales.cancel"]]: "cancel",
  [IPC_CHANNELS["sales.reopen"]]: "cancel",
  [IPC_CHANNELS["sales.setDueDate"]]: "cancel",
  // Stock
  [IPC_CHANNELS["stock.overview"]]: "stock",
  [IPC_CHANNELS["stock.products"]]: "stock",
  [IPC_CHANNELS["stock.movements"]]: "stock",
  [IPC_CHANNELS["stock.inventory"]]: "stock",
  [IPC_CHANNELS["stock.adjust"]]: "stock",
  [IPC_CHANNELS["stock.intake"]]: "stock",
  [IPC_CHANNELS["stock.intakes"]]: "stock",
  [IPC_CHANNELS["stock.intakeDetail"]]: "stock",
  [IPC_CHANNELS["stock.intakeCancel"]]: "stock",
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
  // E-21 (P1) : la réouverture d'une journée close défait le verrou de
  // période (migration 0048) ⇒ permission `closings` exigée, et le repo
  // refuse en plus tout utilisateur qui n'est pas gérant.
  [IPC_CHANNELS["closings.reopen"]]: "closings",
  // Sessions de caisse : la caisse relève de la permission de clôture
  // (`closings`) — pas de nouvelle permission dans les rôles existants.
  [IPC_CHANNELS["cash.open"]]: "closings",
  [IPC_CHANNELS["cash.count"]]: "closings",
  [IPC_CHANNELS["cash.close"]]: "closings",
  [IPC_CHANNELS["cash.current"]]: "closings",
  [IPC_CHANNELS["cash.list"]]: "closings",
  // Paramètres et matériel
  [IPC_CHANNELS["settings.get"]]: "settings",
  [IPC_CHANNELS["settings.save"]]: "settings",
  [IPC_CHANNELS["templates.list"]]: "settings",
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
  [IPC_CHANNELS["customers.import"]]: "debts",
  [IPC_CHANNELS["customers.update"]]: "debts",
  [IPC_CHANNELS["customers.archive"]]: "debts",
  [IPC_CHANNELS["customers.restore"]]: "debts",
  [IPC_CHANNELS["customers.accessActivate"]]: "debts",
  [IPC_CHANNELS["customers.accessRevoke"]]: "debts",
  // K-01 (P1) : le QR d'activation APK embarque le PIN du client EN CLAIR
  // (`buildActivationQrPayloadV2` → PIN + code + anon key). Sans porte
  // staff, n'importe quel code renderer pouvait l'imprimer. Même permission
  // que les autres écritures d'accès client.
  [IPC_CHANNELS["customers.accessQrSvg"]]: "debts",
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
  // K-05 (P1) : `database.optimize` exécute VACUUM + ANALYZE + checkpoint sur
  // la base VIVANTE (réécriture complète du fichier, verrou exclusif). Elle
  // était sans AUCUNE porte : ni session, ni permission, ni licence — alors
  // que sa sœur `database.reset` est protégée par les trois. Alignée ici.
  [IPC_CHANNELS["database.optimize"]]: "settings",
  [IPC_CHANNELS["sync.saveConfig"]]: "settings",
  [IPC_CHANNELS["sync.saveOwnerAccount"]]: "settings",
  // R2 RADICAL (P0) : mutations sortantes vers le miroir gardées — un
  // utilisateur sans `settings` ne pilote plus la file de synchro.
  [IPC_CHANNELS["sync.enqueue"]]: "settings",
  [IPC_CHANNELS["sync.pushNow"]]: "settings",
  // ADR-171 : publication de la liasse = écriture sortante, même porte.
  [IPC_CHANNELS["sync.pushOwnerSnapshot"]]: "settings",
  [IPC_CHANNELS["announcements.save"]]: "settings",
  // ADR-166 : gestion des annonces (liste + suppression) — même porte que
  // l'écriture : c'est un contenu magasin, pas une lecture ouverte.
  [IPC_CHANNELS["announcements.list"]]: "settings",
  [IPC_CHANNELS["announcements.remove"]]: "settings",
  // ADR-182 : catalogue publié dans l'application client. Publier des prix
  // aux clients est une décision de configuration magasin : même porte que
  // les annonces (le cashier n'ouvre pas la vitrine du magasin).
  [IPC_CHANNELS["clientCatalog.getSettings"]]: "settings",
  [IPC_CHANNELS["clientCatalog.preview"]]: "settings",
  [IPC_CHANNELS["clientCatalog.saveSettings"]]: "settings",
  [IPC_CHANNELS["sync.publishCatalog"]]: "settings",
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
  [IPC_CHANNELS["printing.preview"]]: "sales",
  [IPC_CHANNELS["printing.previewProforma"]]: "sales",
  [IPC_CHANNELS["printing.printProformaA4"]]: "sales",
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

/**
 * K-04 (P1) : canaux de LECTURE sensibles — une SESSION est EXIGÉE, mais
 * aucune permission particulière n'est demandée.
 *
 * Pourquoi : `staffScope()` (registry.finance.ts / registry.sales.ts) renvoie
 * `null` = « périmètre gérant (tout) » — et `null` était aussi la valeur
 * renvoyée quand AUCUNE session n'était ouverte (session expirée après
 * 30 min d'inactivité, ou poste jamais connecté). Un appelant non authentifié
 * obtenait donc la vue complète : historique, ventes, dettes, dashboard,
 * rapports. Ces lectures sont désormais refusées sans session (fail-closed).
 *
 * L'UX ne change pas : le poste exige déjà une session pour entrer (porte
 * équipe, ADR-085/086) ; seul l'accès direct IPC non authentifié est fermé.
 */
const SESSION_REQUIRED_CHANNELS: ReadonlySet<string> = new Set([
  IPC_CHANNELS["history.list"],
  IPC_CHANNELS["history.detail"],
  IPC_CHANNELS["history.stats"],
  IPC_CHANNELS["sales.history"],
  IPC_CHANNELS["sales.get"],
  IPC_CHANNELS["dashboard.summary"],
  IPC_CHANNELS["reports.summary"],
  IPC_CHANNELS["debts.list"],
  IPC_CHANNELS["debts.detail"],
  IPC_CHANNELS["debts.stats"],
  IPC_CHANNELS["zakat.sources"],
  IPC_CHANNELS["zakat.history"],
  // Brouillons de caisse : jamais lisibles avant l'ouverture d'une session
  // (ils contiennent des noms de clients et des lignes de panier).
  IPC_CHANNELS["carts.load"],
]);

/**
 * Opérations à impact irréversible ou exfiltration massive : réservées au
 * gérant, même si un utilisateur possède `settings`. La permission `settings`
 * reste nécessaire pour les réglages courants (imprimante, entreprise...).
 */
const MANAGER_ONLY_CHANNELS: ReadonlySet<string> = new Set([
  IPC_CHANNELS["database.reset"],
  IPC_CHANNELS["database.relocate"],
  IPC_CHANNELS["backup.restore"],
  IPC_CHANNELS["backup.export"],
  IPC_CHANNELS["sync.saveConfig"],
]);

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
  if (required.length === 0 && !SESSION_REQUIRED_CHANNELS.has(channel)) return;
  const session = getCurrentStaffUser();
  if (session == null) throw new Error("Session requise : choisissez un utilisateur.");
  if (MANAGER_ONLY_CHANNELS.has(channel) && getStaffRole(session) !== "manager") {
    throw new Error("Action réservée au gérant.");
  }
  for (const key of required) {
    if (!userHasPermission(session, key)) {
      throw new Error("Action non autorisée pour cet utilisateur.");
    }
  }
}
