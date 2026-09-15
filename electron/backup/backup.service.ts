// Veloria PoS — Electron: backup service (WAL-safe).
// Uses SQLite VACUUM INTO (online, consistent) — never raw copy of live WAL DB.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { app, ipcMain } from "electron";
import { checkpoint, getDb, getDbPath } from "../database/sqlite.service";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";

function backupDir(): string {
  const dir = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sha256File(p: string): string {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}

export function createBackup(manual: boolean): { file: string; checksum: string; size: number } {
  checkpoint();
  const db = getDb();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(backupDir(), `veloria-${stamp}${manual ? "-manuel" : "-auto"}.vposdb`);
  // VACUUM INTO is transactional & WAL-safe.
  const esc = file.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${esc}'`);
  const stat = fs.statSync(file);
  const checksum = sha256File(file);
  // sidecar metadata
  fs.writeFileSync(
    `${file}.json`,
    JSON.stringify(
      {
        appVersion: app.getVersion(),
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
  // rotation: keep last 30
  const files = fs
    .readdirSync(backupDir())
    .filter((f) => f.endsWith(".vposdb"))
    .sort();
  while (files.length > 30) {
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

export function listBackups(): { file: string; size: number; createdAt: string }[] {
  const dir = backupDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".vposdb"))
    .map((f) => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return { file: full, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function registerBackupIpc(): void {
  ipcMain.handle(IPC_CHANNELS["backup.create"], () => {
    try {
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
  ipcMain.handle(IPC_CHANNELS["backup.list"], () => ({ ok: true, data: listBackups() }));
  ipcMain.handle(IPC_CHANNELS["backup.restore"], (_e, raw: unknown) => {
    try {
      const obj = (typeof raw === "object" && raw !== null ? raw : {}) as { file?: unknown };
      const file = typeof obj.file === "string" ? obj.file : "";
      if (!file.endsWith(".vposdb") && !file.endsWith(".sqlite")) {
        return { ok: false, code: "VALIDATION_ERROR", message: "Fichier de sauvegarde invalide." };
      }
      if (!fs.existsSync(file)) {
        return { ok: false, code: "VALIDATION_ERROR", message: "Fichier introuvable." };
      }
      // Validate SQLite readability: real 16-byte header check ("SQLite format 3\0").
      // Full integrity_check runs after reopen in the restore flow.
      const fd = fs.openSync(file, "r");
      let header = "";
      try {
        const buf = Buffer.alloc(16);
        fs.readSync(fd, buf, 0, 16, 0);
        header = buf.toString("utf-8", 0, 15);
      } finally {
        fs.closeSync(fd);
      }
      if (!header.startsWith("SQLite format 3")) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Ce fichier n'est pas une base SQLite valide.",
        };
      }
      // Safety snapshot of current DB first.
      createBackup(false);
      return { ok: true, data: { validated: true, pendingRestart: true, file } };
    } catch (err) {
      log("ERROR", "backup", "restore.failed", { error: String(err) });
      return { ok: false, code: "BACKUP_FAILED", message: "Échec de la restauration." };
    }
  });
}
