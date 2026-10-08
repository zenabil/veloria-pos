// Veloria PoS — Electron main entry (secure, single-instance, crash-safe).

import { app } from "electron";
import {
  closeLicenseWindow,
  closeRecoveryWindow,
  createMainWindow,
  getLicenseWindow,
  getMainWindow,
  getRecoveryWindow,
  showLicenseWindow,
  showRecoveryWindow,
} from "./window-manager";
import { registerLifecycle } from "./app-lifecycle";
import { handleRendererGone, handleUncaughtException } from "./crash-recovery";
import {
  registerCoreIpc,
  registerIpc,
  registerLicenseIpc,
  registerRecoveryIpc,
} from "../ipc/registry";
import { canOpenShell, getLicenseStatus } from "../licensing/license-service";
import { prodLicenseDeps } from "../licensing/prod-deps";
import { buildLicenseHtml } from "./license-view";
import { registerPrintingIpc } from "../printing/printing.service";
import { registerOcrIpc } from "../ocr/ocr.service";
import { openDatabase, integrityCheck } from "../database/sqlite.service";
import { pruneTechnicalTables } from "../database/retention";
import { getDataFolder } from "../database/database-path.service";
import {
  createBackup,
  isAutoBackupDue,
  registerBackupIpc,
  startAutoBackupTimer,
} from "../backup/backup.service";
import { startSyncTimer } from "../sync/sync.service";
import { initLogger, log } from "../services/logger";
import { resolveStartup, type DatabaseOpenInfo, type StartupFailure } from "./startup-flow";
import { buildRecoveryHtml } from "./recovery-view";

// Instance unique : la seconde instance se termine IMMÉDIATEMENT (avant tout
// accès DB/fenêtre) pour éviter toute contention sur la base SQLite.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = getMainWindow() ?? getLicenseWindow() ?? getRecoveryWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  startup().catch((err: unknown) => {
    try {
      log("FATAL", "app", "startup.rejected", { error: String(err) });
    } catch {
      /* logger indisponible */
    }
    try {
      console.error("[Veloria][FATAL] startup rejected", err);
    } catch {
      /* ignore */
    }
  });
  registerLifecycle();
  process.on("uncaughtException", handleUncaughtException);
  process.on("unhandledRejection", (reason: unknown) => {
    try {
      log("FATAL", "app", "unhandledRejection", { error: String(reason) });
    } catch {
      /* logger indisponible */
    }
    try {
      console.error("[Veloria][FATAL] unhandledRejection", reason);
    } catch {
      /* ignore */
    }
  });
  // Renderer crash recovery: offer reload.
  app.on("render-process-gone", (_e, _wc, details) => handleRendererGone(details));
}

// Gardes d'idempotence : ipcMain.handle lève sur un doublon — un réessai
// (réussi ou non) ne doit jamais ré-enregistrer un canal déjà actif.
let businessIpcRegistered = false;
let backupIpcRegistered = false;
let recoveryIpcRegistered = false;
let coreIpcRegistered = false;
let ocrIpcRegistered = false;
let printingIpcRegistered = false;
let licenseIpcRegistered = false;

function registerCoreOnce(): void {
  if (!coreIpcRegistered) {
    registerCoreIpc();
    coreIpcRegistered = true;
  }
}

function registerBusinessOnce(): void {
  if (!businessIpcRegistered) {
    registerIpc();
    businessIpcRegistered = true;
  }
}

function registerBackupOnce(): void {
  if (!backupIpcRegistered) {
    registerBackupIpc();
    backupIpcRegistered = true;
  }
}

function registerOcrOnce(): void {
  if (!ocrIpcRegistered) {
    registerOcrIpc(getMainWindow);
    ocrIpcRegistered = true;
  }
}

function registerRecoveryOnce(): void {
  if (!recoveryIpcRegistered) {
    registerRecoveryIpc({ onRetry: retryFromRecovery, onExit: () => app.quit() });
    recoveryIpcRegistered = true;
  }
}

function registerLicenseOnce(): void {
  if (!licenseIpcRegistered) {
    registerLicenseIpc({ onActivated: switchToMainFromLicense });
    licenseIpcRegistered = true;
  }
}

function licenseReasonFr(state: string): string {
  switch (state) {
    case "INVALID_HARDWARE":
      return "Cette licence est associée à un autre ordinateur. Importez la licence de ce poste.";
    case "INVALID_SIGNATURE":
      return "Licence invalide : signature non reconnue. Importez une licence valide.";
    case "INVALID_PRODUCT":
      return "Cette licence est destinée à un autre produit.";
    case "TAMPER_DETECTED":
      return "Intégrité compromise détectée. Réinstallez Veloria POS puis réactivez.";
    case "CLOCK_ROLLBACK":
      return "Horloge système incohérente : corrigez la date et l'heure, puis réactivez.";
    case "CORRUPTED_STATE":
      return "État d'activation illisible. Importez à nouveau votre licence.";
    case "EXPIRED":
      return "Licence expirée.";
    default:
      return "Veloria POS n'est pas encore activé sur cet ordinateur. Importez votre fichier de licence (.vlic) pour commencer.";
  }
}

/** Activation requise : fenêtre dédiée, JAMAIS la coquille (données préservées). */
function enterLicenseMode(): void {
  registerLicenseOnce();
  registerRecoveryOnce();
  let reason = licenseReasonFr("UNACTIVATED");
  try {
    reason = licenseReasonFr(getLicenseStatus(prodLicenseDeps()).state);
  } catch {
    /* message par défaut */
  }
  showLicenseWindow(buildLicenseHtml({ appVersion: app.getVersion(), reason }));
  log("INFO", "app", "license.required", {});
}

/** Activation réussie depuis la fenêtre dédiée : bascule vers la coquille. */
function switchToMainFromLicense(): void {
  closeLicenseWindow();
  const win = createMainWindow();
  try {
    win.focus();
  } catch {
    /* focus best-effort */
  }
}

function registerPrintingOnce(): void {
  // ipcMain.handle lève sur un doublon : le réessai depuis la récupération
  // ne doit jamais ré-enregistrer les canaux d'impression déjà actifs.
  if (!printingIpcRegistered) {
    registerPrintingIpc(getMainWindow);
    printingIpcRegistered = true;
  }
}

/** Sauvegarde automatique au démarrage si due (best-effort, jamais bloquante). */
function runAutoBackupIfDue(): void {
  try {
    if (isAutoBackupDue(Date.now())) {
      const made = createBackup(false);
      log("INFO", "backup", "backup.auto", { file: made.file });
    }
  } catch (err) {
    log("WARN", "backup", "backup.auto_failed", { error: String(err) });
  }
  try {
    startAutoBackupTimer();
  } catch (err) {
    log("WARN", "backup", "backup.timer_failed", { error: String(err) });
  }
  // Miroir APK : auto-poussée best-effort (jamais bloquante, jamais d'erreur
  // vers la caisse — la file `pending` survit à toute coupure).
  try {
    startSyncTimer();
  } catch (err) {
    log("WARN", "sync", "sync.timer_failed", { error: String(err) });
  }
}

/** Coquille applicative : uniquement sur base prête (décision resolveStartup). */
function enterMainMode(info: DatabaseOpenInfo): void {
  log("INFO", "app", "database.ready", { ...info });
  registerBusinessOnce();
  registerBackupOnce();
  registerPrintingOnce();
  registerOcrOnce();
  registerLicenseOnce();
  closeRecoveryWindow();
  // Licence : sans activation valide, la fenêtre d'activation remplace la
  // coquille — les données restent intactes. Aucun mode d'exécution contourné.
  if (!canOpenShell(prodLicenseDeps())) {
    enterLicenseMode();
    return;
  }
  createMainWindow();
  // PERF (requête 5) : la sauvegarde auto (VACUUM INTO = copie complète)
  // part APRÈS l'affichage de la fenêtre, au prochain tick — la caisse
  // s'affiche sans attendre le disque (best-effort inchangé).
  // P3 : purge des tables techniques (retention) sur le même tick.
  setImmediate(() => runAutoBackupIfDue());
  setImmediate(() => {
    try {
      pruneTechnicalTables();
    } catch {
      /* best effort (loggé dans le module) */
    }
  });
}

/** Récupération : message FR sans trace, actions sûres, JAMAIS la coquille. */
function enterRecoveryMode(failure: StartupFailure): void {
  registerCoreOnce();
  registerBackupOnce();
  registerRecoveryOnce();
  showRecoveryWindow(
    buildRecoveryHtml({
      userMessage: failure.userMessage,
      appVersion: app.getVersion(),
      dbFolder: getDataFolder(),
    }),
  );
  log("INFO", "app", "recovery.shown", { stage: failure.stage });
}

/**
 * Réessai depuis la page de récupération : en cas de succès on bascule vers
 * la coquille (sans ré-enregistrer l'IPC), sinon on ré-affiche la récupération
 * avec le nouveau message — toujours sans fenêtre principale.
 */
function retryFromRecovery(): { switched: boolean; userMessage: string } {
  const resolution = resolveStartup({
    openDatabase,
    integrityCheck,
    enterMainMode,
    enterRecoveryMode,
    log,
  });
  if (resolution.mode === "main") return { switched: true, userMessage: "" };
  // L'échec est déjà journalisé (FATAL) et la page ré-affichée avec le message
  // précis de cette tentative : on le répercute tel quel (FR, sans trace).
  getRecoveryWindow()?.focus();
  return {
    switched: false,
    userMessage: resolution.failure?.userMessage ?? "La base reste inaccessible.",
  };
}

async function startup(): Promise<void> {
  initLogger();
  const t0 = Date.now();
  log("INFO", "app", "startup.begin", { version: app.getVersion() });
  await app.whenReady();
  // Échec base = démarrage fatal pour la coquille : resolveStartup n'ouvre la
  // fenêtre principale QUE sur base prête, sinon la page de récupération.
  const resolution = resolveStartup({
    openDatabase,
    integrityCheck,
    enterMainMode,
    enterRecoveryMode,
    log,
  });
  log("INFO", "app", "startup.ready", { mode: resolution.mode, duration_ms: Date.now() - t0 });
}
