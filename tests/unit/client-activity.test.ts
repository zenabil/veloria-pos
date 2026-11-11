// Veloria PoS — ADR-182 tranche E : lecture du compteur d'usage.
//
// La mesure de l'usage se fait dans le CLOUD (la fonction Edge compte les
// appels authentifiés) ; le POS ne fait que LIRE un agrégat. Ce test
// prouve :
//   1. l'agrégat est lu et compris (visites, clients, dernière visite) ;
//   2. une réponse illisible ou une erreur HTTP ne font pas tomber l'écran
//      (le compteur est un indicateur, jamais un bloquant) ;
//   3. un miroir non configuré ne renvoie rien (pas de réseau inutile).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const raw = repoDb.current;
    if (!raw) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => raw.prepare(sql),
      exec: (sql: string) => raw.exec(sql),
      transaction: (fn: () => unknown) => () => {
        raw.exec("BEGIN");
        try {
          const out = fn();
          raw.exec("COMMIT");
          return out;
        } catch (err) {
          raw.exec("ROLLBACK");
          throw err;
        }
      },
    };
  },
}));

vi.mock("../../electron/services/logger", () => ({
  log: () => {},
  initLogger: () => "",
  getLogFile: () => "",
}));

vi.mock("../../electron/sync/sync-secrets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../electron/sync/sync-secrets")>();
  return { ...actual, safeStorageSecretBackend: () => actual.memorySecretBackend() };
});

import { getClientActivityStats } from "../../electron/sync/sync.service";

const NOW = "2026-11-11T10:00:00.000Z";

function openMigrated(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  db.exec("PRAGMA foreign_keys=ON;");
  return db;
}

function setMirror(enabled: boolean): void {
  const raw = repoDb.current;
  if (!raw) throw new Error("Base de test non ouverte.");
  raw
    .prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('client_sync', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    )
    .run(
      JSON.stringify({
        enabled,
        supabaseUrl: "http://127.0.0.1:8100",
        serviceKey: "k".repeat(40),
        anonKey: "",
        intervalMinutes: 15,
        lastPushAt: null,
        lastError: null,
      }),
      NOW,
    );
}

describe("ADR-182 — compteur d'usage de l'application", () => {
  beforeEach(() => {
    repoDb.current = openMigrated();
    setMirror(true);
  });

  it("lit l'agrégat 30 jours", async () => {
    const stats = await getClientActivityStats(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify([{ calls: 128, customers: 23, last_at: "2026-11-11T09:00:00.000Z" }]),
          ),
      }),
    );
    expect(stats?.calls).toBe(128);
    expect(stats?.customers).toBe(23);
    expect(stats?.lastAt).toBe("2026-11-11T09:00:00.000Z");
  });

  it("une réponse illisible ne fait pas tomber l'écran", async () => {
    const stats = await getClientActivityStats(() =>
      Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("pas du json") }),
    );
    expect(stats).toBeNull();
  });

  it("une erreur HTTP (table absente) renvoie null, sans lever", async () => {
    const stats = await getClientActivityStats(() =>
      Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("not found") }),
    );
    expect(stats).toBeNull();
  });

  it("un miroir non configuré ne fait AUCUN appel réseau", async () => {
    setMirror(false);
    let called = 0;
    const stats = await getClientActivityStats(() => {
      called += 1;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("[]") });
    });
    expect(stats).toBeNull();
    expect(called).toBe(0);
  });
});
