// Veloria PoS — Electron: IPC registry (typed, validated, error-safe).
// Maps renderer requests -> main-process repositories/services.
// All errors mapped to French user messages + technical log.

import { app, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import { log } from "../services/logger";
import {
  getDb,
  integrityCheck,
  openDatabase,
  checkpoint,
  checkpointAndClose,
  factoryResetDatabase,
  optimizeDatabase,
  verifyDbFileCopy,
  reopenWithRetry,
} from "../database/sqlite.service";
import {
  getConfiguredDbPath,
  getDataFolder,
  persistDbPath,
  LOGICAL_DB_NAME,
  PHYSICAL_DB_FILENAME,
} from "../database/database-path.service";
import { assertSafeUserFolder, isAllowedDatabaseFile } from "../security/security";
import { pickFolder, openPathSafe, openLogsFolder, pickLogo } from "../services/file-ui";
import { readLogoDataUrlFromFile } from "../services/logo";
import * as Products from "./handlers/products.repo";
import * as Sales from "./handlers/sales.repo";
import * as Customers from "./handlers/customers.repo";
import * as Inventory from "./handlers/inventory.repo";
import * as Suppliers from "./handlers/suppliers.repo";
import * as Proformas from "./handlers/proformas.repo";
import * as Purchase from "./handlers/purchases.repo";
import * as Carts from "./handlers/carts.repo";
import * as Bread from "./handlers/bread.repo";
import * as Finance from "./handlers/finance.repo";
import * as Imports from "./handlers/import.repo";
import * as Expenses from "./handlers/expenses.repo";
import * as Company from "./handlers/company.repo";
import * as Returns from "./handlers/returns.repo";
import * as History from "./handlers/history.repo";
import * as Settings from "./handlers/settings.repo";
import { backupStatus } from "../backup/backup.service";
import { getSelectedPrinterName } from "../printing/printing.service";
import { getLogFile } from "../services/logger";
import { getMainWindow } from "../main/window-manager";
import { dialog } from "electron";
import {
  getLicenseStatus,
  importLicenseEnvelope,
  requireLicensedFeature,
  requireLicensedMutation,
  requireLicensedPage,
} from "../licensing/license-service";
import { prodLicenseDeps } from "../licensing/prod-deps";
import { getHardwareFingerprint, formatFingerprintShort } from "../licensing/fingerprint";

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

function toUserMessage(err: unknown): { code: string; message: string } {
  // Zod : message technique anglais -> message FR générique (détail en log).
  if (err instanceof Error && err.name === "ZodError") {
    return { code: "VALIDATION_ERROR", message: "Données invalides. Vérifiez le formulaire." };
  }
  // P1-7 : erreurs métier du domaine (miroir des codes
  // src/domain/common/errors.ts) — message FR transmis tel quel AVEC son code.
  const DOMAIN_CODES: ReadonlySet<string> = new Set([
    "VALIDATION_ERROR",
    "MONEY_ERROR",
    "QUANTITY_ERROR",
    "BARCODE_ERROR",
    "PRODUCT_ERROR",
    "CUSTOMER_ERROR",
    "SALE_ERROR",
    "STOCK_ERROR",
    "RETURN_ERROR",
    "PAYMENT_ERROR",
    "PROFORMA_ERROR",
    "BREAD_ERROR",
    "SUPPLIER_ERROR",
    "CLOSING_ERROR",
    "IMPORT_ERROR",
    "ZAKAT_ERROR",
    "CONFLICTING_OPERATION",
  ]);
  const msg = err instanceof Error ? err.message : "Erreur inconnue.";
  const errCode = err instanceof Error ? (err as unknown as { code?: unknown }).code : undefined;
  if (typeof errCode === "string" && DOMAIN_CODES.has(errCode)) {
    return { code: errCode, message: msg };
  }
  // SQLite constraint messages -> French
  if (/UNIQUE constraint failed: product_barcodes.barcode/i.test(msg)) {
    return { code: "VALIDATION_ERROR", message: "Ce code-barres existe déjà." };
  }
  if (
    /UNIQUE constraint failed: (sales\.invoice_number|proforma_invoices\.proforma_number|bread_orders\.order_number)/i.test(
      msg,
    )
  ) {
    return {
      code: "CONFLICTING_OPERATION",
      message: "Numéro déjà utilisé. Veuillez réessayer.",
    };
  }
  if (/UNIQUE constraint failed: categories\.name/i.test(msg)) {
    return { code: "VALIDATION_ERROR", message: "Cette catégorie existe déjà." };
  }
  if (/UNIQUE constraint failed: suppliers\.code/i.test(msg)) {
    return { code: "VALIDATION_ERROR", message: "Ce code fournisseur existe déjà." };
  }
  if (/DATABASE_UNAVAILABLE/i.test(msg)) {
    return {
      code: "DATABASE_UNAVAILABLE",
      message: "Base de données indisponible. Redémarrez l'application.",
    };
  }
  if (/corrompue ou incohérente|plus récente de Veloria PoS/i.test(msg)) {
    return {
      code: msg.includes("corrompue") ? "DATABASE_CORRUPTED" : "CONFLICTING_OPERATION",
      message: msg,
    };
  }
  // Erreurs SQLite internes (jamais exposées telles quelles).
  if (/SQLITE_|constraint failed|no such (table|column)|syntax error|RAISE|ABORT/i.test(msg)) {
    return { code: "UNKNOWN_ERROR", message: "Une erreur inattendue est survenue. Réessayez." };
  }
  // Erreurs système Node (jamais de chemin/technique brut à l'utilisateur).
  if (/ENOENT|EACCES|EPERM|ENOSPC|EEXIST/i.test(msg)) {
    return {
      code: "UNKNOWN_ERROR",
      message: "Opération fichier impossible. Vérifiez les droits et l'espace disque.",
    };
  }
  // Licence hors-ligne : messages FR du LicenseService → code dédié
  // (l'UI distingue l'activation requise des erreurs de formulaire).
  if (
    /licence|activation|réactiv|fonction protégée|n'est pas incluse|non disponible dans votre licence|révoquée|suspendue/i.test(
      msg,
    )
  ) {
    const code = /n'est pas incluse/i.test(msg)
      ? "FEATURE_NOT_LICENSED"
      : /non disponible dans votre licence/i.test(msg)
        ? "PAGE_NOT_LICENSED"
        : "LICENSE_REQUIRED";
    return { code, message: msg };
  }
  // P1-7 : exceptions JS brutes (bugs : TypeError, chemins, stack) — jamais
  // de technique brut à l'utilisateur, repli FR générique + détail en log.
  if (
    err instanceof TypeError ||
    /Cannot read|is not a function|is not defined|of undefined|undefined is not|Invalid Date|at\s+\S+\s*\(|\.tsx?:\d+|\.js:\d+|node_modules|\bNaN\b/i.test(
      msg,
    )
  ) {
    return { code: "UNKNOWN_ERROR", message: "Une erreur inattendue est survenue. Réessayez." };
  }
  // Tous les messages métier du code sont déjà rédigés en français :
  // on les transmet tels quels (pas d'exception brute exposée).
  return { code: "VALIDATION_ERROR", message: msg };
}

/**
 * Canaux protégés par la licence (écritures métier). Lecture seule, réglages,
 * entreprise, sauvegardes et licence elle-même restent ouverts : un poste
 * expiré consulte ses données et peut toujours se réactiver/sauvegarder.
 * Appliqué dans le main (jamais le renderer) — voir license-service.
 */
const LICENSE_PROTECTED_CHANNELS: ReadonlySet<string> = new Set([
  IPC_CHANNELS["products.create"],
  IPC_CHANNELS["products.update"],
  IPC_CHANNELS["products.archive"],
  IPC_CHANNELS["products.restore"],
  IPC_CHANNELS["products.delete"],
  IPC_CHANNELS["products.import"],
  IPC_CHANNELS["products.setSuppliers"],
  IPC_CHANNELS["customers.create"],
  IPC_CHANNELS["customers.update"],
  IPC_CHANNELS["customers.archive"],
  IPC_CHANNELS["customers.restore"],
  IPC_CHANNELS["customers.recordPayment"],
  IPC_CHANNELS["customers.import"],
  IPC_CHANNELS["categories.create"],
  IPC_CHANNELS["stock.adjust"],
  IPC_CHANNELS["stock.intake"],
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
  IPC_CHANNELS["sales.setDueDate"],
  IPC_CHANNELS["returns.create"],
  IPC_CHANNELS["returns.refund"],
  IPC_CHANNELS["returns.cancel"],
  IPC_CHANNELS["expenses.create"],
  IPC_CHANNELS["expenses.update"],
  IPC_CHANNELS["expenses.delete"],
  IPC_CHANNELS["bread.create"],
  IPC_CHANNELS["bread.pay"],
  IPC_CHANNELS["bread.transfer"],
  IPC_CHANNELS["bread.updateQty"],
  IPC_CHANNELS["bread.convert"],
  IPC_CHANNELS["bread.update"],
  IPC_CHANNELS["bread.status"],
  IPC_CHANNELS["closings.create"],
  IPC_CHANNELS["zakat.saveParams"],
  IPC_CHANNELS["zakat.save"],
  // EL-04: écritures de configuration — un poste non activé/expiré/révoqué
  // ne doit pas persister réglages, fiche entreprise ou imprimante (influence
  // ventes/impressions). Lectures (get/list) restent ouvertes (consultation +
  // réactivation). Root: mutations gardées côté main, jamais renderer.
  IPC_CHANNELS["settings.save"],
  IPC_CHANNELS["company.update"],
  // EL-04+: réinitialisation d'usine = mutation destructive (base vierge).
  IPC_CHANNELS["database.reset"],
]);

/**
 * Capabilities exigées par canal (Authorization Layer, §2/§10/§11).
 * PAGE_GATED : au moins UNE des pages listées doit être autorisée
 * (ex. bread = breadOrders OU pain). FEATURE_GATED : feature requise.
 * Vérifié dans le main sur le payload SIGNÉ — jamais depuis le renderer.
 * Les canaux absents des deux tables restent soumis à la seule garde
 * d'état (LICENSE_PROTECTED_CHANNELS) ou ouverts (lectures, réglages).
 */
const PAGE_GATED_CHANNELS: Readonly<Record<string, readonly string[]>> = {
  [IPC_CHANNELS["products.search"]]: ["products"],
  [IPC_CHANNELS["products.getByBarcode"]]: ["products"],
  [IPC_CHANNELS["products.matchBatch"]]: ["products"],
  [IPC_CHANNELS["products.barcodes"]]: ["products"],
  [IPC_CHANNELS["products.get"]]: ["products"],
  [IPC_CHANNELS["products.create"]]: ["products"],
  [IPC_CHANNELS["products.update"]]: ["products"],
  [IPC_CHANNELS["products.archive"]]: ["products"],
  [IPC_CHANNELS["products.restore"]]: ["products"],
  [IPC_CHANNELS["products.delete"]]: ["products"],
  [IPC_CHANNELS["products.import"]]: ["products"],
  [IPC_CHANNELS["products.suppliers"]]: ["products"],
  [IPC_CHANNELS["products.setSuppliers"]]: ["products"],
  [IPC_CHANNELS["customers.search"]]: ["customers"],
  [IPC_CHANNELS["customers.get"]]: ["customers"],
  [IPC_CHANNELS["customers.create"]]: ["customers"],
  [IPC_CHANNELS["customers.update"]]: ["customers"],
  [IPC_CHANNELS["customers.archive"]]: ["customers"],
  [IPC_CHANNELS["customers.restore"]]: ["customers"],
  [IPC_CHANNELS["customers.recordPayment"]]: ["customers", "debts"],
  [IPC_CHANNELS["customers.statement"]]: ["customers", "debts"],
  [IPC_CHANNELS["customers.stats"]]: ["customers"],
  [IPC_CHANNELS["customers.import"]]: ["customers"],
  [IPC_CHANNELS["stock.overview"]]: ["stock"],
  [IPC_CHANNELS["stock.products"]]: ["stock"],
  [IPC_CHANNELS["stock.movements"]]: ["stock"],
  [IPC_CHANNELS["stock.inventory"]]: ["stock"],
  [IPC_CHANNELS["stock.lowStock"]]: ["stock"],
  [IPC_CHANNELS["stock.ledger"]]: ["stock"],
  [IPC_CHANNELS["stock.adjust"]]: ["stock"],
  [IPC_CHANNELS["stock.intake"]]: ["stock"],
  [IPC_CHANNELS["stock.intakes"]]: ["stock"],
  [IPC_CHANNELS["stock.valuation"]]: ["stock"],
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
  [IPC_CHANNELS["reports.full"]]: ["reports"],
  [IPC_CHANNELS["reports.summary"]]: ["reports"],
  [IPC_CHANNELS["dashboard.summary"]]: ["dashboard"],
  [IPC_CHANNELS["closings.get"]]: ["reports"],
  [IPC_CHANNELS["closings.create"]]: ["reports"],
  [IPC_CHANNELS["zakat.sources"]]: ["zakat"],
  [IPC_CHANNELS["zakat.saveParams"]]: ["zakat"],
  [IPC_CHANNELS["zakat.history"]]: ["zakat"],
  [IPC_CHANNELS["zakat.save"]]: ["zakat"],
  [IPC_CHANNELS["bread.create"]]: ["breadOrders", "pain"],
  [IPC_CHANNELS["bread.list"]]: ["breadOrders", "pain"],
  [IPC_CHANNELS["bread.pay"]]: ["breadOrders", "pain"],
  [IPC_CHANNELS["bread.transfer"]]: ["breadOrders", "pain"],
  [IPC_CHANNELS["bread.updateQty"]]: ["breadOrders", "pain"],
  [IPC_CHANNELS["bread.convert"]]: ["breadOrders", "pain"],
  [IPC_CHANNELS["bread.update"]]: ["breadOrders", "pain"],
  [IPC_CHANNELS["bread.status"]]: ["breadOrders", "pain"],
  [IPC_CHANNELS["bread.stats"]]: ["breadOrders", "pain"],
  [IPC_CHANNELS["bread.detail"]]: ["breadOrders", "pain"],
  [IPC_CHANNELS["sales.create"]]: ["sales"],
  [IPC_CHANNELS["sales.get"]]: ["sales"],
  [IPC_CHANNELS["sales.history"]]: ["sales", "history"],
  [IPC_CHANNELS["sales.cancel"]]: ["sales"],
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
  [IPC_CHANNELS["printing.printReceipt"]]: ["sales"],
  [IPC_CHANNELS["printing.preview"]]: ["sales"],
  [IPC_CHANNELS["printing.printA4"]]: ["invoices"],
  [IPC_CHANNELS["printing.previewProforma"]]: ["proformas"],
  [IPC_CHANNELS["printing.printProformaA4"]]: ["proformas"],
  [IPC_CHANNELS["printing.previewReport"]]: ["reports"],
  [IPC_CHANNELS["printing.printReport"]]: ["reports"],
  [IPC_CHANNELS["printing.previewLabels"]]: ["products"],
  [IPC_CHANNELS["printing.printLabels"]]: ["products"],
};

const FEATURE_GATED_CHANNELS: Readonly<Record<string, string>> = {
  [IPC_CHANNELS["printing.printReceipt"]]: "receipt-80mm",
  [IPC_CHANNELS["printing.preview"]]: "receipt-80mm",
  [IPC_CHANNELS["printing.printA4"]]: "invoice-a4",
  [IPC_CHANNELS["printing.previewProforma"]]: "proformas",
  [IPC_CHANNELS["printing.printProformaA4"]]: "invoice-a4",
  [IPC_CHANNELS["printing.previewReport"]]: "advanced-reports",
  [IPC_CHANNELS["printing.printReport"]]: "advanced-reports",
  [IPC_CHANNELS["printing.previewLabels"]]: "barcode-scanner",
  [IPC_CHANNELS["printing.printLabels"]]: "barcode-scanner",
  [IPC_CHANNELS["backup.create"]]: "automatic-backup",
  [IPC_CHANNELS["backup.export"]]: "automatic-backup",
  [IPC_CHANNELS["backup.autoSave"]]: "automatic-backup",
  [IPC_CHANNELS["backup.restore"]]: "restore-backup",
  [IPC_CHANNELS["ocr.selectFile"]]: "ocr",
  [IPC_CHANNELS["ocr.analyze"]]: "ocr",
  [IPC_CHANNELS["products.import"]]: "excel-export",
  [IPC_CHANNELS["customers.import"]]: "excel-export",
  [IPC_CHANNELS["returns.create"]]: "returns",
  [IPC_CHANNELS["returns.refund"]]: "returns",
  [IPC_CHANNELS["returns.cancel"]]: "returns",
  [IPC_CHANNELS["proformas.create"]]: "proformas",
  [IPC_CHANNELS["proformas.status"]]: "proformas",
  [IPC_CHANNELS["proformas.convert"]]: "proformas",
  [IPC_CHANNELS["proformas.update"]]: "proformas",
  [IPC_CHANNELS["proformas.delete"]]: "proformas",
  [IPC_CHANNELS["reports.full"]]: "advanced-reports",
  [IPC_CHANNELS["reports.summary"]]: "advanced-reports",
};

/**
 * Paiements clients/fournisseurs/pain : exigent debt-management (capability
 * « Gestion des dettes »). Détecté ici (main) sur le nom du canal.
 */
const DEBT_PAYMENT_CHANNELS: ReadonlySet<string> = new Set([
  IPC_CHANNELS["customers.recordPayment"],
  IPC_CHANNELS["suppliers.pay"],
  IPC_CHANNELS["bread.pay"],
]);
/**
 * Libellé système convivial pour l'écran À propos (au lieu du brut
 * `win32 10.0.26200`) : nom commercial + architecture. Le détail brut reste
 * disponible dans `osDetail` pour le support. Jamais d'exception vers l'UI.
 */
function friendlyOsLabel(): string {
  const arch = os.arch();
  try {
    if (os.platform() === "win32") {
      // Édition précise quand disponible (ex. « Windows 11 Pro »), sinon
      // correspondance du noyau : build ≥ 22000 = Windows 11.
      const detailed =
        typeof (os as { version?: unknown }).version === "function"
          ? String((os as unknown as { version(): string }).version())
          : "";
      if (/windows\s+\d/i.test(detailed)) return `${detailed.trim()} (${arch})`;
      const release = os.release();
      const build = Number((release.split(".")[2] ?? "0").split("-")[0]);
      if (release.startsWith("10.0.") && build >= 22000) return `Windows 11 (${arch})`;
      if (release.startsWith("10.0.")) return `Windows 10 (${arch})`;
      if (release.startsWith("6.3")) return `Windows 8.1 (${arch})`;
      if (release.startsWith("6.2")) return `Windows 8 (${arch})`;
      if (release.startsWith("6.1")) return `Windows 7 (${arch})`;
      return `Windows (${arch})`;
    }
    if (os.platform() === "darwin") return `macOS ${os.release()} (${arch})`;
    if (os.platform() === "linux") return `Linux ${os.release()} (${arch})`;
    return `${os.platform()} ${os.release()} (${arch})`;
  } catch {
    return `${os.platform()} ${os.release()} (${arch})`;
  }
}

function handle<TInput>(
  channel: string,
  schema: { parse(v: unknown): TInput } | null,
  fn: (input: TInput) => unknown,
): void {
  ipcMain.handle(channel, (_event, raw: unknown) => {
    // M-2 CLARITY: this is a LOG-CORRELATION id per IPC request, never a
    // business operationId — business idempotency always uses the
    // caller-owned `input.operationId` (see handlers). Named distinctly so no
    // future handler mistakes it for retry identity.
    const requestId = randomUUID();
    const started = Date.now();
    try {
      const deps = prodLicenseDeps();
      // Garde licence (main uniquement) : les canaux protégés exigent une
      // licence active. Dev non packagé : journalisé, non bloquant.
      if (LICENSE_PROTECTED_CHANNELS.has(channel)) {
        requireLicensedMutation(deps);
      }
      // Capabilities : pages d'abord (routage/filtrage), puis features.
      // Au moins une page de la liste suffit (ex. breadOrders OU pain).
      const pages = PAGE_GATED_CHANNELS[channel];
      if (pages) {
        let allowed = false;
        let lastErr: unknown = null;
        for (const page of pages) {
          try {
            requireLicensedPage(deps, page);
            allowed = true;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!allowed)
          throw lastErr instanceof Error
            ? lastErr
            : new Error("Fonction non disponible dans votre licence. Contactez votre fournisseur.");
      }
      const feature = FEATURE_GATED_CHANNELS[channel];
      if (feature) {
        requireLicensedFeature(deps, feature);
      }
      if (DEBT_PAYMENT_CHANNELS.has(channel)) {
        requireLicensedFeature(deps, "debt-management");
      }
      const input = schema ? schema.parse(raw ?? {}) : (raw as TInput);
      // P1-6 : couche centrale — tout schéma qui EXIGE operationId le reçoit
      // du client, sinon refus FR explicite (jamais de génération main).
      if (V.schemaRequiresOperationId(schema)) {
        const op = (input as { operationId?: unknown }).operationId;
        if (typeof op !== "string" || op.trim().length === 0) {
          throw new Error("Opération non identifiée : veuillez réessayer l'action.");
        }
      }
      // Vente à crédit / partielle : capabilities dédiées (§5).
      // Crédit (reste > 0) → debt-management ; partiel (0 < payé < total) →
      // partial-payments. Comptant intégral : aucune feature requise.
      // EL-24: mêmes gates pour les workflows qui créent du crédit sans
      // passer par sales.create (returns crédit, bread partiel, conversions).
      if (channel === IPC_CHANNELS["returns.create"]) {
        const rc = input as unknown as { creditMinor?: unknown };
        if (typeof rc.creditMinor === "number" && rc.creditMinor > 0) {
          requireLicensedFeature(deps, "debt-management");
        }
      }
      if (channel === IPC_CHANNELS["bread.create"]) {
        const bc = input as unknown as {
          quantity?: unknown;
          unitPriceMinor?: unknown;
          amountPaidMinor?: unknown;
        };
        if (
          typeof bc.quantity === "number" &&
          typeof bc.unitPriceMinor === "number" &&
          typeof bc.amountPaidMinor === "number"
        ) {
          const total = Math.round(bc.unitPriceMinor * bc.quantity);
          if (total > 0 && bc.amountPaidMinor < total) {
            requireLicensedFeature(deps, "debt-management");
            if (bc.amountPaidMinor > 0) requireLicensedFeature(deps, "partial-payments");
          }
        }
      }
      if (channel === IPC_CHANNELS["bread.transfer"]) {
        requireLicensedFeature(deps, "debt-management");
      }
      // Conversions : le total vient de la DB (devis/commande) — on le charge
      // ici (lecture synchrone) pour gater avant toute mutation.
      if (channel === IPC_CHANNELS["proformas.convert"]) {
        const cc = input as unknown as { proformaId?: unknown; amountPaidMinor?: unknown };
        if (typeof cc.proformaId === "number" && typeof cc.amountPaidMinor === "number") {
          try {
            const prow = getDb()
              .prepare(`SELECT total_minor FROM proforma_invoices WHERE id = ?`)
              .get(cc.proformaId) as { total_minor: number } | undefined;
            const ptotal = typeof prow?.total_minor === "number" ? prow.total_minor : null;
            if (ptotal != null && ptotal > 0 && cc.amountPaidMinor < ptotal) {
              requireLicensedFeature(deps, "debt-management");
              if (cc.amountPaidMinor > 0) requireLicensedFeature(deps, "partial-payments");
            }
          } catch {
            /* garde best-effort : le repo tranche (not found / licence) */
          }
        }
      }
      if (channel === IPC_CHANNELS["bread.convert"]) {
        const bc2 = input as unknown as { id?: unknown };
        if (typeof bc2.id === "number") {
          try {
            const brow = getDb()
              .prepare(`SELECT total_minor, amount_paid_minor FROM bread_orders WHERE id = ?`)
              .get(bc2.id) as { total_minor: number; amount_paid_minor: number } | undefined;
            if (brow && brow.total_minor > brow.amount_paid_minor) {
              requireLicensedFeature(deps, "debt-management");
              if (brow.amount_paid_minor > 0) requireLicensedFeature(deps, "partial-payments");
            }
          } catch {
            /* garde best-effort */
          }
        }
      }
      if (channel === IPC_CHANNELS["sales.create"]) {
        // P0-7 : la remise vit dans les lignes (original − final) × qty —
        // le total de gate se recalcule aux prix FACTURÉS (jamais aux originaux).
        const sale = input as unknown as {
          amountPaidMinor?: unknown;
          totalMinor?: unknown;
          deliveryFeeMinor?: unknown;
          lines?: Array<{
            originalUnitPriceMinor?: unknown;
            unitPriceMinor?: unknown;
            quantity?: unknown;
          }>;
        };
        const paid = typeof sale.amountPaidMinor === "number" ? sale.amountPaidMinor : null;
        let total: number | null = typeof sale.totalMinor === "number" ? sale.totalMinor : null;
        if (total == null && Array.isArray(sale.lines)) {
          let charged = 0;
          let valid = true;
          for (const l of sale.lines) {
            if (typeof l.unitPriceMinor !== "number" || typeof l.quantity !== "number") {
              valid = false;
              break;
            }
            charged += Math.round(l.unitPriceMinor * l.quantity);
          }
          if (valid) {
            const delivery = typeof sale.deliveryFeeMinor === "number" ? sale.deliveryFeeMinor : 0;
            total = charged + delivery;
          }
        }
        if (paid != null && total != null && total > 0 && paid < total) {
          requireLicensedFeature(deps, "debt-management");
          if (paid > 0) requireLicensedFeature(deps, "partial-payments");
        }
      }
      const data = fn(input);
      return ok(data);
    } catch (err) {
      log("ERROR", "ipc", "handler.failed", {
        channel,
        operation_id: requestId,
        duration_ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
      const user = toUserMessage(err);
      return { ok: false, ...user };
    }
  });
}

/**
 * Noyau IPC enregistrable SANS base ouverte (mode récupération) : lecture du
 * chemin, redémarrage, déplacement vérifié, dossiers — jamais de requêtes
 * métier. Le mode nominal appelle registerIpc() qui inclut ce noyau.
 */
export function registerCoreIpc(): void {
  // app
  handle(IPC_CHANNELS["app.getVersion"], null, () => ({
    version: app.getVersion(),
    logicalDb: LOGICAL_DB_NAME,
    file: PHYSICAL_DB_FILENAME,
  }));
  handle(IPC_CHANNELS["app.restart"], null, () => {
    try {
      checkpointAndClose();
    } catch {
      /* best effort before relaunch */
    }
    app.relaunch();
    app.exit(0);
    return { restarting: true };
  });
  handle(IPC_CHANNELS["database.location"], null, () => ({
    logicalName: LOGICAL_DB_NAME,
    fileName: PHYSICAL_DB_FILENAME,
    path: getConfiguredDbPath(),
    folder: getDataFolder(),
  }));
  handle(IPC_CHANNELS["system.openDataFolder"], null, () => {
    openPathSafe(getDataFolder(), [getDataFolder()]);
    return { opened: true };
  });
  handle(IPC_CHANNELS["system.openLogsFolder"], null, () => openLogsFolder());
  handle(IPC_CHANNELS["system.selectFolder"], null, () => ({ folder: pickFolder() }));
  // Déplacement vérifié (copie → contrôle → bascule) : utilisable en récupération
  // pour pointer vers un dossier sain sans toucher au schéma ni aux données.
  handle(IPC_CHANNELS["database.relocate"], V.relocateSchema, (input) => {
    // EL-28: validation racine centralisée (absolu + anti-système + symlink),
    // au lieu du seul includes("..").
    const safeFolder = assertSafeUserFolder(input.folder);
    const current = getConfiguredDbPath();
    if (!fs.existsSync(current)) {
      throw new Error("Base actuelle introuvable : déplacement impossible.");
    }
    const target = path.join(safeFolder, PHYSICAL_DB_FILENAME);
    if (!isAllowedDatabaseFile(target)) {
      throw new Error("Dossier de destination invalide.");
    }
    if (path.normalize(target).toLowerCase() === path.normalize(current).toLowerCase()) {
      return { moved: true, path: current };
    }
    // Écraser silencieusement une base existante = perte de données : refus.
    if (fs.existsSync(target)) {
      throw new Error("La destination contient déjà une base. Choisissez un dossier vide.");
    }
    try {
      getDb().pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      checkpoint();
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(current, target);
    // P03: après un TRUNCATE réussi le WAL est vide ; si des compagnons
    // résiduels subsistent côté source (crash antérieur), les copier aussi
    // pour ne perdre aucune frame, puis vérifier la copie complète.
    for (const suffix of ["-wal", "-shm", "-journal"] as const) {
      const src = `${current}${suffix}`;
      try {
        if (fs.existsSync(src)) fs.copyFileSync(src, `${target}${suffix}`);
      } catch {
        /* compagnon illisible : copie principale conservée */
      }
    }
    verifyDbFileCopy(target);
    checkpointAndClose();
    // Config persistée APRÈS reopen réussi : en cas d'échec, on restaure
    // l'ancien chemin et on rouvre l'ancienne base (jamais d'état cassé).
    const previous = current;
    persistDbPath(target);
    try {
      const reopened = reopenWithRetry("database.relocated");
      log("INFO", "database", "database.relocated", { from: previous, to: target });
      return { moved: true, path: reopened.path };
    } catch (err) {
      log("ERROR", "database", "database.relocate_reopen_failed", { error: String(err) });
      persistDbPath(previous);
      // P0-2 : l'ancienne base doit rouvrir — réessais, puis échec FORT (jamais
      // de db=null silencieux) avec message FR orientant vers la récupération.
      try {
        reopenWithRetry("database.relocate_rollback");
      } catch (fatalErr) {
        log("ERROR", "database", "database.relocate_rollback_failed", {
          error: String(fatalErr),
        });
        throw new Error(
          "Déplacement annulé mais la base n'a pas pu être rouverte. Redémarrez l'application ou réessayez depuis l'écran de récupération.",
        );
      }
      throw new Error("Déplacement annulé : l'ancienne base a été conservée.");
    }
  });
}

/**
 * Canaux de récupération (base non prête) : réessai en place + sortie.
 * Charge utile vide validée par Zod, comme tous les autres canaux explicites.
 */
export function registerRecoveryIpc(callbacks: {
  onRetry: () => { switched: boolean; userMessage: string };
  onExit: () => void;
}): void {
  ipcMain.handle(IPC_CHANNELS["recovery.retry"], (_event, raw: unknown) => {
    try {
      V.recoveryActionSchema.parse(raw ?? {});
    } catch (err) {
      const user = toUserMessage(err);
      return { ok: false, ...user };
    }
    // Échec persistant : message FR déjà prêt en base (jamais de stack vers l'UI ;
    // le détail technique a été journalisé en FATAL par la tentative elle-même).
    const res = callbacks.onRetry();
    if (res.switched) return ok({ mode: "main" });
    return { ok: false, code: "DATABASE_UNAVAILABLE", message: res.userMessage };
  });
  ipcMain.handle(IPC_CHANNELS["recovery.exit"], (_event, raw: unknown) => {
    try {
      V.recoveryActionSchema.parse(raw ?? {});
    } catch (err) {
      const user = toUserMessage(err);
      return { ok: false, ...user };
    }
    try {
      checkpointAndClose();
    } catch (err) {
      log("WARN", "recovery", "exit.close_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    callbacks.onExit();
    return ok({ exiting: true });
  });
}

/**
 * Canaux licence (surface minimale, sans base requise) : statut, identifiant
 * matériel d'affichage, import .vlic via dialogue fichier main, re-vérif.
 * Enregistrable en mode activation (fenêtre dédiée) comme en mode nominal.
 * Aucune signature/clé privée ici — vérification seule.
 */
export function registerLicenseIpc(callbacks?: { onActivated?: () => void }): void {
  const deps = prodLicenseDeps();
  handle(IPC_CHANNELS["license.getStatus"], V.licenseActionSchema, () => getLicenseStatus(deps));
  handle(IPC_CHANNELS["license.getHardwareId"], V.licenseActionSchema, () => {
    const { fingerprint, sources } = getHardwareFingerprint();
    // L'empreinte complète (hash, non sensible) est transmise au fournisseur
    // pour l'émission ; l'affichage court reste `hardwareId`.
    return { hardwareId: formatFingerprintShort(fingerprint), fingerprint, sources };
  });
  handle(IPC_CHANNELS["license.importLicense"], V.licenseActionSchema, () => {
    const win = getMainWindow();
    const opts = {
      title: "Importer la licence Veloria POS",
      filters: [{ name: "Licence Veloria (.vlic)", extensions: ["vlic"] }],
      properties: ["openFile" as const],
    };
    const picked = win ? dialog.showOpenDialogSync(win, opts) : dialog.showOpenDialogSync(opts);
    const file = picked?.[0];
    if (!file) return { imported: false, status: getLicenseStatus(deps) };
    let text: string;
    try {
      const stat = fs.statSync(file);
      if (stat.size <= 0 || stat.size > 20000) throw new Error("bad size");
      text = fs.readFileSync(file, "utf-8");
    } catch {
      throw new Error("Fichier de licence illisible.");
    }
    const status = importLicenseEnvelope(deps, text);
    if ((status.state === "ACTIVE" || status.state === "EXPIRING_SOON") && callbacks?.onActivated) {
      callbacks.onActivated();
    }
    return { imported: true, status };
  });
  handle(IPC_CHANNELS["license.validate"], V.licenseActionSchema, () => {
    const status = getLicenseStatus(deps);
    if ((status.state === "ACTIVE" || status.state === "EXPIRING_SOON") && callbacks?.onActivated) {
      callbacks.onActivated();
    }
    return status;
  });
  handle(IPC_CHANNELS["license.getInfo"], V.licenseActionSchema, () => {
    const s = getLicenseStatus(deps);
    return {
      state: s.state,
      licenseId: s.licenseId,
      edition: s.edition,
      licenseType: s.licenseType,
      plan: s.plan,
      clientId: s.clientId,
      clientName: s.clientName,
      storeName: s.storeName,
      maxDevices: s.maxDevices,
      deviceBinding: s.deviceBinding,
      expiresAt: s.expiresAt,
      daysLeft: s.daysLeft,
      features: s.features,
      pages: s.pages,
    };
  });
  // Capabilities en lecture seule (§23) : pages + features issues du payload
  // SIGNÉ vérifié. Aucune écriture, aucun paramètre — le renderer ne peut pas
  // s'octroyer de permissions (pas de setLicensePermissions).
  handle(IPC_CHANNELS["license.getPermissions"], V.licenseActionSchema, () => {
    const s = getLicenseStatus(deps);
    return {
      state: s.state,
      pages: s.pages,
      features: s.features,
    };
  });
}

export function registerIpc(): void {
  registerCoreIpc();
  handle(IPC_CHANNELS["database.health"], null, () => {
    const db = openDatabase();
    const check = integrityCheck();
    return { ...db, integrity: check.integrity, foreignKeyViolations: check.foreignKeys };
  });
  handle(IPC_CHANNELS["system.selectLogo"], null, () => {
    // P2: effet de bord (copie fichier vers userData/logos) → mutation gardée.
    requireLicensedMutation(prodLicenseDeps());
    return pickLogo();
  });

  // Chrome frameless : minimise / bascule agrandi / fermer / état.
  // Fenêtre principale uniquement (jamais de remote, charge vide validée).
  // Chaque accès vérifie la fenêtre détruite : aucun appel après fermeture,
  // aucune exception brute (message FR via toUserMessage).
  const liveMainWindow = (): import("electron").BrowserWindow => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) throw new Error("Fenêtre principale introuvable.");
    return win;
  };
  handle(IPC_CHANNELS["window.minimize"], V.windowActionSchema, () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.minimize();
    return { minimized: true };
  });
  handle(IPC_CHANNELS["window.toggleMaximize"], V.windowActionSchema, () => {
    const win = liveMainWindow();
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return { maximized: win.isMaximized() };
  });
  handle(IPC_CHANNELS["window.close"], V.windowActionSchema, () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.close();
    return { closed: true };
  });
  handle(IPC_CHANNELS["window.isMaximized"], V.windowActionSchema, () => {
    const win = getMainWindow();
    return { maximized: win && !win.isDestroyed() ? win.isMaximized() : false };
  });

  // products
  handle(IPC_CHANNELS["products.search"], V.productSearchSchema, (input) =>
    Products.searchProducts({
      query: input.query,
      categoryId: input.categoryId ?? null,
      stockFilter: input.stockFilter,
      includeArchived: input.includeArchived,
      page: input.page,
      pageSize: input.pageSize,
    }),
  );
  handle(IPC_CHANNELS["products.restore"], V.idempotentIdSchema, (input) => {
    Products.restoreProduct(input.id, new Date().toISOString(), input.operationId);
    return { restored: true };
  });
  handle(IPC_CHANNELS["products.getByBarcode"], V.barcodeSchema, (input) => ({
    product: Products.getProductByBarcode(input.barcode.trim()),
  }));
  handle(IPC_CHANNELS["products.matchBatch"], V.productsMatchBatchSchema, (input) => ({
    results: Products.matchProductsBatch(
      input.items.map((i) => ({ barcode: i.barcode ?? null, name: i.name })),
    ),
  }));
  handle(IPC_CHANNELS["products.barcodes"], V.idSchema, (input) => ({
    rows: Products.getProductBarcodes(input.id),
  }));
  handle(IPC_CHANNELS["products.get"], V.idSchema, (input) => ({
    product: Products.getProduct(input.id),
  }));
  handle(IPC_CHANNELS["products.create"], V.productCreateSchema, (input) => {
    const now = new Date().toISOString();
    const id = Products.createProduct({
      uuid: randomUUID(),
      operationId: input.operationId,
      name: input.name,
      categoryId: input.categoryId ?? null,
      unitCode: input.unitCode,
      purchasePriceMinor: input.purchasePriceMinor,
      sellingPriceMinor: input.sellingPriceMinor,
      quantity: input.quantity,
      minStockLevel: input.minStockLevel,
      maxStockLevel: input.maxStockLevel,
      expirationDate: input.expirationDate ?? null,
      supplierId: input.supplierId ?? null,
      barcodes: input.barcodes,
      now,
    });
    return { id };
  });
  handle(IPC_CHANNELS["products.update"], V.productUpdateSchema, (input) => {
    Products.updateProduct({
      id: input.id,
      name: input.name,
      categoryId: input.categoryId ?? null,
      unitCode: input.unitCode,
      purchasePriceMinor: input.purchasePriceMinor,
      sellingPriceMinor: input.sellingPriceMinor,
      quantity: input.quantity,
      minStockLevel: input.minStockLevel,
      maxStockLevel: input.maxStockLevel,
      expirationDate: input.expirationDate ?? null,
      supplierId: input.supplierId ?? null,
      barcodes: input.barcodes,
      now: new Date().toISOString(),
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["products.archive"], V.idempotentIdSchema, (input) => {
    Products.archiveProduct(input.id, new Date().toISOString(), input.operationId);
    return { archived: true };
  });
  handle(IPC_CHANNELS["products.delete"], V.idempotentIdSchema, (input) => {
    Products.deleteProductAtomic(input.id, new Date().toISOString(), input.operationId);
    return { deleted: true };
  });
  handle(IPC_CHANNELS["products.suppliers"], V.idSchema, (input) => ({
    rows: Products.getProductSuppliers(input.id),
  }));
  handle(IPC_CHANNELS["products.setSuppliers"], V.productSuppliersSchema, (input) =>
    Products.setProductSuppliersAtomic(
      input.productId,
      input.supplierIds,
      new Date().toISOString(),
    ),
  );

  // customers (repository : handlers/customers.repo.ts)
  handle(
    IPC_CHANNELS["customers.search"],
    V.paginationSchema.extend({
      query: V.productSearchSchema.shape.query,
      includeArchived: V.productSearchSchema.shape.includeArchived,
      debtFilter: V.customerDebtFilterSchema.default("all"),
      archivedOnly: V.archivedOnlySchema,
    }),
    (input) =>
      Customers.searchCustomers(
        input.query,
        input.page,
        input.pageSize,
        input.includeArchived,
        input.debtFilter,
        input.archivedOnly ?? false,
      ),
  );
  handle(IPC_CHANNELS["customers.stats"], null, () => Customers.getCustomerStats());
  handle(IPC_CHANNELS["customers.restore"], V.idempotentIdSchema, (input) => {
    Customers.restoreCustomer(input.id, new Date().toISOString(), input.operationId);
    return { restored: true };
  });
  handle(IPC_CHANNELS["customers.create"], V.customerCreateSchema, (input) => ({
    id: Customers.createCustomer({
      operationId: input.operationId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      address: input.address ?? null,
      creditLimitMinor: input.creditLimitMinor,
      initialBalanceMinor: input.initialBalanceMinor,
      settlementDay: input.settlementDay ?? null,
      isBreadClient: input.isBreadClient,
      creditAllowed: input.creditAllowed,
      notes: input.notes ?? null,
      now: new Date().toISOString(),
    }),
  }));
  handle(IPC_CHANNELS["customers.update"], V.customerUpdateSchema, (input) => {
    Customers.updateCustomer({
      id: input.id,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      address: input.address ?? null,
      creditLimitMinor: input.creditLimitMinor,
      creditAllowed: input.creditAllowed,
      settlementDay: input.settlementDay ?? null,
      notes: input.notes ?? null,
      now: new Date().toISOString(),
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["customers.archive"], V.idempotentIdSchema, (input) => {
    Customers.archiveCustomer(input.id, new Date().toISOString(), input.operationId);
    return { archived: true };
  });
  handle(IPC_CHANNELS["customers.recordPayment"], V.recordPaymentSchema, (input) => {
    const now = new Date().toISOString();
    // P08: paymentDate est une businessDate YYYY-MM-DD — jamais un ISO datetime.
    const paymentDate = input.paymentDate ?? now.slice(0, 10);
    const { paymentId } = Customers.recordCustomerPaymentAtomic({
      operationId: input.operationId,
      customerId: input.customerId ?? null,
      saleId: input.saleId ?? null,
      amountMinor: input.amountMinor,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      paymentDate,
      now,
    });
    return { recorded: true, paymentId };
  });
  handle(IPC_CHANNELS["customers.statement"], V.idSchema, (input) =>
    Customers.getCustomerStatement(input.id),
  );
  handle(IPC_CHANNELS["customers.get"], V.idSchema, (input) => ({
    customer: Customers.getCustomer(input.id),
  }));

  // categories (filtre catalogue)
  handle(IPC_CHANNELS["categories.list"], null, () => ({
    rows: Products.listCategories(),
  }));
  handle(IPC_CHANNELS["categories.create"], V.categoryCreateSchema, (input) => ({
    id: Products.createCategory(input.name, new Date().toISOString()),
  }));

  // sales
  handle(IPC_CHANNELS["sales.create"], V.saleCreateSchema, (input) => {
    // Totaux recalculés côté main en arithmétique entière (défense en profondeur ;
    // le renderer valide déjà via le domaine, les CHECK SQL tranchent).
    // P0-7 : la remise vit dans les lignes — subtotal aux prix d'ORIGINE,
    // remise = Σ(original − final) × qty (même règle que sale-rules).
    const now = new Date().toISOString();
    const priced = input.lines.map((l) => {
      const charged = Math.round(l.unitPriceMinor * l.quantity);
      const original = Math.round(l.originalUnitPriceMinor * l.quantity);
      return { line: l, charged, original, discount: original - charged };
    });
    const subtotal = priced.reduce((a, p) => a + p.original, 0);
    const discountAmount = priced.reduce((a, p) => a + p.discount, 0);
    const chargedTotals = priced.map((p) => p.charged);
    const total = subtotal - discountAmount + input.deliveryFeeMinor;
    const remaining = total - input.amountPaidMinor;
    const status =
      total === 0
        ? "paid"
        : remaining === 0
          ? "paid"
          : input.amountPaidMinor === 0
            ? "unpaid"
            : "partial";
    const settings = { allowNegativeStock: false };
    try {
      const row = getDb()
        .prepare(`SELECT value_json FROM app_settings WHERE key = 'inventory'`)
        .get() as { value_json: string } | undefined;
      if (row)
        settings.allowNegativeStock =
          (JSON.parse(row.value_json) as { allowNegativeStock?: boolean }).allowNegativeStock ===
          true;
    } catch {
      /* default */
    }
    const result = Sales.createSaleAtomic({
      operationId: input.operationId,
      uuid: randomUUID(),
      invoiceNumber: "",
      customerId: input.customerId ?? null,
      subtotalMinor: subtotal,
      // P0-7 : vente sans remise globale — la remise est portée par les lignes
      // (discount_amount_minor = Σ remises de lignes, colonnes conservées).
      discountType: "none",
      discountValueMinor: 0,
      discountAmountMinor: discountAmount,
      deliveryFeeMinor: input.deliveryFeeMinor,
      totalMinor: total,
      amountPaidMinor: input.amountPaidMinor,
      remainingMinor: remaining,
      paymentStatus: status,
      paymentMethod: input.paymentMethod ?? (input.amountPaidMinor > 0 ? "cash" : null),
      dueDate: input.dueDate ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        unitCode: l.unitCode,
        originalUnitPriceMinor: l.originalUnitPriceMinor,
        unitPriceMinor: l.unitPriceMinor,
        purchasePriceMinor: l.purchasePriceMinor,
        quantity: l.quantity,
      })),
      lineTotals: chargedTotals,
      now,
      allowNegativeStock: settings.allowNegativeStock,
    });
    return result;
  });
  handle(
    IPC_CHANNELS["sales.history"],
    V.paginationSchema.extend({ query: V.productSearchSchema.shape.query }),
    (input) => Sales.listSalesHistory(input.page, input.pageSize, input.query),
  );
  handle(IPC_CHANNELS["sales.cancel"], V.idempotentIdSchema, (input) => {
    Sales.cancelSaleAtomic(input.id, new Date().toISOString(), input.operationId);
    return { cancelled: true };
  });
  handle(IPC_CHANNELS["sales.get"], V.idSchema, (input) => Sales.getSaleDetail(input.id));
  handle(IPC_CHANNELS["sales.setDueDate"], V.saleDueDateSchema, (input) => {
    Sales.updateSaleDueDate(input.id, input.dueDate ?? null, new Date().toISOString());
    return { updated: true };
  });

  // P4 : brouillons paniers — lectures/écritures TOUJOURS ouvertes (brouillons
  // éphémères : un poste expiré restaure son travail et peut se réactiver ;
  // la VENTE elle-même reste gardée par sales.create).
  handle(IPC_CHANNELS["carts.save"], V.cartsSaveSchema, (input) =>
    Carts.saveCartDraftsAtomic(
      input.tabs.map((t) => ({
        ...t,
        customerId: t.customerId ?? null,
        paymentMethod: t.paymentMethod ?? null,
      })),
      new Date().toISOString(),
    ),
  );
  handle(IPC_CHANNELS["carts.load"], null, () => ({ tabs: Carts.loadCartDrafts() }));
  handle(IPC_CHANNELS["carts.clear"], null, () => Carts.clearCartDrafts());

  // reports/dashboard (repository : handlers/finance.repo.ts).
  // NOTE : l'ancien canal `reports.period` (non validé, redondant avec
  // `reports.full`) a été supprimé — aucun appelant.
  // NOTE : `reports.dashboard` (doublon de `dashboard.summary`, aucun appelant)
  // a été supprimé — `dashboard.summary` est l'unique synthèse.

  // historique unifié (lecture seule, UNION multi-tables).
  handle(IPC_CHANNELS["history.list"], V.historyListSchema, (input) =>
    History.listHistory({
      op: input.op,
      from: input.from ?? null,
      to: input.to ?? null,
      query: input.query,
      sort: input.sort,
      page: input.page,
      pageSize: input.pageSize,
    }),
  );
  handle(IPC_CHANNELS["history.detail"], V.historyDetailSchema, (input) =>
    History.getHistoryDetail(input.kind, input.id),
  );
  handle(IPC_CHANNELS["history.stats"], V.historyStatsSchema, (input) =>
    History.getHistoryStats(input.from ?? null, input.to ?? null),
  );

  // expenses (repository : handlers/expenses.repo.ts)
  handle(IPC_CHANNELS["expenses.create"], V.expenseCreateSchema, (input) => ({
    id: Expenses.createExpense({
      operationId: input.operationId,
      description: input.description,
      category: input.category,
      amountMinor: input.amountMinor,
      expenseDate: input.expenseDate,
      supplierId: input.supplierId ?? null,
      paymentMethod: input.paymentMethod ?? null,
      status: input.status,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      now: new Date().toISOString(),
    }),
  }));
  handle(IPC_CHANNELS["expenses.list"], V.expenseListSchema, (input) =>
    Expenses.listExpensesUnified(input.query, input.page, input.pageSize, {
      category: input.category ?? null,
      statusFilter: input.statusFilter,
      methodFilter: input.methodFilter,
      from: input.from ?? null,
      to: input.to ?? null,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["expenses.update"], V.expenseUpdateSchema, (input) => {
    Expenses.updateExpense({
      id: input.id,
      description: input.description,
      category: input.category,
      amountMinor: input.amountMinor,
      expenseDate: input.expenseDate,
      supplierId: input.supplierId ?? null,
      paymentMethod: input.paymentMethod ?? null,
      status: input.status,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      now: new Date().toISOString(),
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["expenses.delete"], V.expenseDeleteSchema, (input) => {
    Expenses.deleteExpenseAtomic(input.id, new Date().toISOString(), input.operationId ?? null);
    return { deleted: true };
  });
  handle(IPC_CHANNELS["expenses.stats"], null, () => Expenses.getExpenseStats());

  // company (repository : handlers/company.repo.ts, schéma validé)
  // logoDataUrl joint (meilleur effort) pour l'aperçu Paramètres sans accès fichier renderer.
  handle(IPC_CHANNELS["company.get"], null, () => {
    const company = Company.getCompany();
    let logoDataUrl: string | null = null;
    try {
      logoDataUrl = readLogoDataUrlFromFile(
        (company as { logo_path?: unknown } | null)?.logo_path as string | null,
      );
    } catch {
      logoDataUrl = null;
    }
    return { company, logoDataUrl };
  });
  handle(IPC_CHANNELS["company.update"], V.companyUpdateSchema, (input) => {
    Company.saveCompany(
      {
        company_name: input.company_name ?? null,
        commercial_name: input.commercial_name ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        website: input.website ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        tax_number: input.tax_number ?? null,
        commercial_register: input.commercial_register ?? null,
        invoice_prefix: input.invoice_prefix ?? null,
        logo_path: input.logo_path ?? null,
      },
      new Date().toISOString(),
    );
    return { saved: true };
  });

  // backup / printing are registered by their modules (backup.ts / printing.ts)

  // database integrity (base ouverte requise ; la relocation vit dans le noyau)
  handle(IPC_CHANNELS["database.integrity"], null, () => {
    const check = integrityCheck();
    if (check.integrity !== "ok" || check.foreignKeys.length !== 0) {
      throw new Error(
        "Base de données corrompue ou incohérente. Restaurez une sauvegarde vérifiée.",
      );
    }
    return check;
  });
  handle(IPC_CHANNELS["database.optimize"], null, () => optimizeDatabase());
  // Réinitialisation d'usine (zone dangereuse, paramètres) : base vierge,
  // sauvegardes *.vposdb conservées. Gardée par la licence (mutation
  // destructive) + page settings, preuve littérale exigée par le schéma.
  handle(IPC_CHANNELS["database.reset"], V.databaseResetSchema, () => factoryResetDatabase());

  // app diagnostics (Settings > Diagnostics — spec 23 : version, OS, base,
  // taille, schéma, santé, sauvegardes, imprimante, journaux ; jamais de secret)
  handle(IPC_CHANNELS["app.diagnostics"], null, () => {
    let check: { integrity: string; foreignKeys: unknown[] };
    try {
      check = integrityCheck();
    } catch {
      // Base non ouvrable : diagnostics quand même (version, chemins, erreur).
      check = { integrity: "inaccessible", foreignKeys: [] };
    }
    let dbSize = 0;
    try {
      dbSize = fs.statSync(getConfiguredDbPath()).size;
    } catch {
      /* base absente */
    }
    let schemaVersion = 0;
    try {
      const row = getDb().prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as {
        v: number | null;
      };
      schemaVersion = row.v ?? 0;
    } catch {
      /* base non initialisée */
    }
    let backups: { count: number; lastAt: string | null } = { count: 0, lastAt: null };
    try {
      const st = backupStatus();
      backups = { count: st.count, lastAt: st.lastAt };
    } catch {
      /* best effort */
    }
    let license: { state: string; edition: string | null } = {
      state: "UNACTIVATED",
      edition: null,
    };
    try {
      const st = getLicenseStatus(prodLicenseDeps());
      license = { state: st.state, edition: st.edition };
    } catch {
      /* diagnostics best effort, jamais bloquants */
    }
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      os: friendlyOsLabel(),
      osDetail: `${os.platform()} ${os.release()} ${os.arch()}`,
      license,
      dbPath: getConfiguredDbPath(),
      dbSize,
      schemaVersion,
      integrity: check.integrity,
      logicalName: LOGICAL_DB_NAME,
      backups: backups.count,
      lastBackup: backups.lastAt ?? "aucune",
      printer: getSelectedPrinterName() ?? "défaut système",
      logFolder: getLogFile() || "indisponible",
    };
  });

  // returns (repository : handlers/returns.repo.ts — 1 tx atomique)
  handle(IPC_CHANNELS["returns.create"], V.returnCreateSchema, (input) => {
    const now = new Date().toISOString();
    const createdAt = input.returnDate ? `${input.returnDate}T00:00:00.000Z` : now;
    if (input.kind === "supplier") {
      if (input.intakeId == null) throw new Error("Bon d'achat requis pour un retour fournisseur.");
      return Returns.createSupplierReturnAtomic({
        operationId: input.operationId,
        intakeId: input.intakeId,
        items: input.items.map((i) => ({
          productId: i.productId ?? null,
          quantity: i.quantity,
          condition: i.condition,
        })),
        recoverMinor: input.refundMinor,
        recoverMethod: input.refundMinor > 0 ? (input.refundMethod ?? null) : null,
        reason: input.reason,
        notes: input.notes ?? null,
        createdAt,
        now,
      });
    }
    if (input.saleId == null) throw new Error("Vente d'origine requise pour un retour client.");
    return Returns.createReturnAtomic({
      operationId: input.operationId,
      originalSaleId: input.saleId,
      items: input.items.map((i) => ({
        productId: i.productId ?? null,
        quantity: i.quantity,
        restocked: i.restocked,
        condition: i.condition,
      })),
      refundMinor: input.refundMinor,
      creditMinor: input.creditMinor,
      refundMethod: input.refundMinor > 0 ? (input.refundMethod ?? null) : null,
      reason: input.reason,
      notes: input.notes ?? null,
      createdAt,
      now,
    });
  });
  handle(IPC_CHANNELS["returns.list"], V.returnListSchema, (input) =>
    Returns.listReturnsUnified(input.query, input.page, input.pageSize, {
      typeFilter: input.typeFilter,
      statusFilter: input.statusFilter,
      from: input.from ?? null,
      to: input.to ?? null,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["returns.detail"], V.returnTargetSchema, (input) =>
    Returns.getReturnDetail(input.kind, input.id),
  );
  handle(IPC_CHANNELS["returns.saleItems"], V.idSchema, (input) =>
    Returns.getReturnableSaleItems(input.id),
  );
  handle(IPC_CHANNELS["returns.intakeItems"], V.idSchema, (input) =>
    Returns.getReturnableIntakeItems(input.id),
  );
  handle(IPC_CHANNELS["returns.refund"], V.returnRefundSchema, (input) => {
    Returns.recordReturnRefundAtomic({
      kind: input.kind,
      id: input.id,
      amountMinor: input.amountMinor,
      method: input.method,
      now: new Date().toISOString(),
      operationId: input.operationId,
    });
    return { refunded: true };
  });
  handle(IPC_CHANNELS["returns.cancel"], V.returnCancelSchema, (input) => {
    Returns.cancelReturnAtomic({
      kind: input.kind,
      id: input.id,
      now: new Date().toISOString(),
      operationId: input.operationId,
    });
    return { cancelled: true };
  });
  handle(IPC_CHANNELS["returns.stats"], null, () => Returns.getReturnsStats());

  // Printing IPC is owned by electron/printing/printing.service.ts
  // (registerPrintingIpc). Do NOT register printing.* channels here:
  // ipcMain.handle throws on duplicate registration and aborts startup
  // before createMainWindow (found during Phase 3 runtime QA).

  // ---- Phase 6 : stock ----
  handle(IPC_CHANNELS["stock.overview"], null, () => Inventory.getStockOverview());
  handle(IPC_CHANNELS["stock.lowStock"], V.paginationSchema, (input) => ({
    rows: Inventory.listLowStock(input.pageSize),
  }));
  handle(IPC_CHANNELS["stock.ledger"], V.idSchema, (input) => ({
    rows: Inventory.getLedger(input.id, 100),
  }));
  handle(IPC_CHANNELS["stock.adjust"], V.stockAdjustSchema, (input) =>
    Inventory.adjustStockAtomic({
      productId: input.productId,
      newQuantity: input.newQuantity,
      reason: input.reason,
      reference: input.reference ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["stock.products"], V.stockProductsSchema, (input) =>
    Inventory.listStockProducts(input.query, input.page, input.pageSize, {
      categoryId: input.categoryId ?? null,
      stockStatus: input.stockStatus,
      movementType: input.movementType,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["stock.movements"], V.stockMovementsSchema, (input) =>
    Inventory.listMovements(input.productId, input.page, input.pageSize, {
      from: input.from ?? null,
      to: input.to ?? null,
      types: input.types,
    }),
  );
  handle(IPC_CHANNELS["stock.inventory"], V.inventoryApplySchema, (input) =>
    Inventory.applyInventoryAtomic({
      items: input.items,
      reason: input.reason,
      reference: input.reference ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["stock.intake"], V.stockIntakeSchema, (input) =>
    Inventory.receiveStockAtomic({
      supplierId: input.supplierId ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      invoiceDate: input.invoiceDate,
      shippingMinor: input.shippingMinor,
      notes: input.notes ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId ?? null,
        productName: l.productName,
        quantityReceived: l.quantityReceived,
        quantityDamaged: l.quantityDamaged,
        purchasePriceMinor: l.purchasePriceMinor,
        sellingPriceMinor: l.sellingPriceMinor ?? null,
      })),
      // Clé d'idempotence générée côté renderer (un UUID par facture) : rejouer
      // le même IPC retourne la réception existante sans double stock/dette.
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["stock.intakes"], V.paginationSchema, (input) =>
    Inventory.listIntakes(input.page, input.pageSize),
  );
  handle(IPC_CHANNELS["stock.valuation"], null, () => Inventory.getInventoryValuation());

  // ---- Phase 6 : fournisseurs ----
  handle(IPC_CHANNELS["suppliers.search"], V.supplierSearchSchema, (input) =>
    Suppliers.searchSuppliers(input.query, input.page, input.pageSize, {
      statusFilter: input.statusFilter,
      paymentFilter: input.paymentFilter,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["suppliers.create"], V.supplierCreateSchema, (input) => ({
    id: Suppliers.createSupplier({
      operationId: input.operationId,
      name: input.name,
      code: input.code ?? null,
      contact: input.contact ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      taxNumber: input.taxNumber ?? null,
      commercialRegister: input.commercialRegister ?? null,
      notes: input.notes ?? null,
      isActive: input.isActive,
      now: new Date().toISOString(),
    }),
  }));
  handle(IPC_CHANNELS["suppliers.update"], V.supplierUpdateSchema, (input) => {
    Suppliers.updateSupplier({
      id: input.id,
      name: input.name,
      code: input.code ?? null,
      contact: input.contact ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      taxNumber: input.taxNumber ?? null,
      commercialRegister: input.commercialRegister ?? null,
      notes: input.notes ?? null,
      isActive: input.isActive,
      now: new Date().toISOString(),
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["suppliers.delete"], V.idempotentIdSchema, (input) => {
    Suppliers.deleteSupplierAtomic(input.id, new Date().toISOString(), input.operationId);
    return { deleted: true };
  });
  handle(IPC_CHANNELS["suppliers.deleteMany"], V.supplierDeleteManySchema, (input) =>
    Suppliers.deleteSuppliersAtomic(input.ids, new Date().toISOString(), input.operationId),
  );
  handle(IPC_CHANNELS["suppliers.pay"], V.supplierPaySchema, (input) => {
    const { paymentId } = Suppliers.recordSupplierPaymentAtomic({
      operationId: input.operationId,
      supplierId: input.supplierId,
      amountMinor: input.amountMinor,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      paymentDate: input.paymentDate,
      now: new Date().toISOString(),
    });
    return { paid: true, paymentId };
  });
  handle(IPC_CHANNELS["suppliers.statement"], V.idSchema, (input) =>
    Suppliers.getSupplierStatement(input.id),
  );
  handle(IPC_CHANNELS["suppliers.products"], V.idSchema, (input) =>
    Suppliers.getSupplierProducts(input.id),
  );
  handle(IPC_CHANNELS["suppliers.stats"], null, () => Suppliers.getSupplierStats());

  // ---- P3 : bons de commande fournisseurs ----
  handle(IPC_CHANNELS["purchase.create"], V.purchaseCreateSchema, (input) =>
    Purchase.createPurchaseOrderAtomic({
      supplierId: input.supplierId,
      expectedDate: input.expectedDate ?? null,
      notes: input.notes ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId ?? null,
        productName: l.productName,
        unitCode: l.unitCode,
        quantityOrdered: l.quantityOrdered,
        unitCostMinor: l.unitCostMinor,
      })),
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["purchase.list"], V.purchaseListSchema, (input) =>
    Purchase.listPurchaseOrders({
      supplierId: input.supplierId ?? null,
      status: input.status ?? null,
      page: input.page,
      pageSize: input.pageSize,
    }),
  );
  handle(IPC_CHANNELS["purchase.detail"], V.idSchema, (input) =>
    Purchase.getPurchaseOrder(input.id),
  );
  handle(IPC_CHANNELS["purchase.order"], V.idempotentIdSchema, (input) => {
    Purchase.orderPurchaseOrder(input.id, input.operationId, new Date().toISOString());
    return { ordered: true };
  });
  handle(IPC_CHANNELS["purchase.cancel"], V.idempotentIdSchema, (input) => {
    Purchase.cancelPurchaseOrder(input.id, input.operationId, new Date().toISOString());
    return { cancelled: true };
  });
  handle(IPC_CHANNELS["purchase.receive"], V.purchaseReceiveSchema, (input) =>
    Purchase.receivePurchaseOrderAtomic({
      id: input.id,
      lines: input.lines.map((l) => ({
        itemId: l.itemId,
        quantityReceived: l.quantityReceived,
      })),
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );

  // ---- Phase 7 : proformas ----
  handle(IPC_CHANNELS["proformas.create"], V.proformaCreateSchema, (input) =>
    Proformas.createProformaAtomic({
      customerId: input.customerId ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId ?? null,
        productName: l.productName,
        unitPriceMinor: l.unitPriceMinor,
        quantity: l.quantity,
      })),
      discountMinor: input.discountMinor,
      deliveryMinor: input.deliveryMinor,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["proformas.list"], V.proformaListSchema, (input) =>
    Proformas.listProformas(input.status ?? null, input.page, input.pageSize, {
      query: input.query,
      customer: input.customerId ?? null,
      from: input.from ?? null,
      to: input.to ?? null,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["proformas.status"], V.proformaStatusSchema, (input) => {
    Proformas.setProformaStatus(input.id, input.to, new Date().toISOString());
    return { updated: true };
  });
  handle(IPC_CHANNELS["proformas.convert"], V.proformaConvertSchema, (input) =>
    Proformas.convertProformaToSaleAtomic({
      proformaId: input.proformaId,
      amountPaidMinor: input.amountPaidMinor,
      paymentMethod: input.paymentMethod ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["proformas.update"], V.proformaUpdateSchema, (input) => {
    Proformas.updateProformaAtomic({
      id: input.id,
      customerId: input.customerId ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId ?? null,
        productName: l.productName,
        unitPriceMinor: l.unitPriceMinor,
        quantity: l.quantity,
      })),
      discountMinor: input.discountMinor,
      deliveryMinor: input.deliveryMinor,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      now: new Date().toISOString(),
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["proformas.delete"], V.idempotentIdSchema, (input) => {
    Proformas.deleteProformaAtomic(input.id, new Date().toISOString(), input.operationId);
    return { deleted: true };
  });
  handle(IPC_CHANNELS["proformas.detail"], V.idSchema, (input) =>
    Proformas.getProformaDetail(input.id),
  );
  handle(IPC_CHANNELS["proformas.stats"], null, () => Proformas.getProformaStats());

  // ---- Phase 8 : dettes / rapports / clôtures / zakat ----
  handle(IPC_CHANNELS["debts.list"], V.debtsListSchema, (input) =>
    Finance.listDebtsUnified(input.query, input.page, input.pageSize, {
      typeFilter: input.typeFilter,
      statusFilter: input.statusFilter,
      dueFilter: input.dueFilter,
      settleFilter: input.settleFilter,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["debts.detail"], V.debtTargetSchema, (input) =>
    Finance.getDebtDetail(input.debtType, input.id),
  );
  handle(IPC_CHANNELS["debts.stats"], null, () => Finance.getDebtStats());
  handle(IPC_CHANNELS["reports.full"], V.periodSchema, (input) =>
    Finance.getPeriodReport(input.from, input.to),
  );
  handle(IPC_CHANNELS["reports.summary"], V.reportSummarySchema, (input) =>
    Finance.getReportsSummary({
      from: input.from,
      to: input.to,
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      categoryId: input.categoryId ?? null,
    }),
  );
  handle(IPC_CHANNELS["dashboard.summary"], V.dashboardSummarySchema, (input) =>
    Finance.getDashboardSummary(input.from, input.to),
  );
  handle(IPC_CHANNELS["closings.get"], V.closingsListSchema, (input) =>
    Finance.listClosings(input.from, input.to),
  );
  handle(IPC_CHANNELS["closings.create"], V.closingCreateSchema, (input) =>
    Finance.createDailyClosingAtomic({
      businessDate: input.businessDate,
      openingMinor: input.openingMinor,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["zakat.sources"], null, () => Finance.getZakatSources());
  handle(IPC_CHANNELS["zakat.saveParams"], V.zakatParamsSchema, (input) => {
    Settings.saveZakatParams(
      {
        ratePercent: input.ratePercent,
        nisabMinor: input.nisabMinor,
        hawlDate: input.hawlDate ?? null,
        nisabMethod: input.nisabMethod,
      },
      new Date().toISOString(),
    );
    return { saved: true };
  });
  handle(IPC_CHANNELS["zakat.history"], V.paginationSchema, (input) =>
    Finance.listZakatCalculations(input.page, input.pageSize),
  );
  handle(IPC_CHANNELS["zakat.save"], V.zakatCalculationSchema, (input) =>
    Finance.saveZakatCalculation({
      hijriYear: input.hijriYear,
      calcDate: input.calcDate,
      cashMinor: input.cashMinor,
      bankMinor: input.bankMinor,
      stockMinor: input.stockMinor,
      receivablesMinor: input.receivablesMinor,
      otherMinor: input.otherMinor,
      liabilitiesMinor: input.liabilitiesMinor,
      nisabMinor: input.nisabMinor,
      ratePercent: input.ratePercent,
      notes: input.notes ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );

  // ---- Phase 9 : pain (simplifié + récurrence quotidienne) ----
  handle(IPC_CHANNELS["bread.create"], V.breadCreateSchema, (input) =>
    Bread.createBreadOrderAtomic({
      customerId: input.customerId ?? null,
      customName: input.customName ?? null,
      customPhone: input.customPhone ?? null,
      breadType: input.breadType,
      orderName: input.orderName ?? null,
      isRecurring: input.isRecurring,
      pickupDate: input.pickupDate,
      pickupTime: input.pickupTime ?? null,
      quantity: input.quantity,
      unitPriceMinor: input.unitPriceMinor,
      amountPaidMinor: input.amountPaidMinor,
      paymentMethod: input.paymentMethod ?? null,
      notes: input.notes ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["bread.list"], V.breadListSchema, (input) =>
    Bread.listBreadOrders(input.pickupDate ?? null, input.page, input.pageSize, {
      query: input.query,
      status: input.status ?? null,
      customer: input.customer,
      recurring: input.recurring,
      orderFrom: input.orderFrom ?? null,
      orderTo: input.orderTo ?? null,
      pickupFrom: input.pickupFrom ?? null,
      pickupTo: input.pickupTo ?? null,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["bread.pay"], V.breadPaySchema, (input) => {
    Bread.recordBreadPayment(
      input.id,
      input.amountMinor,
      input.method ?? null,
      new Date().toISOString(),
      input.operationId,
    );
    return { paid: true };
  });
  handle(IPC_CHANNELS["bread.update"], V.breadUpdateSchema, (input) => {
    Bread.updateBreadOrder({
      id: input.id,
      customerId: input.customerId ?? null,
      customName: input.customName ?? null,
      customPhone: input.customPhone ?? null,
      breadType: input.breadType,
      orderName: input.orderName ?? null,
      isRecurring: input.isRecurring,
      pickupDate: input.pickupDate,
      pickupTime: input.pickupTime ?? null,
      notes: input.notes ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["bread.status"], V.breadStatusSchema, (input) => {
    Bread.setBreadOrderStatus(input.id, input.to, new Date().toISOString(), input.operationId);
    return { updated: true };
  });
  handle(IPC_CHANNELS["bread.stats"], null, () => Bread.getBreadStats());
  handle(IPC_CHANNELS["bread.detail"], V.idSchema, (input) => Bread.getBreadOrder(input.id));
  handle(IPC_CHANNELS["bread.transfer"], V.breadTransferSchema, (input) => {
    Bread.transferBreadToCustomerAccount(input.id, new Date().toISOString(), input.operationId);
    return { transferred: true };
  });
  handle(IPC_CHANNELS["bread.updateQty"], V.breadUpdateQtySchema, (input) => {
    Bread.updateBreadQuantity(
      input.id,
      input.quantity,
      new Date().toISOString(),
      input.operationId,
    );
    return { updated: true };
  });
  handle(IPC_CHANNELS["bread.convert"], V.idempotentIdSchema, (input) =>
    Bread.convertBreadToSaleAtomic({
      breadId: input.id,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );

  // ---- Réglages explicites (repository : handlers/settings.repo.ts) ----
  handle(IPC_CHANNELS["settings.get"], V.settingsGetSchema, (input) => {
    if (input.key === "sales") return { value: Settings.getSalesSettings() };
    if (input.key === "invoice") return { value: Settings.getInvoiceSettings() };
    if (input.key === "printing") return { value: Settings.getPrintingSettings() };
    if (input.key === "products") return { value: Settings.getProductsSettings() };
    if (input.key === "customers") return { value: Settings.getCustomersSettings() };
    if (input.key === "suppliers") return { value: Settings.getSuppliersSettings() };
    if (input.key === "sound") return { value: Settings.getSoundSettings() };
    return { value: Settings.getInventorySettings() };
  });
  handle(IPC_CHANNELS["settings.save"], V.settingsSaveSchema, (input) => {
    const now = new Date().toISOString();
    if (input.key === "sales") {
      Settings.saveSalesSettings(V.salesSettingsSchema.parse(input.value), now);
    } else if (input.key === "invoice") {
      Settings.saveInvoiceSettings(V.invoiceSettingsSchema.parse(input.value), now);
    } else if (input.key === "printing") {
      Settings.savePrintingSettings(V.printingSettingsSchema.parse(input.value), now);
    } else if (input.key === "products") {
      Settings.saveProductsSettings(V.productsSettingsSchema.parse(input.value), now);
    } else if (input.key === "customers") {
      Settings.saveCustomersSettings(V.customersSettingsSchema.parse(input.value), now);
    } else if (input.key === "suppliers") {
      Settings.saveSuppliersSettings(V.suppliersSettingsSchema.parse(input.value), now);
    } else if (input.key === "sound") {
      Settings.saveSoundSettings(V.soundSettingsSchema.parse(input.value), now);
    } else {
      Settings.saveInventorySettings(V.inventorySettingsSchema.parse(input.value), now);
    }
    return { saved: true };
  });

  // ---- Import CSV validé-avant-commit ----
  handle(IPC_CHANNELS["products.import"], V.productsImportSchema, (input) =>
    Imports.importProductsAtomic(input.rows, new Date().toISOString(), input.operationId),
  );
  handle(IPC_CHANNELS["customers.import"], V.customersImportSchema, (input) =>
    Imports.importCustomersAtomic(input.rows, new Date().toISOString(), input.operationId),
  );
}
