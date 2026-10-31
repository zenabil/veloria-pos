// Veloria PoS - IPC: tables de gates licence (extrait de registry.ts, deplacement pur).
// Qui exige quoi : mutations protegees, pages/features par canal, canaux de paiement.

import { IPC_CHANNELS } from "./channels";

/**
 * Canaux protégés par la licence (écritures métier). Lecture seule, réglages,
 * entreprise, sauvegardes et licence elle-même restent ouverts : un poste
 * expiré consulte ses données et peut toujours se réactiver/sauvegarder.
 * Appliqué dans le main (jamais le renderer) — voir license-service.
 */
export const LICENSE_PROTECTED_CHANNELS: ReadonlySet<string> = new Set([
  IPC_CHANNELS["products.create"],
  IPC_CHANNELS["products.update"],
  IPC_CHANNELS["products.archive"],
  IPC_CHANNELS["products.restore"],
  IPC_CHANNELS["products.delete"],
  IPC_CHANNELS["products.import"],
  IPC_CHANNELS["products.setSuppliers"],
  IPC_CHANNELS["customers.create"],
  IPC_CHANNELS["customers.import"],
  IPC_CHANNELS["customers.update"],
  IPC_CHANNELS["customers.archive"],
  IPC_CHANNELS["customers.restore"],
  IPC_CHANNELS["customers.recordPayment"],
  // Accès clients APK : écritures gardées (activation, révocation, file de
  // synchro, annonces). Lectures (statut, file en attente) restent ouvertes.
  IPC_CHANNELS["customers.accessActivate"],
  IPC_CHANNELS["customers.accessRevoke"],
  IPC_CHANNELS["sync.enqueue"],
  IPC_CHANNELS["announcements.save"],
  IPC_CHANNELS["sync.pushNow"],
  IPC_CHANNELS["sync.saveConfig"],
  IPC_CHANNELS["categories.create"],
  IPC_CHANNELS["stock.adjust"],
  IPC_CHANNELS["stock.intake"],
  IPC_CHANNELS["stock.intakeCancel"],
  IPC_CHANNELS["stock.inventory"],
  IPC_CHANNELS["suppliers.create"],
  IPC_CHANNELS["suppliers.update"],
  IPC_CHANNELS["suppliers.delete"],
  IPC_CHANNELS["suppliers.deleteMany"],
  IPC_CHANNELS["suppliers.pay"],
  IPC_CHANNELS["purchase.create"],
  IPC_CHANNELS["purchase.order"],
  IPC_CHANNELS["purchase.cancel"],
  IPC_CHANNELS["purchase.receive"],
  IPC_CHANNELS["proformas.create"],
  IPC_CHANNELS["proformas.status"],
  IPC_CHANNELS["proformas.convert"],
  IPC_CHANNELS["proformas.update"],
  IPC_CHANNELS["proformas.delete"],
  IPC_CHANNELS["sales.create"],
  IPC_CHANNELS["sales.cancel"],
  IPC_CHANNELS["sales.reopen"],
  IPC_CHANNELS["sales.setDueDate"],
  IPC_CHANNELS["returns.create"],
  IPC_CHANNELS["returns.refund"],
  IPC_CHANNELS["returns.cancel"],
  IPC_CHANNELS["expenses.create"],
  IPC_CHANNELS["expenses.update"],
  IPC_CHANNELS["expenses.delete"],
  IPC_CHANNELS["closings.create"],
  IPC_CHANNELS["zakat.saveParams"],
  IPC_CHANNELS["zakat.save"],
  // EL-04: écritures de configuration — un poste non activé/expiré/révoqué
  // ne doit pas persister réglages, fiche entreprise ou imprimante (influence
  // ventes/impressions). Lectures (get/list) restent ouvertes (consultation +
  // réactivation). Root: mutations gardées côté main, jamais renderer.
  IPC_CHANNELS["settings.save"],
  IPC_CHANNELS["company.update"],
  IPC_CHANNELS["templates.save"],
  IPC_CHANNELS["templates.activate"],
  IPC_CHANNELS["templates.remove"],
  IPC_CHANNELS["templates.reset"],
  IPC_CHANNELS["templates.testPrint"],
  // EL-04+: réinitialisation d'usine = mutation destructive (base vierge).
  IPC_CHANNELS["database.reset"],
  // K-05 : optimisation de la base (VACUUM + ANALYZE + checkpoint sur le
  // fichier VIF) = mutation lourde et bloquante : même exigence de licence.
  IPC_CHANNELS["database.optimize"],
]);

/**
 * Capabilities exigées par canal (Authorization Layer, §2/§10/§11).
 * PAGE_GATED : au moins UNE des pages listées doit être autorisée
 * (ex. templates = settings OU invoices). FEATURE_GATED : feature requise.
 * Vérifié dans le main sur le payload SIGNÉ — jamais depuis le renderer.
 * Les canaux absents des deux tables restent soumis à la seule garde
 * d'état (LICENSE_PROTECTED_CHANNELS) ou ouverts (lectures, réglages).
 */
export const PAGE_GATED_CHANNELS: Readonly<Record<string, readonly string[]>> = {
  [IPC_CHANNELS["products.search"]]: ["products"],
  [IPC_CHANNELS["products.getByBarcode"]]: ["products"],
  [IPC_CHANNELS["products.matchBatch"]]: ["products"],
  [IPC_CHANNELS["products.barcodes"]]: ["products"],
  [IPC_CHANNELS["products.create"]]: ["products"],
  [IPC_CHANNELS["products.update"]]: ["products"],
  [IPC_CHANNELS["products.archive"]]: ["products"],
  [IPC_CHANNELS["products.restore"]]: ["products"],
  [IPC_CHANNELS["products.delete"]]: ["products"],
  [IPC_CHANNELS["products.import"]]: ["products"],
  [IPC_CHANNELS["products.suppliers"]]: ["products"],
  [IPC_CHANNELS["products.setSuppliers"]]: ["products"],
  [IPC_CHANNELS["customers.search"]]: ["customers"],
  [IPC_CHANNELS["customers.create"]]: ["customers"],
  [IPC_CHANNELS["customers.import"]]: ["customers"],
  [IPC_CHANNELS["customers.update"]]: ["customers"],
  [IPC_CHANNELS["customers.archive"]]: ["customers"],
  [IPC_CHANNELS["customers.restore"]]: ["customers"],
  [IPC_CHANNELS["customers.recordPayment"]]: ["customers", "debts"],
  [IPC_CHANNELS["customers.paymentReceipt"]]: ["customers", "debts"],
  [IPC_CHANNELS["customers.statement"]]: ["customers", "debts"],
  [IPC_CHANNELS["customers.stats"]]: ["customers"],
  // Accès clients APK + synchro + annonces : page clients (registre fédéré).
  [IPC_CHANNELS["customers.accessActivate"]]: ["customers"],
  [IPC_CHANNELS["customers.accessRevoke"]]: ["customers"],
  [IPC_CHANNELS["customers.accessStatus"]]: ["customers"],
  [IPC_CHANNELS["customers.accessQrSvg"]]: ["customers"],
  [IPC_CHANNELS["sync.enqueue"]]: ["customers"],
  [IPC_CHANNELS["sync.pushNow"]]: ["customers"],
  [IPC_CHANNELS["sync.getConfig"]]: ["customers"],
  [IPC_CHANNELS["sync.saveConfig"]]: ["customers"],
  [IPC_CHANNELS["sync.saveOwnerAccount"]]: ["customers"],
  [IPC_CHANNELS["announcements.save"]]: ["customers"],
  [IPC_CHANNELS["stock.overview"]]: ["stock"],
  [IPC_CHANNELS["stock.products"]]: ["stock"],
  [IPC_CHANNELS["stock.movements"]]: ["stock"],
  [IPC_CHANNELS["stock.inventory"]]: ["stock"],
  [IPC_CHANNELS["stock.adjust"]]: ["stock"],
  [IPC_CHANNELS["stock.intake"]]: ["stock"],
  [IPC_CHANNELS["stock.intakes"]]: ["stock"],
  [IPC_CHANNELS["stock.intakeDetail"]]: ["stock"],
  [IPC_CHANNELS["stock.intakeCancel"]]: ["stock"],
  [IPC_CHANNELS["suppliers.search"]]: ["suppliers"],
  [IPC_CHANNELS["suppliers.create"]]: ["suppliers"],
  [IPC_CHANNELS["suppliers.update"]]: ["suppliers"],
  [IPC_CHANNELS["suppliers.delete"]]: ["suppliers"],
  [IPC_CHANNELS["suppliers.deleteMany"]]: ["suppliers"],
  [IPC_CHANNELS["suppliers.pay"]]: ["suppliers", "debts"],
  [IPC_CHANNELS["suppliers.statement"]]: ["suppliers", "debts"],
  [IPC_CHANNELS["suppliers.stats"]]: ["suppliers"],
  [IPC_CHANNELS["suppliers.products"]]: ["suppliers"],
  [IPC_CHANNELS["purchase.create"]]: ["suppliers"],
  [IPC_CHANNELS["purchase.list"]]: ["suppliers"],
  [IPC_CHANNELS["purchase.detail"]]: ["suppliers"],
  [IPC_CHANNELS["purchase.order"]]: ["suppliers"],
  [IPC_CHANNELS["purchase.cancel"]]: ["suppliers"],
  [IPC_CHANNELS["purchase.receive"]]: ["suppliers", "stock"],
  [IPC_CHANNELS["proformas.create"]]: ["proformas"],
  [IPC_CHANNELS["proformas.list"]]: ["proformas"],
  [IPC_CHANNELS["proformas.status"]]: ["proformas"],
  [IPC_CHANNELS["proformas.convert"]]: ["proformas"],
  [IPC_CHANNELS["proformas.update"]]: ["proformas"],
  [IPC_CHANNELS["proformas.delete"]]: ["proformas"],
  [IPC_CHANNELS["proformas.detail"]]: ["proformas"],
  [IPC_CHANNELS["proformas.stats"]]: ["proformas"],
  [IPC_CHANNELS["debts.list"]]: ["debts"],
  [IPC_CHANNELS["debts.detail"]]: ["debts"],
  [IPC_CHANNELS["debts.stats"]]: ["debts"],
  [IPC_CHANNELS["reports.summary"]]: ["reports"],
  [IPC_CHANNELS["dashboard.summary"]]: ["dashboard"],
  [IPC_CHANNELS["closings.get"]]: ["reports"],
  [IPC_CHANNELS["closings.create"]]: ["reports"],
  [IPC_CHANNELS["zakat.sources"]]: ["zakat"],
  [IPC_CHANNELS["zakat.saveParams"]]: ["zakat"],
  [IPC_CHANNELS["zakat.history"]]: ["zakat"],
  [IPC_CHANNELS["zakat.save"]]: ["zakat"],
  [IPC_CHANNELS["sales.create"]]: ["sales"],
  [IPC_CHANNELS["sales.get"]]: ["sales"],
  [IPC_CHANNELS["sales.history"]]: ["sales", "history"],
  [IPC_CHANNELS["sales.cancel"]]: ["sales"],
  [IPC_CHANNELS["sales.reopen"]]: ["sales"],
  [IPC_CHANNELS["sales.setDueDate"]]: ["sales"],
  [IPC_CHANNELS["returns.create"]]: ["returns"],
  [IPC_CHANNELS["returns.list"]]: ["returns"],
  [IPC_CHANNELS["returns.detail"]]: ["returns"],
  [IPC_CHANNELS["returns.saleItems"]]: ["returns"],
  [IPC_CHANNELS["returns.intakeItems"]]: ["returns"],
  [IPC_CHANNELS["returns.refund"]]: ["returns"],
  [IPC_CHANNELS["returns.cancel"]]: ["returns"],
  [IPC_CHANNELS["returns.stats"]]: ["returns"],
  [IPC_CHANNELS["expenses.create"]]: ["expenses"],
  [IPC_CHANNELS["expenses.list"]]: ["expenses"],
  [IPC_CHANNELS["expenses.update"]]: ["expenses"],
  [IPC_CHANNELS["expenses.delete"]]: ["expenses"],
  [IPC_CHANNELS["expenses.stats"]]: ["expenses"],
  [IPC_CHANNELS["history.list"]]: ["history"],
  [IPC_CHANNELS["history.detail"]]: ["history"],
  [IPC_CHANNELS["history.stats"]]: ["history"],
  // P2: filtre partagé produits/stock/rapports (OR : une suffit).
  [IPC_CHANNELS["categories.list"]]: ["products", "stock", "reports"],
  // P2: diagnostic technique (chemins/tailles/état licence) réservé settings.
  [IPC_CHANNELS["app.diagnostics"]]: ["settings"],
  // Zone dangereuse (réinitialisation d'usine) : page settings uniquement.
  [IPC_CHANNELS["database.reset"]]: ["settings"],
  // K-05 : `database.optimize` (page « settings », comme la réinitialisation).
  [IPC_CHANNELS["database.optimize"]]: ["settings"],
  // M1 : NE JAMAIS lister `printing.*` / `backup.*` / `ocr.*` ici — ils ne
  // transitent JAMAIS par handle() (enregistrement brut ipcMain.handle dans
  // leurs modules) : l'entrée serait morte et trompeuse. Garde réelle :
  // guardPrint / guardPdfExport (printing.service.ts), guardBackup
  // (backup.service.ts), requireLicensedMutation(deps, "ocr")
  // (ocr.service.ts) — qui appliquent les mêmes pages/features que ce tableau.
};

/**
 * M1 : features exigées par canal, pour les canaux qui passent par handle().
 * `printing.*`, `backup.*` et `ocr.*` sont ABSENTS volontairement : ils
 * s'enregistrent via ipcMain.handle dans leur module (printing.service.ts :
 * guardPrint/guardPdfExport ; backup.service.ts : guardBackup ;
 * ocr.service.ts : requireLicensedMutation) et ne sont donc jamais vus par la
 * table ci-dessous. Une entrée ici n'aurait aucun effet.
 */
export const FEATURE_GATED_CHANNELS: Readonly<Record<string, string>> = {
  [IPC_CHANNELS["products.import"]]: "excel-export",
  [IPC_CHANNELS["returns.create"]]: "returns",
  [IPC_CHANNELS["returns.refund"]]: "returns",
  [IPC_CHANNELS["returns.cancel"]]: "returns",
  [IPC_CHANNELS["proformas.create"]]: "proformas",
  [IPC_CHANNELS["proformas.status"]]: "proformas",
  [IPC_CHANNELS["proformas.convert"]]: "proformas",
  [IPC_CHANNELS["proformas.update"]]: "proformas",
  [IPC_CHANNELS["proformas.delete"]]: "proformas",
  [IPC_CHANNELS["reports.summary"]]: "advanced-reports",
};

/**
 * Paiements clients/fournisseurs/pain : exigent debt-management (capability
 * « Gestion des dettes »). Détecté ici (main) sur le nom du canal.
 */
export const DEBT_PAYMENT_CHANNELS: ReadonlySet<string> = new Set([
  IPC_CHANNELS["customers.recordPayment"],
  IPC_CHANNELS["suppliers.pay"],
]);
