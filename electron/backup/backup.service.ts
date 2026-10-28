// Veloria PoS — Electron: backup service (WAL-safe).
// Uses SQLite VACUUM INTO (online, consistent) — never raw copy of live WAL DB.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { app, ipcMain } from "electron";
import {
  checkpoint,
  checkpointAndClose,
  getDb,
  getDbPath,
  integrityCheck,
  latestMigrationVersion,
  openDatabase,
  removeWalCompanions,
  reopenWithRetry,
  verifyDbFileCopy,
} from "../database/sqlite.service";
import {
  isAllowedDatabaseFile,
  assertSafeUserFolder,
  isSystemDeniedPath,
} from "../security/security";
import { log } from "../services/logger";
import { sha256File } from "../licensing/hash";
import { IPC_CHANNELS } from "../ipc/channels";
import * as V from "../ipc/validators";
import { enforceRawChannelGates } from "../ipc/raw-guards";
import { claimOptional, peekOptional, storeOptional } from "../ipc/handlers/idempotency";
import { prodLicenseDeps } from "../licensing/prod-deps";
import { getLicenseStatus, requireLicensedFeature } from "../licensing/license-service";

/**
 * Garde backup (§5/§11) : vérifiée dans le main sur le payload signé.
 * Sauvegardes de secours (create/export/auto) → automatic-backup ;
 * restauration → restore-backup. Lecture (list/status) toujours ouverte :
 * un poste expiré consulte et peut se réactiver.
 * Sécurité des données d'abord : une licence EXPIRÉE peut toujours
 * SAUVEGARDER (create/export), jamais restaurer ni reconfigurer l'auto.
 */
function guardBackup(feature: "automatic-backup" | "restore-backup"): {
  ok: false;
  code: string;
  message: string;
} | null {
  try {
    const deps = prodLicenseDeps();
    if (feature === "automatic-backup") {
      try {
        requireLicensedFeature(deps, feature);
        return null;
      } catch (err) {
        // Poste expiré : sauvegarde de sécurité toujours permise.
        if (getLicenseStatus(deps).state === "EXPIRED") {
          log("INFO", "backup", "license.expired_backup_allowed", {});
          return null;
        }
        throw err;
      }
    }
    requireLicensedFeature(deps, feature);
    return null;
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Cette fonction n'est pas incluse dans votre licence.";
    const code = /n'est pas incluse/i.test(msg) ? "FEATURE_NOT_LICENSED" : "LICENSE_REQUIRED";
    log("WARN", "backup", "license.denied", { error: msg });
    return { ok: false, code, message: msg };
  }
}

function backupDir(): string {
  const dir = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * RADICAL-FIX: VACUUM INTO avec guillemet sûr centralisé.
 * SQLite ne supporte pas `?` pour le nom de fichier — échappement `'`→`''`
 * + refus des chemins à risque (NUL, retour ligne, `;`, `--`) car le chemin
 * est interpolé dans un littéral SQL.
 */
export function vacuumInto(file: string): void {
  if (
    file.includes("\0") ||
    file.includes("\n") ||
    file.includes("\r") ||
    file.includes(";") ||
    file.includes("--")
  ) {
    throw new Error("Chemin de sauvegarde invalide.");
  }
  const esc = file.replace(/'/g, "''");
  getDb().exec(`VACUUM INTO '${esc}'`);
}

export function createBackup(manual: boolean): { file: string; checksum: string; size: number } {
  checkpoint();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // M-10 COLLISION RESISTANCE: timestamp + 6-char random suffix — two backups
  // in the same millisecond never collide/overwrite.
  const uniq = crypto.randomBytes(3).toString("hex");
  const file = path.join(
    backupDir(),
    `veloria-${stamp}-${uniq}${manual ? "-manuel" : "-auto"}.vposdb`,
  );
  // VACUUM INTO is transactional & WAL-safe.
  vacuumInto(file);
  const stat = fs.statSync(file);
  const checksum = sha256File(file);
  let schemaVersion = 0;
  try {
    const row = getDb().prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as {
      v: number | null;
    };
    schemaVersion = row.v ?? 0;
  } catch (err) {
    log("WARN", "backup", "schema_version.unreadable", { error: String(err) });
  }
  // sidecar metadata
  fs.writeFileSync(
    `${file}.json`,
    JSON.stringify(
      {
        appVersion: app.getVersion(),
        schemaVersion,
        logicalName: "veloria POS DB",
        createdAt: new Date().toISOString(),
        sourcePath: getDbPath(),
        checksum,
        size: stat.size,
      },
      null,
      2,
    ),
  );
  // rotation: garde les N plus récentes (rétention paramétrable, défaut 30).
  let keep = 30;
  try {
    keep = getBackupAuto().retentionCount;
  } catch (err) {
    log("WARN", "backup", "retention.unreadable", { error: String(err) });
  }
  const files = fs
    .readdirSync(backupDir())
    .filter((f) => f.endsWith(".vposdb"))
    .sort();
  while (files.length > keep) {
    const oldest = files.shift();
    if (oldest) {
      try {
        fs.unlinkSync(path.join(backupDir(), oldest));
        fs.unlinkSync(path.join(backupDir(), `${oldest}.json`));
      } catch {
        /* best effort */
      }
    }
  }
  log("INFO", "backup", "backup.created", { file, size: stat.size });
  return { file, checksum, size: stat.size };
}

/**
 * Copie brute de la base actuelle FERMÉE (secours quand VACUUM est impossible
 * car la base ne s'ouvre pas — typiquement en mode récupération). Sûre car
 * aucun écrivain n'est actif ; les compagnons WAL sont copiés avec le fichier
 * principal. Ne remplace jamais createBackup() sur base ouvrable.
 */
export function snapshotClosedDbFile(): { file: string } {
  const current = getDbPath();
  if (!fs.existsSync(current)) {
    throw new Error("Base actuelle introuvable : sauvegarde impossible.");
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupDir(), `veloria-avant-restauration-${stamp}.sqlite`);
  fs.copyFileSync(current, dest);
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const src = `${current}${suffix}`;
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, `${dest}${suffix}`);
      } catch (err) {
        log("WARN", "backup", "snapshot.companion_skipped", {
          suffix,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  // Rotation des instantanés de restauration (invisibles dans listBackups
  // qui ne liste que *.vposdb) : garde les 5 plus récents + compagnons.
  try {
    const snaps = fs
      .readdirSync(backupDir())
      .filter((f) => f.startsWith("veloria-avant-restauration-") && f.endsWith(".sqlite"))
      .sort();
    while (snaps.length > 5) {
      const oldest = snaps.shift();
      if (!oldest) break;
      for (const sfx of ["", "-wal", "-shm", "-journal"]) {
        try {
          fs.unlinkSync(path.join(backupDir(), `${oldest}${sfx}`));
        } catch {
          /* compagnon absent : nominal */
        }
      }
    }
  } catch {
    /* rotation best-effort */
  }
  log("INFO", "backup", "snapshot.closed_copy", { from: current, to: dest });
  return { file: dest };
}

/**
 * M-10 CLOCK-SAFE ORDERING: entries are ordered by sidecar `createdAt`
 * (written atomically with the backup), NOT filesystem mtime — a Windows
 * clock rollback must never cause the newest backup to be pruned. Missing or
 * corrupt sidecar → falls back to mtime (fail-safe: listed, never hidden).
 */
export function listBackups(): { file: string; size: number; createdAt: string }[] {
  const dir = backupDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".vposdb"))
    .map((f) => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      let createdAt = st.mtime.toISOString();
      try {
        const raw = fs.readFileSync(`${full}.json`, "utf-8");
        const meta = JSON.parse(raw) as { createdAt?: unknown };
        if (typeof meta.createdAt === "string" && Number.isFinite(Date.parse(meta.createdAt))) {
          createdAt = meta.createdAt;
        }
      } catch {
        /* missing/corrupt sidecar: mtime fallback, entry stays visible */
      }
      return { file: full, size: st.size, createdAt };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export type BackupFrequency =
  "10min" | "30min" | "1h" | "6h" | "12h" | "daily" | "weekly" | "custom";

export interface BackupAutoConfig {
  enabled: boolean;
  intervalDays: number;
  frequency: BackupFrequency;
  customMinutes: number;
  retentionCount: number;
}

export function frequencyMinutes(cfg: BackupAutoConfig): number {
  if (cfg.frequency === "custom") {
    return Math.min(10080, Math.max(5, Math.floor(cfg.customMinutes) || 60));
  }
  if (cfg.frequency === "10min") return 10;
  if (cfg.frequency === "30min") return 30;
  if (cfg.frequency === "1h") return 60;
  if (cfg.frequency === "6h") return 360;
  if (cfg.frequency === "12h") return 720;
  if (cfg.frequency === "weekly") return 10080;
  return 1440;
}

export function getBackupAuto(): BackupAutoConfig {
  try {
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = 'backup'`)
      .get() as { value_json: string } | undefined;
    if (!row)
      return {
        enabled: true,
        intervalDays: 1,
        frequency: "daily",
        customMinutes: 60,
        retentionCount: 30,
      };
    const parsed = JSON.parse(row.value_json) as Partial<BackupAutoConfig>;
    const intervalDays =
      typeof parsed.intervalDays === "number" && parsed.intervalDays >= 1
        ? Math.min(30, Math.floor(parsed.intervalDays))
        : 1;
    const freq = parsed.frequency ?? (intervalDays >= 7 ? "weekly" : "daily");
    return {
      enabled: parsed.enabled !== false,
      intervalDays,
      frequency: (
        ["10min", "30min", "1h", "6h", "12h", "daily", "weekly", "custom"] as BackupFrequency[]
      ).includes(freq)
        ? freq
        : "daily",
      customMinutes:
        typeof parsed.customMinutes === "number"
          ? Math.min(10080, Math.max(5, Math.floor(parsed.customMinutes)))
          : 60,
      retentionCount:
        typeof parsed.retentionCount === "number"
          ? Math.min(100, Math.max(1, Math.floor(parsed.retentionCount)))
          : 30,
    };
  } catch {
    return {
      enabled: true,
      intervalDays: 1,
      frequency: "daily",
      customMinutes: 60,
      retentionCount: 30,
    };
  }
}

export function saveBackupAuto(
  cfg: BackupAutoConfig,
  now: string,
  operationId?: string | null,
): void {
  const fast = peekOptional<{ saved: boolean }>(operationId, "backup.autoSave");
  if (fast) return;
  const db = getDb();
  const tx = db.transaction(() => {
    claimOptional(operationId, "backup.autoSave", now);
    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('backup', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(
      JSON.stringify({
        enabled: cfg.enabled,
        intervalDays: cfg.intervalDays,
        frequency: cfg.frequency,
        customMinutes: cfg.customMinutes,
        retentionCount: cfg.retentionCount,
      }),
      now,
    );
    storeOptional(operationId, { saved: true });
  });
  try {
    tx();
  } catch (err) {
    if (
      operationId &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekOptional<{ saved: boolean }>(operationId, "backup.autoSave");
      if (retry) return;
    }
    throw err;
  }
}

export function backupStatus(): {
  count: number;
  lastAt: string | null;
  lastFile: string | null;
  auto: BackupAutoConfig;
} {
  const all = listBackups();
  const last = all[0];
  let auto: BackupAutoConfig = {
    enabled: true,
    intervalDays: 1,
    frequency: "daily",
    customMinutes: 60,
    retentionCount: 30,
  };
  try {
    auto = getBackupAuto();
  } catch {
    /* base non ouvrable : fichiers listés quand même */
  }
  return {
    count: all.length,
    lastAt: last?.createdAt ?? null,
    lastFile: last?.file ?? null,
    auto,
  };
}

/** Dernière sauvegarde plus vieille que l'intervalle (ou aucune) ? */
export function isAutoBackupDue(nowMs: number): boolean {
  const cfg = getBackupAuto();
  if (!cfg.enabled) return false;
  const all = listBackups();
  if (all.length === 0) return true;
  const lastMs = Date.parse(all[0]?.createdAt ?? "");
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs >= frequencyMinutes(cfg) * 60 * 1000;
}

/** Timer auto-backup intra-journalier (60s) — 8 fréquences, log + alerte via statut. */
let autoTimer: NodeJS.Timeout | null = null;
export function startAutoBackupTimer(): void {
  if (autoTimer) return;
  autoTimer = setInterval(() => {
    try {
      if (isAutoBackupDue(Date.now())) {
        createBackup(false);
      }
    } catch (err) {
      log("ERROR", "backup", "auto.failed", { error: String(err) });
    }
  }, 60_000);
  if (typeof autoTimer.unref === "function") autoTimer.unref();
}

/**
 * L8 : arrêt explicite du timer auto-backup (arrêt gracieux) — `unref` déjà
 * présent (jamais bloquant), on libère juste l'intervalle à la sortie pour
 * éviter une sauvegarde en cours de fermeture.
 */
export function stopAutoBackupTimer(): void {
  if (!autoTimer) return;
  clearInterval(autoTimer);
  autoTimer = null;
}

/** Exporte la dernière sauvegarde vers un dossier choisi (fichier + sidecar). */
// P5: politique centrale unique (security.isSystemDeniedPath, 6 racines +
// realpath) — plus de seconde liste locale à dériver.
// RADICAL-FIX: assertSafeUserFolder DANS la fonction (pas seulement le handler)
// — tout appelant direct hérite de la garde anti-traversal/système/symlink.
export function exportBackupToFolder(folder: string): { path: string } {
  const safe = assertSafeUserFolder(folder);
  const all = listBackups();
  const last = all[0];
  if (!last) throw new Error("Aucune sauvegarde à exporter : créez-en une d'abord.");
  const dir = path.normalize(safe);
  if (isSystemDeniedPath(dir.toLowerCase())) {
    log("WARN", "backup", "export.denied_folder", { dir });
    throw new Error("Dossier système protégé : choisissez un autre dossier.");
  }
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, path.basename(last.file));
  fs.copyFileSync(last.file, dest);
  const sidecar = `${last.file}.json`;
  if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, `${dest}.json`);
  log("INFO", "backup", "backup.exported", { dest });
  return { path: dest };
}

/**
 * L6 : le snapshot de sécurité est créé AVANT la validation du fichier
 * candidat — si la restauration est refusée (fichier invalide ou provenance
 * d'une version plus récente), ce fichier ne sert à rien et resterait orphelin
 * dans le dossier de sauvegarde. Suppression best-effort, jamais bloquante,
 * et JAMAIS sur la base active.
 */
function discardSnapshot(snapshotFile: string): void {
  try {
    if (path.normalize(snapshotFile) === path.normalize(getDbPath())) return;
    for (const suffix of ["", "-wal", "-shm", "-journal"] as const) {
      const f = `${snapshotFile}${suffix}`;
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* meilleur effort */
      }
    }
    log("WARN", "backup", "restore.snapshot_discarded", { snapshot: snapshotFile });
  } catch (err) {
    log("WARN", "backup", "restore.snapshot_discard_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function registerBackupIpc(): void {
  ipcMain.handle(IPC_CHANNELS["backup.create"], (_e, raw: unknown) => {
    const denied = guardBackup("automatic-backup");
    if (denied) return denied;
    try {
      // RADICAL-FIX P0: charge vide validée depuis le payload réel (contrat explicite).
      const input = V.emptyPayloadSchema.parse(raw ?? {});
      // R1 RADICAL : même décision staff que handle() (permission settings).
      const staffDenied = enforceRawChannelGates(IPC_CHANNELS["backup.create"], input);
      if (staffDenied) return staffDenied;
      return { ok: true, data: createBackup(true) };
    } catch (err) {
      log("ERROR", "backup", "backup.failed", { error: String(err) });
      return {
        ok: false,
        code: "BACKUP_FAILED",
        message: "Échec de la sauvegarde. Vérifiez l'espace disque.",
      };
    }
  });
  ipcMain.handle(IPC_CHANNELS["backup.list"], (_e, raw: unknown) => {
    try {
      V.emptyPayloadSchema.parse(raw ?? {});
    } catch (err) {
      log("WARN", "backup", "list.invalid", { error: String(err) });
      return { ok: false, code: "VALIDATION_ERROR", message: "Données invalides." };
    }
    return { ok: true, data: listBackups() };
  });
  ipcMain.handle(IPC_CHANNELS["backup.status"], (_e, raw: unknown) => {
    try {
      V.emptyPayloadSchema.parse(raw ?? {});
    } catch (err) {
      log("WARN", "backup", "status.invalid", { error: String(err) });
      return { ok: false, code: "VALIDATION_ERROR", message: "Données invalides." };
    }
    try {
      return { ok: true, data: backupStatus() };
    } catch (err) {
      log("ERROR", "backup", "status.failed", { error: String(err) });
      return { ok: false, code: "BACKUP_FAILED", message: "Statut indisponible." };
    }
  });
  ipcMain.handle(IPC_CHANNELS["backup.export"], (_e, raw: unknown) => {
    const denied = guardBackup("automatic-backup");
    if (denied) return denied;
    try {
      const input = V.backupExportSchema.parse(raw ?? {});
      // R1 RADICAL : garde staff avant tout accès disque.
      const staffDenied = enforceRawChannelGates(IPC_CHANNELS["backup.export"], input);
      if (staffDenied) return staffDenied;
      // EL-35: validation racine centralisée (absolu + anti-système + symlink).
      let safe: string;
      try {
        safe = assertSafeUserFolder(input.folder);
      } catch {
        return { ok: false, code: "VALIDATION_ERROR", message: "Dossier invalide." };
      }
      return { ok: true, data: exportBackupToFolder(safe) };
    } catch (err) {
      log("ERROR", "backup", "export.failed", { error: String(err) });
      const msg = err instanceof Error ? err.message : "Échec de l'export.";
      return {
        ok: false,
        code: "BACKUP_FAILED",
        message: msg.startsWith("Aucune") ? msg : "Échec de l'export. Vérifiez le dossier.",
      };
    }
  });
  ipcMain.handle(IPC_CHANNELS["backup.autoSave"], (_e, raw: unknown) => {
    const denied = guardBackup("automatic-backup");
    if (denied) return denied;
    try {
      const input = V.backupAutoSchema.parse(raw ?? {});
      const staffDenied = enforceRawChannelGates(IPC_CHANNELS["backup.autoSave"], input);
      if (staffDenied) return staffDenied;
      saveBackupAuto(
        {
          enabled: input.enabled,
          intervalDays: input.intervalDays,
          frequency: input.frequency,
          customMinutes: input.customMinutes,
          retentionCount: input.retentionCount,
        },
        new Date().toISOString(),
        input.operationId ?? null,
      );
      return { ok: true, data: { saved: true } };
    } catch (err) {
      log("ERROR", "backup", "autoSave.failed", { error: String(err) });
      return { ok: false, code: "BACKUP_FAILED", message: "Enregistrement impossible." };
    }
  });
  ipcMain.handle(IPC_CHANNELS["backup.restore"], (_e, raw: unknown) => {
    const denied = guardBackup("restore-backup");
    if (denied) return denied;
    try {
      const input = V.backupRestoreSchema.parse(raw ?? {});
      // R1 RADICAL : garde staff (permission settings) — jamais de restore
      // sans session autorisée, même avec licence valide.
      const staffDenied = enforceRawChannelGates(IPC_CHANNELS["backup.restore"], input);
      if (staffDenied) return staffDenied;
      const file = input.file;
      if (!isAllowedDatabaseFile(file)) {
        return { ok: false, code: "VALIDATION_ERROR", message: "Fichier de sauvegarde invalide." };
      }
      // A-11 (P1) : clé de rejouabilité EXIGÉE — une restauration est
      // l'opération la plus destructive du produit (swap du fichier de base
      // VIF). La clé est réclamée AVANT le swap : une réémission (double-clic
      // sur « Restaurer ») est refusée par la contrainte UNIQUE
      // idempotency_keys.operation_id au lieu de rejouer snapshot→copie→swap.
      try {
        claimOptional(input.operationId, "backup.restore", new Date().toISOString());
      } catch (claimErr) {
        log("WARN", "backup", "restore.duplicate_claim", {
          error: claimErr instanceof Error ? claimErr.message : String(claimErr),
        });
        return {
          ok: false,
          code: "CONFLICTING_OPERATION",
          message: "Restauration déjà en cours. Patientez quelques secondes.",
        };
      }
      // R4 RADICAL : confinement du dossier source (anti USB piégée hors
      // backupDir : refuse racines, système, UNC — message FR, jamais de chemin brut).
      try {
        assertSafeUserFolder(path.dirname(path.normalize(file)));
      } catch {
        return { ok: false, code: "VALIDATION_ERROR", message: "Fichier de sauvegarde invalide." };
      }
      if (!fs.existsSync(file)) {
        return { ok: false, code: "VALIDATION_ERROR", message: "Fichier introuvable." };
      }
      // 1. Snapshot de sécurité de la base actuelle (rollback possible).
      //    Base non ouvrable (récupération) : VACUUM impossible → copie brute
      //    du fichier fermé, avec journalisation explicite (jamais silencieuse).
      let snapshot: { file: string };
      try {
        snapshot = createBackup(false);
      } catch (snapshotErr) {
        log("WARN", "backup", "restore.snapshot_fallback", {
          error: snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr),
        });
        try {
          snapshot = snapshotClosedDbFile();
        } catch (fallbackErr) {
          log("ERROR", "backup", "restore.snapshot_failed", {
            error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          });
          return {
            ok: false,
            code: "BACKUP_FAILED",
            message: "Impossible de sécuriser la base actuelle : restauration annulée.",
          };
        }
      }
      // 2. Vérification complète du fichier candidat (connexion secondaire)
      //    + compatibilité de schéma (spec 22 : jamais de downgrade silencieux).
      try {
        const checked = verifyDbFileCopy(file);
        if (checked.schemaVersion > latestMigrationVersion()) {
          discardSnapshot(snapshot.file);
          return {
            ok: false,
            code: "VALIDATION_ERROR",
            message:
              "Cette sauvegarde vient d'une version plus récente de Veloria PoS. Veuillez mettre à jour l'application.",
          };
        }
      } catch {
        discardSnapshot(snapshot.file);
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Ce fichier n'est pas une base Veloria valide et saine.",
        };
      }
      // 3. Swap : fermer, remplacer, rouvrir, contrôler. Rollback si échec.
      const current = getDbPath();
      if (!fs.existsSync(current)) {
        throw new Error("Base actuelle introuvable : restauration impossible.");
      }
      checkpointAndClose();
      try {
        fs.copyFileSync(file, current);
        removeWalCompanions(current);
        openDatabase();
        const check = integrityCheck();
        if (check.integrity !== "ok" || check.foreignKeys.length !== 0) {
          throw new Error("Contrôle post-restauration en échec.");
        }
      } catch (swapErr) {
        log("ERROR", "backup", "restore.swap_failed", { error: String(swapErr) });
        try {
          removeWalCompanions(current);
          fs.copyFileSync(snapshot.file, current);
          // P04: le snapshot peut être un *.sqlite fermé avec compagnons WAL
          // (snapshotClosedDbFile) — les restaurer aussi, sinon rollback partiel.
          for (const suffix of ["-wal", "-shm", "-journal"] as const) {
            const src = `${snapshot.file}${suffix}`;
            try {
              if (fs.existsSync(src)) fs.copyFileSync(src, `${current}${suffix}`);
              else {
                try {
                  fs.unlinkSync(`${current}${suffix}`);
                } catch {
                  /* absent : nominal */
                }
              }
            } catch {
              /* compagnon illisible : principal restauré */
            }
          }
          log("INFO", "backup", "restore.rolled_back", { snapshot: snapshot.file });
        } catch (rollbackErr) {
          log("ERROR", "backup", "restore.rollback_failed", {
            error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
            snapshot: snapshot.file,
          });
        }
        // P0-2 : réouverture garantie — jamais de db=null silencieux. En cas
        // d'échec persistant (3 tentatives), échec FORT avec message FR
        // orientant vers la récupération : aucune donnée écrasée (rollback
        // déjà appliqué ci-dessus).
        try {
          reopenWithRetry("backup.restore_rollback");
        } catch (reopenErr) {
          log("ERROR", "backup", "restore.reopen_failed", {
            error: reopenErr instanceof Error ? reopenErr.message : String(reopenErr),
          });
          return {
            ok: false,
            code: "DATABASE_UNAVAILABLE",
            message:
              "La base n'a pas pu être rouverte après annulation. Redémarrez l'application ou réessayez depuis l'écran de récupération — aucune donnée n'a été écrasée.",
          };
        }
        return {
          ok: false,
          code: "BACKUP_FAILED",
          message: "Restauration annulée : la base actuelle a été conservée.",
        };
      }
      log("INFO", "backup", "restore.done", { file, snapshot: snapshot.file });
      return { ok: true, data: { restored: true, snapshot: snapshot.file } };
    } catch (err) {
      log("ERROR", "backup", "restore.failed", { error: String(err) });
      if (err instanceof Error && err.name === "ZodError") {
        return { ok: false, code: "VALIDATION_ERROR", message: "Fichier de sauvegarde invalide." };
      }
      return { ok: false, code: "BACKUP_FAILED", message: "Échec de la restauration." };
    }
  });
}
