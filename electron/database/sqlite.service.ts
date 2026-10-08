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
  inTransaction: boolean;
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

/** Plus haute version de migration embarquée (compatibilité restauration). */
export function latestMigrationVersion(): number {
  const all = readMigrations();
  return all.reduce((m, x) => Math.max(m, x.version), 0);
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

/** Copie de sécurité pré-migration (dossier backups, FATALE si impossible). */
function snapshotBeforeMigration(sourcePath: string): void {
  try {
    const dir = path.join(app.getPath("userData"), "backups");
    fs.mkdirSync(dir, { recursive: true });
    // WAL : vider les frames dans le fichier principal avant la copie, puis
    // copier aussi les compagnons résiduels (crash antérieur) comme le fait
    // la restauration — sinon le snapshot est incomplet/silencieusement corrompu.
    try {
      db?.pragma("wal_checkpoint(FULL)");
    } catch {
      /* meilleur effort */
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(dir, `veloria-avant-migration-${stamp}.sqlite`);
    fs.copyFileSync(sourcePath, dest);
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      const src = `${sourcePath}${suffix}`;
      if (fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, `${dest}${suffix}`);
        } catch {
          /* compagnon illisible : snapshot principal conservé */
        }
      }
    }
    // Rotation : garder les 5 derniers snapshots pré-migration (eux seuls ;
    // listBackups ne liste que les *.vposdb, ces *.sqlite s'accumuleraient sinon).
    try {
      const snaps = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith("veloria-avant-migration-") && f.endsWith(".sqlite"))
        .sort();
      while (snaps.length > 5) {
        const oldest = snaps.shift();
        if (!oldest) break;
        for (const suffix of ["", "-wal", "-shm", "-journal"]) {
          try {
            fs.unlinkSync(path.join(dir, `${oldest}${suffix}`));
          } catch {
            /* absent : cas nominal */
          }
        }
      }
    } catch {
      /* rotation best effort */
    }
    log("INFO", "database", "migration.snapshot", { source: sourcePath });
  } catch (err) {
    // RADICAL: échec snapshot = migration INTERDITE (fail-closed). Continuer
    // sans filet après un WARN exposerait à une migration à moitié appliquée
    // sans restauration possible.
    log("FATAL", "database", "migration.snapshot_failed", { error: String(err) });
    throw new Error("Sauvegarde pré-migration impossible : migration annulée.");
  }
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

  // Compatibilité spec 22 : refuser d'ouvrir silencieusement une base issue
  // d'une version plus récente de l'application.
  const current = currentSchemaVersion(database);
  const latest = latestMigrationVersion();
  if (current > latest) {
    const err = new Error(
      "Cette base de données a été créée avec une version plus récente de Veloria PoS. Veuillez mettre à jour l'application.",
    );
    try {
      database.close();
    } catch {
      /* ignore */
    }
    db = null;
    throw err;
  }

  // Snapshot pré-migration (spec 22) : copie directe sûre ici — verrou
  // single-instance acquis, aucune écriture active avant ouverture.
  const pending = readMigrations().filter((m) => m.version > current);
  if (pending.length > 0) {
    snapshotBeforeMigration(dbPath);
  }
  runMigrations(database);
  // Re-assert pragmas: migration files may contain session-level PRAGMAs
  // (e.g. 0001 starts with `PRAGMA foreign_keys = OFF` for CLI use).
  applyPragmas(database);
  const version = currentSchemaVersion(database);
  log("INFO", "database", "database.opened", { path: dbPath, schemaVersion: version });
  return { path: dbPath, schemaVersion: version };
}

/**
 * P0-2 : réouverture garantie avec réessais. Ne rend JAMAIS la main avec
 * db=null sans lever : les flux restore/relocate restent sur l'ancienne base
 * ouverte en cas d'échec (retry + message FR + log au niveau appelant), jamais
 * sur un état DATABASE_UNAVAILABLE silencieux. Les causes transitoires
 * réalistes (verrou antivirus, flush disque) passent dans les réessais.
 */
export function reopenWithRetry(
  label: string,
  attempts = 3,
): { path: string; schemaVersion: number } {
  let last: unknown = null;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const out = openDatabase();
      if (i > 1) log("INFO", "database", "database.reopened_after_retry", { label, attempt: i });
      return out;
    } catch (err) {
      last = err;
      log("WARN", "database", "database.reopen_attempt_failed", {
        label,
        attempt: i,
        error: err instanceof Error ? err.message : String(err),
      });
      if (i < attempts) {
        try {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, i * 150);
        } catch {
          /* ignore */
        }
      }
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export function runMigrations(database: BetterSqlite3DB = getDb()): void {
  const pending = readMigrations();
  ensureMigrationTable(database);
  const rows = database.prepare(`SELECT version, checksum FROM schema_migrations`).all() as {
    version: number;
    checksum: string;
  }[];
  const applied = new Set(rows.map((r) => r.version));
  // Integrity: verify checksums of already-applied migrations match files.
  // P05: une migration appliquée sans fichier embarqué = drift (suppression
  // après release) — refus explicite au lieu d'un silence.
  for (const r of rows) {
    const file = pending.find((p) => p.version === r.version);
    if (!file) {
      throw new Error(
        `Migration ${r.version} manquante — fichier supprimé après release. Restaurez une sauvegarde vérifiée.`,
      );
    }
    if (file.checksum !== r.checksum) {
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
      // P01: les fichiers historiques peuvent contenir `PRAGMA foreign_keys = OFF`
      // (0001, usage CLI). Dans une transaction SQLite ce PRAGMA est un no-op,
      // mais on ré-affirme l'invariant applicatif après chaque migration.
      try {
        database.pragma("foreign_keys = ON");
      } catch {
        /* meilleur effort */
      }
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

/**
 * Supprime les compagnons WAL d'un fichier DB (-wal/-shm/-journal). Un WAL
 * résiduel d'une autre base appliqué au fichier copié = corruption silencieuse.
 * Appelé après chaque copie de fichier DB (relocation, restauration).
 */
export function removeWalCompanions(dbFile: string): void {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    try {
      fs.unlinkSync(`${dbFile}${suffix}`);
    } catch {
      /* absent : cas nominal */
    }
  }
}

/**
 * Vérifie un FICHIER SQLite candidat via une connexion secondaire en lecture
 * seule (jamais la connexion principale) : en-tête, intégrité, FK, migrations.
 * Utilisé par relocation et restauration avant tout swap. Lève un message FR.
 */
export function verifyDbFileCopy(filePath: string): { schemaVersion: number } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as new (
    filename: string,
    opts?: Record<string, unknown>,
  ) => BetterSqlite3DB;
  let probe: BetterSqlite3DB | null = null;
  try {
    probe = new Database(filePath, { readonly: true, fileMustExist: true });
    const rows = probe.prepare(`PRAGMA integrity_check`).all() as {
      integrity_check: string;
    }[];
    if (rows.length !== 1 || rows[0]?.integrity_check !== "ok") {
      throw new Error("integrity");
    }
    if (probe.prepare(`PRAGMA foreign_key_check`).all().length !== 0) {
      throw new Error("foreign-keys");
    }
    const row = probe.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as {
      v: number | null;
    };
    return { schemaVersion: row.v ?? 0 };
  } catch {
    throw new Error("Ce fichier n'est pas une base Veloria valide et saine.");
  } finally {
    try {
      probe?.close();
    } catch {
      /* ignore */
    }
  }
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

/**
 * Réinitialisation d'usine (paramètres > base de données, zone dangereuse) :
 * ferme la base, SUPPRIME le fichier + compagnons WAL, rouvre une base
 * VIERGE (les migrations rejouent le schéma courant). Les sauvegardes
 * `*.vposdb` sont CONSERVÉES (filet de sécurité : restauration possible).
 * Irréversible pour les données courantes — l'UI exige une confirmation
 * tapée + le canal une preuve `confirmation` littérale.
 * RADICAL-FIX: idempotente par operationId — rejouement même UUID = résultat
 * stocké (pas de 2e suppression), crash avant store = rejouement sûr.
 */
export function factoryResetDatabase(operationId?: string | null): {
  path: string;
  schemaVersion: number;
} {
  // Fast-path retry : même UUID déjà appliqué = résultat rejoué.
  if (typeof operationId === "string" && operationId.length > 0) {
    try {
      const row = db
        ?.prepare(`SELECT result_json FROM idempotency_keys WHERE operation_id = ?`)
        .get(operationId) as { result_json: string } | undefined;
      if (row && row.result_json !== "{}") {
        try {
          const parsed = JSON.parse(row.result_json) as { path: string; schemaVersion: number };
          if (typeof parsed.path === "string") return parsed;
        } catch {
          /* résultat corrompu : réexécuter */
        }
      }
    } catch {
      /* base non ouvrable : continuer vers reset */
    }
  }
  const target = db ? dbPath : getConfiguredDbPath();
  log("WARN", "database", "database.factory_reset", { path: target });
  checkpointAndClose();
  removeWalCompanions(target);
  try {
    fs.unlinkSync(target);
  } catch (err) {
    log("ERROR", "database", "database.factory_reset_unlink_failed", {
      path: target,
      reason: err instanceof Error ? err.message : "erreur inconnue",
    });
    throw new Error("Réinitialisation impossible : fichier de base inaccessible.");
  }
  removeWalCompanions(target);
  const opened = reopenWithRetry("database.factory_reset");
  log("WARN", "database", "database.factory_reset_done", {
    path: opened.path,
    schemaVersion: opened.schemaVersion,
  });
  // Stocker le résultat pour le rejouement (nouvelle base vierge — la table
  // idempotency_keys vient d'être recréée vide par les migrations, on y
  // inscrit le marqueur de ce reset pour que le retry retourne ce résultat).
  if (typeof operationId === "string" && operationId.length > 0) {
    try {
      getDb()
        .prepare(
          `INSERT OR IGNORE INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, 'database.reset', ?, ?)`,
        )
        .run(operationId, JSON.stringify(opened), new Date().toISOString());
    } catch (err) {
      log("WARN", "database", "factory_reset.idempotency_store_failed", {
        error: String(err),
      });
    }
  }
  return opened;
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

/** Optimisation (VACUUM + ANALYZE) : compacte le fichier, ne supprime AUCUNE donnée. */
export function optimizeDatabase(): { beforeBytes: number; afterBytes: number } {
  const database = getDb();
  let before = 0;
  try {
    before = fs.statSync(dbPath).size;
  } catch {
    /* base absente */
  }
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  database.exec("VACUUM");
  database.exec("ANALYZE");
  applyPragmas(database);
  let after = before;
  try {
    after = fs.statSync(dbPath).size;
  } catch {
    /* ignore */
  }
  return { beforeBytes: before, afterBytes: after };
}
