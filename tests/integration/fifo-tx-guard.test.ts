// Veloria PoS — D batch B : garde transaction appelante FIFO.
// RADICAL-FIX : restoreToLayers + deductIntakeLayers écrivent des couches
// (setRemaining) mais n'exigeaient pas la transaction de l'appelant, à la
// différence de createLayer/consumeLayers — fail-open au lieu de fail-closed.
// Le mock suit inTransaction (BEGIN/COMMIT/ROLLBACK) comme better-sqlite3.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  consumeLayers,
  createLayer,
  deductIntakeLayers,
  restoreToLayers,
} from "../../electron/ipc/handlers/fifo";
import { getDb } from "../../electron/database/sqlite.service";

const repoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null, inTx: false }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const db = repoDb.current as {
      prepare: (sql: string) => {
        get: (...params: unknown[]) => unknown;
        all: (...params: unknown[]) => unknown;
        run: (...params: unknown[]) => unknown;
      };
      exec: (sql: string) => void;
    } | null;
    if (!db) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => db.prepare(sql),
      get inTransaction() {
        return repoDb.inTx;
      },
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          db.exec("BEGIN");
          repoDb.inTx = true;
          try {
            const out = fn();
            db.exec("COMMIT");
            repoDb.inTx = false;
            return out;
          } catch (err) {
            db.exec("ROLLBACK");
            repoDb.inTx = false;
            throw err;
          }
        },
    };
  },
}));

describe("Garde transaction FIFO (fail-closed)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-fifo-tx-"));
    repoDb.inTx = false;
    db = new DatabaseSync(path.join(tmp, "t.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
    repoDb.current = db;
  });

  afterEach(() => {
    repoDb.current = null;
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function seedProduct(): number {
    db.prepare(
      "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES ('tx-guard', 'Garde', 'PIECE', 100, 150, 10, 0, 'in_stock', '2026-09-01', '2026-09-01')",
    ).run();
    return Number(
      (db.prepare("SELECT id FROM products WHERE uuid = 'tx-guard'").get() as { id: number }).id,
    );
  }

  it("restoreToLayers hors transaction échoue en FR (fail-closed)", () => {
    seedProduct();
    expect(() => restoreToLayers([{ layerId: 1, quantity: 1 }])).toThrow(
      /transaction appelante requise/,
    );
  });

  it("deductIntakeLayers hors transaction échoue en FR (fail-closed)", () => {
    seedProduct();
    expect(() => deductIntakeLayers({ productId: 1, intakeId: 1, qty: 1 })).toThrow(
      /transaction appelante requise/,
    );
  });

  it("restoreToLayers DANS la transaction fonctionne (garde non bloquante légitime)", () => {
    const pid = seedProduct();
    const layerId = getDb().transaction(() =>
      createLayer({
        productId: pid,
        qty: 5,
        unitCostMinor: 100,
        reason: "opening",
        now: "2026-09-02T10:00:00.000Z",
      }),
    )();
    getDb().transaction(() => {
      const { consumptions } = consumeLayers({
        productId: pid,
        qty: 2,
        now: "2026-09-02T10:00:00.000Z",
        oversell: false,
        fallbackUnitCostMinor: 100,
        fallbackBasis: "fallback-purchase-price",
      });
      expect(consumptions.length).toBe(1);
      restoreToLayers([{ layerId, quantity: 2 }]);
    })();
    const row = db
      .prepare("SELECT remaining_quantity AS q FROM inventory_layers WHERE id = ?")
      .get(layerId) as { q: number };
    expect(Number(row.q)).toBe(5);
  });
});
