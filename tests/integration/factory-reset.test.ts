// Veloria PoS — Tests intégration : réinitialisation d'usine.
// Le driver natif better-sqlite3 est compilé pour Electron (inchargeable
// sous vitest/Node — voir tests/database/migrations.test.ts) : on rejoute
// ici le PROTOCOLE exact de factoryResetDatabase (fermer → supprimer
// fichier + compagnons → rouvrir → rejouer les migrations) sur node:sqlite.
// Le service réel est couvert par le smoke packagé + le spec E2E dédié
// (tests/e2e/factory-reset.spec.ts, Electron réel + better-sqlite3 natif).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function applyMigrations(dbFile: string): number {
  const db = new DatabaseSync(dbFile);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL);",
    );
    const migDir = path.join(process.cwd(), "database", "migrations");
    const files = fs
      .readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migDir, f), "utf-8");
      db.exec(sql);
      const m = f.match(/^(\d+)_.*\.sql$/);
      const version = Number(m?.[1] ?? 0);
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      db.prepare(
        "INSERT OR IGNORE INTO schema_migrations (version, applied_at, checksum) VALUES (?, ?, ?)",
      ).run(version, new Date().toISOString(), checksum);
    }
    const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as {
      v: number | null;
    };
    return row.v ?? 0;
  } finally {
    db.close();
  }
}

/** Miroir fidèle de factoryResetDatabase (sqlite.service) : suppression
 *  fichier + compagnons WAL puis réouverture avec rejeu des migrations. */
function factoryResetMirror(dbFile: string): number {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try {
      fs.unlinkSync(`${dbFile}${suffix}`);
    } catch {
      /* absent : cas nominal */
    }
  }
  return applyMigrations(dbFile);
}

describe("factory reset (protocole miroir)", () => {
  let tmp: string;
  let dbFile: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-reset-"));
    dbFile = path.join(tmp, "Veloria POS DB.sqlite");
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("seed → reset → base vierge au schéma courant, fichier recréé", () => {
    const version = applyMigrations(dbFile);
    expect(version).toBeGreaterThanOrEqual(30);

    const seeded = new DatabaseSync(dbFile);
    try {
      seeded.exec("PRAGMA foreign_keys = ON;");
      const now = new Date().toISOString();
      seeded
        .prepare("INSERT INTO categories (uuid, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .run(crypto.randomUUID(), "E2E-Reset-Seed", now, now);
      const n = seeded.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number };
      expect(n.n).toBeGreaterThanOrEqual(1);
    } finally {
      seeded.close();
    }

    const after = factoryResetMirror(dbFile);
    expect(after).toBe(version);
    expect(fs.existsSync(dbFile)).toBe(true);

    const fresh = new DatabaseSync(dbFile);
    try {
      fresh.exec("PRAGMA foreign_keys = ON;");
      const n = fresh.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number };
      expect(n.n).toBe(0);
      const check = fresh.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
      expect(check.integrity_check).toBe("ok");
      expect(fresh.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      fresh.close();
    }
  });

  it("le schéma database.reset exige la preuve littérale + UUID", async () => {
    const { databaseResetSchema } = await import("../../electron/ipc/validators");
    expect(() =>
      databaseResetSchema.parse({
        confirmation: "REINITIALISER",
        operationId: crypto.randomUUID(),
      }),
    ).not.toThrow();
    expect(() =>
      databaseResetSchema.parse({ confirmation: "oui", operationId: crypto.randomUUID() }),
    ).toThrow();
    expect(() =>
      databaseResetSchema.parse({ confirmation: "REINITIALISER", operationId: "x" }),
    ).toThrow();
  });
});
