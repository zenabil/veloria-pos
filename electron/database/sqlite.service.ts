// Veloria PoS — Electron: SQLite service (sole owner of the DB connection).
// better-sqlite3, WAL, foreign keys, busy timeout, single connection in main process.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { app } from "electron";
import { log } from "../services/logger";
import { getConfiguredDbPath } from "./database-path.service";

type BetterSqlite3DB = {
  pragma(stmt: string, opts?: { simple?: boolean }): unknown;
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  close(): void;
};

let db: BetterSqlite3DB | null = null;
let dbPath = "";

export function getDbPath(): string {
  return dbPath;
}

export function getDb(): BetterSqlite3DB {
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db;
}

function applyPragmas(database: BetterSqlite3DB): void {
  // Authoritative pragmas per 06 spec.
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = FULL");
  database.pragma("busy_timeout = 10000");
  database.pragma("wal_autocheckpoint = 1000");
  database.pragma("temp_store = MEMORY");
  // trusted_schema OFF may not exist on older SQLite; ignore failure.
  try {
    database.pragma("trusted_schema = OFF");
  } catch {
    /* noop */
  }
}

function migrationsDir(): string {
  // Packaged: extraResources/database/migrations; dev: database/migrations
  const candidates = [
    path.join((process.resourcesPath as string | undefined) ?? "", "database", "migrations"),
    path.join(app.getAppPath(), "database", "migrations"),
    path.join(process.cwd(), "database", "migrations"),
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isDirectory()) return c;
    } catch {
      /* continue */
    }
  }
  return path.join(process.cwd(), "database", "migrations");
}

function readMigrations(): { version: number; file: string; sql: string; checksum: string }[] {
  const dir = migrationsDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((file) => {
    const m = file.match(/^(\d+)_.*\.sql$/);
    if (!m) throw new Error(`Invalid migration filename: ${file}`);
    const sql = fs.readFileSync(path.join(dir, file), "utf-8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    return { version: Number(m[1]), file, sql, checksum };
  });
}

function ensureMigrationTable(database: BetterSqlite3DB): void {
  database.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL);`,
  );
}

function currentSchemaVersion(database: BetterSqlite3DB): number {
  ensureMigrationTable(database);
  const row = database.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as {
    v: number | null;
  };
  return row.v ?? 0;
}

export function openDatabase(): { path: string; schemaVersion: number } {
  if (db) return { path: dbPath, schemaVersion: currentSchemaVersion(db) };
  dbPath = getConfiguredDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as new (
    filename: string,
    opts?: Record<string, unknown>,
  ) => BetterSqlite3DB;
  const database = new Database(dbPath);
  applyPragmas(database);
  db = database;

  // Pre-migration safety snapshot is handled by backup service when needed.
  runMigrations(database);
  // Re-assert pragmas: migration files may contain session-level PRAGMAs
  // (e.g. 0001 starts with `PRAGMA foreign_keys = OFF` for CLI use).
  applyPragmas(database);
  const version = currentSchemaVersion(database);
  log("INFO", "database", "database.opened", { path: dbPath, schemaVersion: version });
  return { path: dbPath, schemaVersion: version };
}

export function runMigrations(database: BetterSqlite3DB = getDb()): void {
  const pending = readMigrations();
  ensureMigrationTable(database);
  const applied = new Set(
    (
      database.prepare(`SELECT version, checksum FROM schema_migrations`).all() as {
        version: number;
        checksum: string;
      }[]
    ).map((r) => r.version),
  );
  // Integrity: verify checksums of already-applied migrations match files.
  const rows = database.prepare(`SELECT version, checksum FROM schema_migrations`).all() as {
    version: number;
    checksum: string;
  }[];
  for (const r of rows) {
    const file = pending.find((p) => p.version === r.version);
    if (file && file.checksum !== r.checksum) {
      throw new Error(`Migration ${r.version} checksum mismatch — fichier modifié après release.`);
    }
  }
  const runOne = database.transaction((sql: string, version: number, checksum: string) => {
    database.exec(sql);
    database
      .prepare(`INSERT INTO schema_migrations (version, applied_at, checksum) VALUES (?, ?, ?)`)
      .run(version, new Date().toISOString(), checksum);
  });
  for (const m of pending) {
    if (!applied.has(m.version)) {
      log("INFO", "database", "migration.applying", { version: m.version, file: m.file });
      (runOne as unknown as (sql: string, v: number, c: string) => void)(
        m.sql,
        m.version,
        m.checksum,
      );
    }
  }
}

export function integrityCheck(): { integrity: string; foreignKeys: unknown[] } {
  const database = getDb();
  const rows = database.prepare(`PRAGMA integrity_check`).all() as { integrity_check: string }[];
  const integrity =
    rows.length === 1 ? String(rows[0]?.integrity_check ?? "unknown") : JSON.stringify(rows);
  const foreignKeys = database.prepare(`PRAGMA foreign_key_check`).all();
  return { integrity, foreignKeys };
}

export function checkpointAndClose(): void {
  if (!db) return;
  try {
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      /* best effort */
    }
    db.close();
  } finally {
    db = null;
  }
}

/** Safe copy helper for backup/relocation: checkpoint then copy file. */
export function checkpoint(): void {
  if (!db) return;
  try {
    db.pragma("wal_checkpoint(FULL)");
  } catch {
    /* best effort */
  }
}
