// Veloria PoS — Tests L4 : rétention des opérations critiques (repo RÉEL).
// Contrairement au test « miroir » (retention.test.ts), on exécute
// `pruneTechnicalTables` sur une base temporaire : une régression des
// préfixes CRITICAL_OP_PREFIXES (purge à 90 j d'une opération sans garde
// UNIQUE métier) fait échouer ce test.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Repo RÉEL testé sur base temporaire : `getDb` redirigé (node:sqlite) et
// logger neutralisé (aucun import Electron dans ce contexte).
const repoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const db = repoDb.current as {
      prepare: (sql: string) => {
        all: (...params: unknown[]) => unknown;
        run: (...params: unknown[]) => { changes: number | bigint };
      };
    } | null;
    if (!db) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => db.prepare(sql),
      // RADICAL-FIX: sémantique réelle BEGIN/COMMIT/ROLLBACK (jamais de no-op).
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          (db as unknown as { exec: (s: string) => void }).exec("BEGIN;");
          try {
            const out = fn();
            (db as unknown as { exec: (s: string) => void }).exec("COMMIT;");
            return out;
          } catch (err) {
            try {
              (db as unknown as { exec: (s: string) => void }).exec("ROLLBACK;");
            } catch {
              /* rollback best-effort */
            }
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

import { pruneTechnicalTables } from "../../electron/database/retention";

const DAY_MS = 86_400_000;

// Opérations DÉclarées critiques en 365 j (aucune garde UNIQUE métier).
const CRITICAL_OPS = [
  "zakat.save",
  "zakat.saveParams", // couvert par le préfixe "zakat.save"
  "products.import",
  "customers.import",
  "purchase.create",
  "purchase.receive",
  "customers.accessActivate",
  "customers.accessRevoke",
  "sync.enqueue",
  "sync.pushNow",
  "sync.saveConfig",
  "announcements.save",
];

describe("L4 : rétention des opérations idempotentes critiques", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-ret4-"));
    db = new DatabaseSync(path.join(tmp, "retention.sqlite"));
    db.exec(`CREATE TABLE idempotency_keys (
        operation_id TEXT PRIMARY KEY,
        op_type TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY,
        event_id TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL
      );`);
    repoDb.current = db;
  });

  afterEach(() => {
    repoDb.current = null;
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("garde 365 j les préfixes critiques, purge à 90 j le reste", () => {
    const now = Date.now();
    const old100d = new Date(now - 100 * DAY_MS).toISOString();
    const recent10d = new Date(now - 10 * DAY_MS).toISOString();
    const tooOld400d = new Date(now - 400 * DAY_MS).toISOString();
    const ins = db.prepare(
      `INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at)
       VALUES (?, ?, '{}', ?)`,
    );
    // 100 j : > 90 j (purge normale) mais < 365 j → les critiques survivent.
    for (const op of CRITICAL_OPS) ins.run(`op-${op}`, op, old100d);
    // Non critique, 100 j → doit être purgé (replay bloqué par garde métier).
    ins.run("op-sales-create", "sales.create", old100d);
    // Récent → conservé quel que soit le type.
    ins.run("op-sales-create-recent", "sales.create", recent10d);
    // Critique mais > 365 j → purge définitive (audit fait foi).
    ins.run("op-cancel-400d", "sales.cancel", tooOld400d);

    const out = pruneTechnicalTables(now);

    expect(out.idempotency).toBe(2);
    const left = (
      db.prepare(`SELECT operation_id FROM idempotency_keys`).all() as {
        operation_id: string;
      }[]
    ).map((r) => r.operation_id);
    left.sort();
    const expected = [...CRITICAL_OPS.map((op) => `op-${op}`), "op-sales-create-recent"].sort();
    expect(left).toEqual(expected);
  });

  it("ne touche ni à l'audit récent ni aux clés récentes", () => {
    const now = Date.now();
    const old100d = new Date(now - 100 * DAY_MS).toISOString();
    db.prepare(
      `INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at)
       VALUES (?, ?, '{}', ?)`,
    ).run("op-zakat", "zakat.save", old100d);
    db.prepare(`INSERT INTO audit_log (event_id, created_at) VALUES (?, ?)`).run(
      "a-recent",
      new Date(now - 10 * DAY_MS).toISOString(),
    );
    db.prepare(`INSERT INTO audit_log (event_id, created_at) VALUES (?, ?)`).run(
      "a-old",
      new Date(now - 400 * DAY_MS).toISOString(),
    );

    const out = pruneTechnicalTables(now);

    expect(out.idempotency).toBe(0);
    expect(out.audit).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) AS c FROM idempotency_keys`).get()).toEqual({ c: 1 });
    expect(db.prepare(`SELECT event_id FROM audit_log`).get()).toEqual({ event_id: "a-recent" });
  });
});
