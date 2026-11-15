// Veloria PoS - IPC: systeme + modeles + diagnostics + reglages + import CSV (extrait de registry.ts, deplacement pur).

import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import * as Imports from "./handlers/import.repo";
import * as Settings from "./handlers/settings.repo";
import * as Templates from "./handlers/templates.repo";
import {
  factoryResetDatabase,
  getDb,
  integrityCheck,
  openDatabase,
  optimizeDatabase,
} from "../database/sqlite.service";
import { getConfiguredDbPath, LOGICAL_DB_NAME } from "../database/database-path.service";
import { backupStatus } from "../backup/backup.service";
import { getSelectedPrinterName } from "../printing/printing.service";
import { getLogFile } from "../services/logger";
import { buildSupportBundle } from "../services/support-bundle";
import { getUpdateStatus, openUpdatePage } from "../services/update-check";
import { getMainWindow } from "../main/window-manager";
import { pickLogo } from "../services/file-ui";
import { getLicenseStatus, requireLicensedMutation } from "../licensing/license-service";
import { prodLicenseDeps } from "../licensing/prod-deps";
import { handle } from "./handle";
import { friendlyOsLabel } from "./ipc-errors";

/**
 * E-48 — `PRAGMA integrity_check` + `foreign_key_check` parcourent TOUTE la
 * base, SYNCHRONEMENT sur le thread principal (celui de toutes les fenêtres et
 * de la saisie caisse). Le canal n'était gardé par rien : ni session, ni
 * permission, ni licence (contrairement à `database.optimize`, aligné en K-05).
 * Un renderer répétant l'appel gelait le poste entier.
 *
 * Le résultat est donc mémoïsé 30 s : le contrôle d'intégrité du DÉMARRAGE
 * reste systématique et frais (chaque boot repart d'un cache vide), et
 * l'écran Réglages ne peut plus déclencher un scan par clic.
 */
const HEALTH_TTL_MS = 30_000;
let healthCache: { atMs: number; integrity: string; foreignKeys: unknown[] } | null = null;

export function registerSystemChannels(): void {
  handle(IPC_CHANNELS["database.health"], V.emptyPayloadSchema, () => {
    const db = openDatabase();
    const nowMs = Date.now();
    const cached = healthCache;
    if (cached === null || nowMs - cached.atMs >= HEALTH_TTL_MS) {
      const check = integrityCheck();
      healthCache = { atMs: nowMs, integrity: check.integrity, foreignKeys: check.foreignKeys };
    }
    const fresh = healthCache;
    if (fresh === null) throw new Error("Contrôle de santé indisponible.");
    // Version moteur réelle (le renderer l'affiche dans la barre d'état —
    // jamais de version codée en dur côté UI, cf. ADR-038).
    let sqliteVersion: string | null = null;
    try {
      const row = getDb().prepare("SELECT sqlite_version() AS v").get() as {
        v?: unknown;
      } | null;
      if (row && typeof row.v === "string") sqliteVersion = row.v;
    } catch {
      /* santé prioritaire : version optionnelle */
    }
    return {
      ...db,
      integrity: fresh.integrity,
      foreignKeyViolations: fresh.foreignKeys,
      sqliteVersion,
    };
  });
  handle(IPC_CHANNELS["system.selectLogo"], V.emptyPayloadSchema, () => {
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

  // print templates studio (C6 : lecture ouverte, écritures gardées comme settings).
  handle(IPC_CHANNELS["templates.list"], V.emptyPayloadSchema, () => ({
    rows: Templates.listTemplates(),
  }));
  handle(IPC_CHANNELS["templates.save"], V.templateSaveSchema, (input) => {
    const settings: Record<string, unknown> = input.settings;
    if (input.id != null) {
      const row = Templates.getTemplate(input.id);
      if (row.doc_type !== input.docType) throw new Error("Type de document incohérent.");
    }
    return Templates.saveTemplateAtomic({
      id: input.id ?? null,
      docType: input.docType,
      name: input.name,
      settings,
      operationId: input.operationId,
      now: new Date().toISOString(),
    });
  });
  handle(IPC_CHANNELS["templates.activate"], V.templateActivateSchema, (input) => {
    Templates.activateTemplateAtomic({
      id: input.id,
      operationId: input.operationId,
      now: new Date().toISOString(),
    });
    return { activated: true };
  });
  handle(IPC_CHANNELS["templates.remove"], V.templateRemoveSchema, (input) => {
    Templates.deleteTemplateAtomic({
      id: input.id,
      operationId: input.operationId,
      now: new Date().toISOString(),
    });
    return { deleted: true };
  });
  handle(IPC_CHANNELS["templates.reset"], V.templateResetSchema, (input) => {
    Templates.resetFactoryAtomic({
      docType: input.docType ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    });
    return { reset: true };
  });

  // backup / printing are registered by their modules (backup.ts / printing.ts)

  // database integrity (base ouverte requise ; la relocation vit dans le noyau)
  handle(IPC_CHANNELS["database.integrity"], V.emptyPayloadSchema, () => {
    const check = integrityCheck();
    if (check.integrity !== "ok" || check.foreignKeys.length !== 0) {
      throw new Error(
        "Base de données corrompue ou incohérente. Restaurez une sauvegarde vérifiée.",
      );
    }
    return check;
  });
  handle(IPC_CHANNELS["database.optimize"], V.emptyPayloadSchema, () => optimizeDatabase());
  // Réinitialisation d'usine (zone dangereuse, paramètres) : base vierge,
  // sauvegardes *.vposdb conservées. Gardée par la licence (mutation
  // destructive) + page settings, preuve littérale exigée par le schéma.
  // RADICAL-FIX: operationId propagé (retry même UUID = résultat rejoué, pas de double wipe).
  handle(IPC_CHANNELS["database.reset"], V.databaseResetSchema, (input) =>
    factoryResetDatabase(input.operationId),
  );

  // app diagnostics (Settings > Diagnostics — spec 23 : version, OS, base,
  // taille, schéma, santé, sauvegardes, imprimante, journaux ; jamais de secret)
  handle(IPC_CHANNELS["app.diagnostics"], V.emptyPayloadSchema, () => {
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
      // OBS-02 : bundle de support (aperçu). Le gérant voit son contenu AVANT
      // de le copier/exporter — jamais de données métier ni de secret.
      supportBundle: buildSupportBundle({
        appVersion: app.getVersion(),
        schemaVersion,
        integrity: check.integrity,
        foreignKeyViolations: Array.isArray(check.foreignKeys) ? check.foreignKeys.length : 0,
        dbSize,
        sqliteVersion: (() => {
          try {
            const row = getDb().prepare("SELECT sqlite_version() AS v").get() as {
              v?: unknown;
            } | null;
            return row && typeof row.v === "string" ? row.v : null;
          } catch {
            return null;
          }
        })(),
        logFile: getLogFile(),
      }),
    };
  });

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
    const op = (input as { operationId?: string | null }).operationId ?? null;
    if (input.key === "sales") {
      Settings.saveSalesSettings(V.salesSettingsSchema.parse(input.value), now, op);
    } else if (input.key === "invoice") {
      Settings.saveInvoiceSettings(V.invoiceSettingsSchema.parse(input.value), now, op);
    } else if (input.key === "printing") {
      Settings.savePrintingSettings(V.printingSettingsSchema.parse(input.value), now, op);
    } else if (input.key === "products") {
      Settings.saveProductsSettings(V.productsSettingsSchema.parse(input.value), now, op);
    } else if (input.key === "customers") {
      Settings.saveCustomersSettings(V.customersSettingsSchema.parse(input.value), now, op);
    } else if (input.key === "suppliers") {
      Settings.saveSuppliersSettings(V.suppliersSettingsSchema.parse(input.value), now, op);
    } else if (input.key === "sound") {
      Settings.saveSoundSettings(V.soundSettingsSchema.parse(input.value), now, op);
    } else {
      Settings.saveInventorySettings(V.inventorySettingsSchema.parse(input.value), now, op);
    }
    return { saved: true };
  });

  // ---- Import CSV validé-avant-commit ----
  handle(IPC_CHANNELS["products.import"], V.productsImportSchema, (input) =>
    Imports.importProductsAtomic(input.rows, new Date().toISOString(), input.operationId),
  );

  // ---- ADR-186 : détection d'une version plus récente (LECTURE SEULE) ----
  // Le renderer ne fournit AUCUNE URL : la page de release vient du manifeste
  // lu par le processus principal (allow-list https dans `update-check.ts`).
  // L'application n'installe jamais rien — elle ouvre le navigateur système.
  handle(IPC_CHANNELS["system.updateStatus"], V.emptyPayloadSchema, async () => getUpdateStatus());
  handle(IPC_CHANNELS["system.openUpdatePage"], V.emptyPayloadSchema, async () => openUpdatePage());
}
