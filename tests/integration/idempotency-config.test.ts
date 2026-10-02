// Veloria PoS — Tests RADICAL-FIX : idempotence configurations (carts/printer/backup).
// Repos RÉELS sur base migrée temporaire (node:sqlite) : même operationId rejoué
// = UN seul effet (pas de double écriture, pas de 2e audit).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const db = repoDb.current as {
      prepare: (sql: string) => {
        all: (...p: unknown[]) => unknown[];
        get: (...p: unknown[]) => unknown;
        run: (...p: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
      };
      exec: (sql: string) => void;
    } | null;
    if (!db) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => db.prepare(sql),
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          db.exec("BEGIN;");
          try {
            const out = fn();
            db.exec("COMMIT;");
            return out;
          } catch (err) {
            try {
              db.exec("ROLLBACK;");
            } catch {
              /* best-effort */
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

import {
  saveCartDraftsAtomic,
  clearCartDraftsAtomic,
} from "../../electron/ipc/handlers/carts.repo";
import { saveSelectedPrinterName } from "../../electron/printing/printing.service";
import { saveBackupAuto } from "../../electron/backup/backup.service";
import {
  cartsSaveSchema,
  cartsClearSchema,
  printerSaveSchema,
  backupAutoSchema,
} from "../../electron/ipc/validators";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "cfg.sqlite"));
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  return db;
}

describe("RADICAL-FIX : configurations idempotentes", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-cfg-"));
    db = openMigrated(tmp);
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

  it("carts.save accepte operationId optionnel et rejoue le résultat", () => {
    const parsed = cartsSaveSchema.parse({ operationId: null, tabs: [] });
    expect(parsed.tabs).toEqual([]);
    const op = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const tabs = [
      {
        tabId: 1,
        name: "Panier 1",
        lines: [
          {
            key: "l1",
            productId: null,
            productName: "Article libre",
            unitCode: "PIECE",
            originalUnitPriceMinor: 1000,
            unitPriceMinor: 1000,
            purchasePriceMinor: 0,
            quantity: 2,
          },
        ],
        customerId: null,
        customerLabel: "Client de passage",
        amountPaidMinor: 0,
        paymentMethod: null,
      },
    ];
    const now = new Date().toISOString();
    const first = saveCartDraftsAtomic(tabs, now, op);
    const second = saveCartDraftsAtomic(tabs, now, op);
    expect(second).toEqual(first);
    const n = db.prepare("SELECT COUNT(*) AS n FROM cart_drafts").get() as { n: number };
    expect(n.n).toBe(1);
  });

  it("carts.clear idempotent par operationId", () => {
    cartsClearSchema.parse({ operationId: null });
    const op = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    const tabs = [
      {
        tabId: 1,
        name: "Panier 1",
        lines: [
          {
            key: "l1",
            productId: null,
            productName: "Article libre",
            unitCode: "PIECE",
            originalUnitPriceMinor: 500,
            unitPriceMinor: 500,
            purchasePriceMinor: 0,
            quantity: 1,
          },
        ],
        customerId: null,
        customerLabel: "Client de passage",
        amountPaidMinor: 0,
        paymentMethod: null,
      },
    ];
    const now = new Date().toISOString();
    saveCartDraftsAtomic(tabs, now, null);
    const first = clearCartDraftsAtomic(op);
    const second = clearCartDraftsAtomic(op);
    expect(second).toEqual(first);
    const n = db.prepare("SELECT COUNT(*) AS n FROM cart_drafts").get() as { n: number };
    expect(n.n).toBe(0);
  });

  it("printer.save idempotent par operationId", () => {
    printerSaveSchema.parse({ name: null, operationId: null });
    const op = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
    const now = new Date().toISOString();
    saveSelectedPrinterName("Imprimante Test", now, op);
    saveSelectedPrinterName("Imprimante Test", now, op);
    const row = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'printer'`).get() as {
      value_json: string;
    };
    expect(JSON.parse(row.value_json)).toEqual({ name: "Imprimante Test" });
    const idem = db
      .prepare(`SELECT COUNT(*) AS n FROM idempotency_keys WHERE operation_id = ?`)
      .get(op) as { n: number };
    expect(idem.n).toBe(1);
  });

  it("backup.autoSave idempotent par operationId", () => {
    backupAutoSchema.parse({
      enabled: true,
      intervalDays: 1,
      frequency: "daily",
      customMinutes: 60,
      retentionCount: 30,
      operationId: null,
    });
    const op = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
    const now = new Date().toISOString();
    const cfg = {
      enabled: true,
      intervalDays: 1,
      frequency: "daily" as const,
      customMinutes: 60,
      retentionCount: 30,
    };
    saveBackupAuto(cfg, now, op);
    saveBackupAuto(cfg, now, op);
    const row = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'backup'`).get() as {
      value_json: string;
    };
    const parsed = JSON.parse(row.value_json) as { retentionCount: number };
    expect(parsed.retentionCount).toBe(30);
  });
});
