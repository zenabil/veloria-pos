// Veloria License Manager — Base locale du vendor (PAS la base POS).
// Registre des licences émises : clients, empreintes, dates, statuts, audit.
// La clé privée n'y figure JAMAIS (fichier séparé, cf. signing.ts).

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

type Db = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...p: unknown[]): { changes: number; lastInsertRowid: number | bigint };
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
  // Migration best effort des parcs existants (colonnes déjà présentes → ignoré).
  for (const sql of MIGRATIONS) {
    try {
      database.exec(sql);
    } catch {
      /* colonne déjà présente */
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
