// Veloria License Manager — Base locale du vendor (PAS la base POS).
// Registre des licences émises : clients, empreintes, dates, statuts, audit.
// La clé privée n'y figure JAMAIS (fichier séparé, cf. signing.ts).

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

type Db = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...p: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...p: unknown[]): unknown;
    all(...p: unknown[]): unknown[];
  };
  close(): void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS manager_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  license_id TEXT UNIQUE NOT NULL,
  customer_ref TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT,
  store_name TEXT,
  edition TEXT NOT NULL,
  plan TEXT,
  license_type TEXT NOT NULL,
  license_status TEXT NOT NULL DEFAULT 'active',
  device_binding INTEGER NOT NULL DEFAULT 1,
  max_devices INTEGER,
  hardware_fingerprint TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  features_json TEXT NOT NULL DEFAULT '[]',
  pages_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  envelope_vlic TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS license_events (
  id INTEGER PRIMARY KEY,
  license_row_id INTEGER NOT NULL REFERENCES licenses(id),
  event TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_licenses_customer ON licenses(customer_ref);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
`;

/** Colonnes ajoutées après la création initiale (parc vendor existant). */
const MIGRATIONS = [
  `ALTER TABLE licenses ADD COLUMN client_id TEXT`,
  `ALTER TABLE licenses ADD COLUMN client_name TEXT`,
  `ALTER TABLE licenses ADD COLUMN store_name TEXT`,
  `ALTER TABLE licenses ADD COLUMN plan TEXT`,
  `ALTER TABLE licenses ADD COLUMN license_status TEXT NOT NULL DEFAULT 'active'`,
  `ALTER TABLE licenses ADD COLUMN device_binding INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE licenses ADD COLUMN max_devices INTEGER`,
  `ALTER TABLE licenses ADD COLUMN pages_json TEXT`,
];

let db: Db | null = null;

export function managerDbPath(): string {
  return path.join(app.getPath("userData"), "license-manager.sqlite");
}

export function openManagerDb(): Db {
  if (db) return db;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as new (f: string) => Db;
  const file = managerDbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database = new Database(file);
  database.exec(
    `PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000;`,
  );
  database.exec(SCHEMA);
  // Migration best effort des parcs existants. L3 : seule l'erreur
  // « colonne déjà présente » est absorbée — absorber TOUTE erreur rendait
  // une base corrompue/discutable silencieuse identique à un parc à jour
  // (schema validé puis registre en lecture/écriture sur colonnes manquantes).
  for (const sql of MIGRATIONS) {
    try {
      database.exec(sql);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate column name/i.test(msg)) continue;
      throw err instanceof Error ? err : new Error(msg);
    }
  }
  db = database;
  return db;
}

export function closeManagerDb(): void {
  try {
    db?.close();
  } catch {
    /* ignore */
  }
  db = null;
}

/**
 * P3 : sauvegarde du registre vendor (VACUUM INTO en ligne + rotation 10).
 * Le registre des licences émises n'avait AUCUNE sauvegarde — perte machine =
 * perte de traçabilité. Retourne le fichier (jamais de secret dedans : la clé
 * privée vit dans userData/keys, hors base).
 */
export function exportManagerBackup(): { file: string; size: number } {
  const database = openManagerDb();
  const dir = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `manager-${stamp}.sqlite`);
  const esc = file.replace(/'/g, "''");
  database.exec(`VACUUM INTO '${esc}'`);
  const size = fs.statSync(file).size;
  // Rotation : 10 dernières sauvegardes conservées.
  const kept = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("manager-") && f.endsWith(".sqlite"))
    .sort()
    .slice(0, -10);
  for (const f of kept) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      /* best effort */
    }
  }
  return { file, size };
}

export interface ManagerBackupInfo {
  file: string;
  size: number;
  createdAt: string;
}

/** Nom `manager-<horodatage>.sqlite` → ISO lisible (`2026-10-11T12:00:00.000Z`).
 * L'horodatage remplace `:` et `.` par `-` (nom de fichier sûr) : seule la
 * partie heure après `T` est reconvertie, les tirets de la date sont gardés. */
export function backupFileToCreatedAt(fileName: string): string {
  const stamp = fileName.slice(8, -7);
  const t = stamp.indexOf("T");
  if (t < 0) return stamp;
  const time = stamp
    .slice(t + 1)
    .replace(/-/g, ":")
    .replace(/:(\d{3}Z)$/, ".$1");
  return `${stamp.slice(0, t)}T${time}`;
}

/** Liste les sauvegardes du registre (plus récentes d'abord). */
export function listManagerBackups(): ManagerBackupInfo[] {
  const dir = path.join(app.getPath("userData"), "backups");
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("manager-") && f.endsWith(".sqlite"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
  return files.map((f) => {
    const file = path.join(dir, f);
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      /* ignore */
    }
    return { file, size, createdAt: backupFileToCreatedAt(f) };
  });
}

/**
 * Restaure le registre depuis une sauvegarde : snapshot de sécurité du live,
 * copie, suppression des sidecars WAL, `integrity_check`. Échec → rollback
 * du snapshot. Le fichier doit vivre dans le dossier backups (anti traversal).
 */
export function restoreManagerBackup(file: string): { restored: boolean } {
  const dir = path.resolve(app.getPath("userData"), "backups");
  const abs = path.resolve(file);
  if (!abs.startsWith(dir + path.sep)) throw new Error("Sauvegarde hors dossier autorisé.");
  if (!fs.existsSync(abs)) throw new Error("Sauvegarde introuvable.");
  closeManagerDb();
  const live = managerDbPath();
  const snap = `${live}.pre-restore`;
  try {
    if (fs.existsSync(live)) fs.copyFileSync(live, snap);
  } catch {
    throw new Error("Snapshot de sécurité impossible.");
  }
  try {
    fs.copyFileSync(abs, live);
    for (const ext of ["-wal", "-shm", "-journal"]) {
      try {
        fs.unlinkSync(live + ext);
      } catch {
        /* absent */
      }
    }
    const database = openManagerDb();
    const ic = database.prepare("PRAGMA integrity_check").get() as {
      integrity_check?: unknown;
    };
    if (ic.integrity_check !== "ok") throw new Error("Sauvegarde corrompue.");
    try {
      fs.unlinkSync(snap);
    } catch {
      /* best effort */
    }
    return { restored: true };
  } catch (err) {
    try {
      if (fs.existsSync(snap)) {
        closeManagerDb();
        fs.copyFileSync(snap, live);
        openManagerDb();
      }
    } catch {
      /* rollback best-effort */
    }
    throw err instanceof Error ? err : new Error("Restauration impossible.");
  }
}
