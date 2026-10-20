// Veloria PoS — E-21 (P1) : réouverture d'une journée clôturée.
// La migration 0048 verrouille la période close ; la seule issue est
// `closings.reopen`, réservée au GÉRANT, tracée (audit_log) et rejouable
// (même operationId = effet unique).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as unknown, depth: 0 }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const state = repoDb as {
      current: {
        prepare: (sql: string) => {
          all: (...p: unknown[]) => unknown[];
          get: (...p: unknown[]) => unknown;
          run: (...p: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
        };
        exec: (sql: string) => void;
      } | null;
      depth: number;
    };
    const db = state.current;
    if (!db) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => db.prepare(sql),
      get inTransaction(): boolean {
        return state.depth > 0;
      },
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          if (state.depth > 0) {
            db.exec("SAVEPOINT nested;");
            state.depth += 1;
            try {
              const out = fn();
              db.exec("RELEASE nested;");
              state.depth -= 1;
              return out;
            } catch (err) {
              try {
                db.exec("ROLLBACK TO nested;");
                db.exec("RELEASE nested;");
              } catch {
                /* best-effort */
              }
              state.depth -= 1;
              throw err;
            }
          }
          db.exec("BEGIN;");
          state.depth = 1;
          try {
            const out = fn();
            db.exec("COMMIT;");
            state.depth = 0;
            return out;
          } catch (err) {
            try {
              db.exec("ROLLBACK;");
            } catch {
              /* best-effort */
            }
            state.depth = 0;
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

vi.mock("../../electron/backup/backup.service", () => ({
  backupStatus: () => ({ lastBackupAt: null }),
}));

const staffRole = vi.hoisted(() => ({ current: "manager" as string | null }));

vi.mock("../../electron/ipc/handlers/staff.repo", () => ({
  getStaffRole: () => staffRole.current,
}));

import { reopenDailyClosingAtomic } from "../../electron/ipc/handlers/finance.repo";

const NOW = "2026-10-20T09:00:00.000Z";
const DAY = "2026-03-01";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "closing-reopen.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

describe("E-21 : réouverture d'une journée close (gérant, tracée, rejouable)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-closing-reopen-"));
    db = openMigrated(tmp);
    (repoDb as { current: unknown; depth: number }).current = db;
    (repoDb as { current: unknown; depth: number }).depth = 0;
    staffRole.current = "manager";
    db.prepare(
      `INSERT INTO daily_closings (uuid, business_date, cash_sales_minor, cash_payments_minor, customer_collections_minor, expenses_minor, refunds_minor, closing_balance_minor, closed_at)
       VALUES ('cl-reopen', ?, 1000, 0, 0, 0, 0, 1000, ?)`,
    ).run(DAY, `${DAY}T23:59:00.000Z`);
  });

  afterEach(() => {
    (repoDb as { current: unknown; depth: number }).current = null;
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("refuse sans session", () => {
    expect(() =>
      reopenDailyClosingAtomic({
        businessDate: DAY,
        operationId: "11111111-1111-4111-8111-111111111111",
        now: NOW,
        actorUserId: null,
      }),
    ).toThrow(/Session requise/i);
  });

  it("refuse un utilisateur simple (gérant uniquement)", () => {
    staffRole.current = "user";
    expect(() =>
      reopenDailyClosingAtomic({
        businessDate: DAY,
        operationId: "22222222-2222-4222-8222-222222222222",
        now: NOW,
        actorUserId: 7,
      }),
    ).toThrow(/gérant/i);
    const row = db.prepare(`SELECT COUNT(*) AS c FROM daily_closings`).get() as { c: number };
    expect(row.c).toBe(1);
  });

  it("le gérant rouvre la journée : la clôture disparaît, l'événement est tracé", () => {
    const res = reopenDailyClosingAtomic({
      businessDate: DAY,
      operationId: "33333333-3333-4333-8333-333333333333",
      now: NOW,
      actorUserId: 1,
    });
    expect(res["reopened"]).toBe(true);
    const row = db.prepare(`SELECT COUNT(*) AS c FROM daily_closings`).get() as { c: number };
    expect(row.c).toBe(0);
    const audit = db
      .prepare(`SELECT COUNT(*) AS c FROM audit_log WHERE event_type = 'closing.reopened'`)
      .get() as { c: number };
    expect(audit.c).toBe(1);
  });

  it("rejouer le même operationId n'a aucun effet supplémentaire", () => {
    const op = "44444444-4444-4444-8444-444444444444";
    reopenDailyClosingAtomic({ businessDate: DAY, operationId: op, now: NOW, actorUserId: 1 });
    // Le jour est rouvert : on re-clôture puis on rejoue la réouverture.
    db.prepare(
      `INSERT INTO daily_closings (uuid, business_date, cash_sales_minor, cash_payments_minor, customer_collections_minor, expenses_minor, refunds_minor, closing_balance_minor, closed_at)
       VALUES ('cl-reopen-2', ?, 0, 0, 0, 0, 0, 0, ?)`,
    ).run(DAY, `${DAY}T23:59:00.000Z`);
    reopenDailyClosingAtomic({ businessDate: DAY, operationId: op, now: NOW, actorUserId: 1 });
    const row = db.prepare(`SELECT COUNT(*) AS c FROM daily_closings`).get() as { c: number };
    expect(row.c).toBe(1);
  });

  it("refuse une date sans clôture", () => {
    expect(() =>
      reopenDailyClosingAtomic({
        businessDate: "2026-03-09",
        operationId: "55555555-5555-4555-8555-555555555555",
        now: NOW,
        actorUserId: 1,
      }),
    ).toThrow(/Aucune clôture/i);
  });
});
