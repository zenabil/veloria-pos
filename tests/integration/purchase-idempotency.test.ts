// Veloria PoS — P0 load-bearing : double-submit bons fournisseurs même operationId = effet unique.
// Repos RÉELS (purchases.repo + inventory.repo via receive) sur base migrée temporaire
// (node:sqlite). Mock transaction à savepoints = sémantique better-sqlite3 imbriquée
// (receive → receiveStockAtomic dans la même tx). Sans ce garde, le double-clic
// créait 2 commandes / 2 réceptions (IDs frais par appel — SupplierPOsDialog/OcrImportDialog).
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
    // Profondeur PARTAGÉE entre tous les getDb() (même connexion) : 0 =
    // BEGIN/COMMIT, >0 = SAVEPOINT (miroir exact des transactions imbriquées
    // better-sqlite3 — receive → receiveStockAtomic dans la même tx).
    return {
      prepare: (sql: string) => db.prepare(sql),
      // Miroir de better-sqlite3 `db.inTransaction` (garde fifo.ts).
      get inTransaction(): boolean {
        return state.depth > 0;
      },
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          if (state.depth === 0) {
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
          }
          const sp = `veloria_sp_${state.depth}`;
          state.depth += 1;
          db.exec(`SAVEPOINT ${sp};`);
          try {
            const out = fn();
            db.exec(`RELEASE ${sp};`);
            state.depth -= 1;
            return out;
          } catch (err) {
            try {
              db.exec(`ROLLBACK TO ${sp};`);
              db.exec(`RELEASE ${sp};`);
            } catch {
              /* best-effort */
            }
            state.depth -= 1;
            throw err;
          }
        },
    };
  },
}));

import {
  createPurchaseOrderAtomic,
  orderPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrderAtomic,
} from "../../electron/ipc/handlers/purchases.repo";

const NOW = "2026-10-15T08:00:00.000Z";
const OP_CREATE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OP_CREATE_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OP_ORDER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OP_CANCEL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OP_RECEIVE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "po-idem.sqlite"));
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

function seedSupplier(db: DatabaseSync): number {
  db.prepare(
    "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('f-po','Moulin','FOU-00001','2026-01-01','2026-01-01')",
  ).run();
  return Number(
    (db.prepare("SELECT id FROM suppliers WHERE uuid='f-po'").get() as { id: number }).id,
  );
}

function seedProduct(db: DatabaseSync): number {
  db.prepare(
    "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at) VALUES ('p-po','Farine','KG',4000,5000,20,2,'in_stock',1,'2026-01-01','2026-01-01')",
  ).run();
  return Number(
    (db.prepare("SELECT id FROM products WHERE uuid='p-po'").get() as { id: number }).id,
  );
}

function count(db: DatabaseSync, table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c);
}

describe("P0 : bons fournisseurs idempotents par operationId", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-po-"));
    db = openMigrated(tmp);
    (repoDb as { current: unknown; depth: number }).current = db;
    (repoDb as { current: unknown; depth: number }).depth = 0;
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

  it("purchase.create rejoué même operationId = une seule commande", () => {
    const sid = seedSupplier(db);
    const pid = seedProduct(db);
    const lines = [
      {
        productId: pid,
        productName: "Farine",
        unitCode: "KG",
        quantityOrdered: 5,
        unitCostMinor: 4000,
      },
    ];
    const first = createPurchaseOrderAtomic({
      supplierId: sid,
      expectedDate: null,
      notes: null,
      lines,
      operationId: OP_CREATE,
      now: NOW,
    });
    const second = createPurchaseOrderAtomic({
      supplierId: sid,
      expectedDate: null,
      notes: null,
      lines,
      operationId: OP_CREATE,
      now: NOW,
    });
    expect(second).toEqual(first);
    expect(count(db, "purchase_orders")).toBe(1);
    expect(count(db, "purchase_order_items")).toBe(1);
  });

  it("purchase.create avec operationId différent = nouvelle commande (regen après succès)", () => {
    const sid = seedSupplier(db);
    const pid = seedProduct(db);
    const lines = [
      {
        productId: pid,
        productName: "Farine",
        unitCode: "KG",
        quantityOrdered: 5,
        unitCostMinor: 4000,
      },
    ];
    const args = { supplierId: sid, expectedDate: null, notes: null, lines, now: NOW };
    const a = createPurchaseOrderAtomic({ ...args, operationId: OP_CREATE });
    const b = createPurchaseOrderAtomic({ ...args, operationId: OP_CREATE_2 });
    expect(b.id).not.toBe(a.id);
    expect(b.number).not.toBe(a.number);
    expect(count(db, "purchase_orders")).toBe(2);
  });

  it("order/cancel rejoués même operationId = une seule transition chacun", () => {
    const sid = seedSupplier(db);
    const pid = seedProduct(db);
    const { id } = createPurchaseOrderAtomic({
      supplierId: sid,
      expectedDate: null,
      notes: null,
      lines: [
        {
          productId: pid,
          productName: "Farine",
          unitCode: "KG",
          quantityOrdered: 2,
          unitCostMinor: 4000,
        },
      ],
      operationId: OP_CREATE,
      now: NOW,
    });
    orderPurchaseOrder(id, OP_ORDER, NOW);
    orderPurchaseOrder(id, OP_ORDER, NOW);
    const ordered = Number(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM audit_log WHERE entity_type='purchase' AND event_type='purchase.ordered'",
          )
          .get() as { c: number }
      ).c,
    );
    expect(ordered).toBe(1);
    cancelPurchaseOrder(id, OP_CANCEL, NOW);
    cancelPurchaseOrder(id, OP_CANCEL, NOW);
    const cancelled = Number(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM audit_log WHERE entity_type='purchase' AND event_type='purchase.cancelled'",
          )
          .get() as { c: number }
      ).c,
    );
    expect(cancelled).toBe(1);
    expect(
      (db.prepare("SELECT status AS s FROM purchase_orders WHERE id=?").get(id) as { s: string }).s,
    ).toBe("cancelled");
  });

  it("purchase.receive rejoué même operationId = un seul intake, stock +1×", () => {
    const sid = seedSupplier(db);
    const pid = seedProduct(db);
    const { id } = createPurchaseOrderAtomic({
      supplierId: sid,
      expectedDate: null,
      notes: null,
      lines: [
        {
          productId: pid,
          productName: "Farine",
          unitCode: "KG",
          quantityOrdered: 4,
          unitCostMinor: 4000,
        },
      ],
      operationId: OP_CREATE,
      now: NOW,
    });
    orderPurchaseOrder(id, OP_ORDER, NOW);
    const itemId = Number(
      (
        db.prepare("SELECT id FROM purchase_order_items WHERE po_id=?").get(id) as {
          id: number;
        }
      ).id,
    );
    const args = {
      id,
      lines: [{ itemId, quantityReceived: 4 }],
      operationId: OP_RECEIVE,
      now: NOW,
    };
    const first = receivePurchaseOrderAtomic(args);
    const second = receivePurchaseOrderAtomic(args);
    expect(second).toEqual(first);
    expect(count(db, "stock_intakes")).toBe(1);
    expect(
      (db.prepare("SELECT quantity AS q FROM products WHERE id=?").get(pid) as { q: number }).q,
    ).toBe(24);
    expect(
      (db.prepare("SELECT status AS s FROM purchase_orders WHERE id=?").get(id) as { s: string }).s,
    ).toBe("received");
  });

  it("rollback : réception en échec = rien écrit, retry même operationId réussit", () => {
    const sid = seedSupplier(db);
    const pid = seedProduct(db);
    const { id } = createPurchaseOrderAtomic({
      supplierId: sid,
      expectedDate: null,
      notes: null,
      lines: [
        {
          productId: pid,
          productName: "Farine",
          unitCode: "KG",
          quantityOrdered: 4,
          unitCostMinor: 4000,
        },
      ],
      operationId: OP_CREATE,
      now: NOW,
    });
    orderPurchaseOrder(id, OP_ORDER, NOW);
    const itemId = Number(
      (
        db.prepare("SELECT id FROM purchase_order_items WHERE po_id=?").get(id) as {
          id: number;
        }
      ).id,
    );
    expect(() =>
      receivePurchaseOrderAtomic({
        id,
        lines: [{ itemId, quantityReceived: 99 }],
        operationId: OP_RECEIVE,
        now: NOW,
      }),
    ).toThrow(/supérieure à la commandée/);
    expect(count(db, "stock_intakes")).toBe(0);
    expect(
      (db.prepare("SELECT quantity AS q FROM products WHERE id=?").get(pid) as { q: number }).q,
    ).toBe(20);
    expect(
      (db.prepare("SELECT status AS s FROM purchase_orders WHERE id=?").get(id) as { s: string }).s,
    ).toBe("ordered");
    // Le claim a été annulé avec la tx : le même operationId reste réutilisable.
    const ok = receivePurchaseOrderAtomic({
      id,
      lines: [{ itemId, quantityReceived: 4 }],
      operationId: OP_RECEIVE,
      now: NOW,
    });
    expect(ok.intakeId).toBeGreaterThan(0);
    expect(count(db, "stock_intakes")).toBe(1);
  });
});
