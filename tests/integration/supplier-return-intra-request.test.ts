// Veloria PoS — FIX-P1-01 : retour fournisseur intra-requête.
// 2 lignes même produit dans 1 requête ne doivent pas dépasser l'éligible
// (miroir du motif requestedByProduct du retour client).
// Repos RÉELS sur base migrée temporaire (node:sqlite).
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

import { receiveStockAtomic } from "../../electron/ipc/handlers/inventory.repo";
import { createSupplierReturnAtomic } from "../../electron/ipc/handlers/returns.repo";

const NOW = "2026-10-15T08:00:00.000Z";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "sup-retra.sqlite"));
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

function count(db: DatabaseSync, table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c);
}

describe("FIX-P1-01 : retour fournisseur — cumul intra-requête par produit", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-supret-"));
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

  function seedIntake(): { intakeId: number; productId: number } {
    db.prepare(
      "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('s-fix','Moulin','FOU-00001','2026-01-01','2026-01-01')",
    ).run();
    const sid = Number(
      (db.prepare("SELECT id FROM suppliers WHERE uuid='s-fix'").get() as { id: number }).id,
    );
    db.prepare(
      "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at) VALUES ('p-fix','Farine','KG',4000,5000,0,2,'out_of_stock',1,'2026-01-01','2026-01-01')",
    ).run();
    const pid = Number(
      (db.prepare("SELECT id FROM products WHERE uuid='p-fix'").get() as { id: number }).id,
    );
    const { intakeId } = receiveStockAtomic({
      supplierId: sid,
      invoiceNumber: "FA-001",
      invoiceDate: "2026-10-15",
      shippingMinor: 0,
      notes: null,
      lines: [
        {
          productId: pid,
          productName: "Farine",
          quantityReceived: 10,
          quantityDamaged: 0,
          purchasePriceMinor: 4000,
          sellingPriceMinor: null,
        },
      ],
      operationId: "11111111-1111-4111-8111-111111111111",
      now: NOW,
    });
    return { intakeId, productId: pid };
  }

  it("2 lignes même produit totalisant plus que l'éligible = refus + rollback complet", () => {
    const { intakeId, productId } = seedIntake();
    const stockBefore = Number(
      (
        db.prepare("SELECT quantity FROM products WHERE id = ?").get(productId) as {
          quantity: number;
        }
      ).quantity,
    );
    expect(stockBefore).toBe(10);
    expect(() =>
      createSupplierReturnAtomic({
        operationId: "22222222-2222-4222-8222-222222222222",
        intakeId,
        items: [
          { productId, quantity: 6, condition: "good" },
          { productId, quantity: 5, condition: "good" },
        ],
        recoverMinor: 0,
        recoverMethod: null,
        reason: "test",
        notes: null,
        createdAt: NOW,
        now: NOW,
      }),
    ).toThrow(/éligible/);
    expect(count(db, "supplier_returns")).toBe(0);
    expect(count(db, "supplier_return_items")).toBe(0);
    const stockAfter = Number(
      (
        db.prepare("SELECT quantity FROM products WHERE id = ?").get(productId) as {
          quantity: number;
        }
      ).quantity,
    );
    expect(stockAfter).toBe(10);
  });

  it("2 lignes même produit dans la limite = succès + double-submit même operationId = effet unique + centimes entiers", () => {
    const { intakeId, productId } = seedIntake();
    const args = {
      operationId: "33333333-3333-4333-8333-333333333333",
      intakeId,
      items: [
        { productId, quantity: 6, condition: "good" as const },
        { productId, quantity: 4, condition: "good" as const },
      ],
      recoverMinor: 0,
      recoverMethod: null,
      reason: "test",
      notes: null,
      createdAt: NOW,
      now: NOW,
    };
    const first = createSupplierReturnAtomic(args);
    expect(first.totalReturnMinor).toBe(10 * 4000);
    expect(Number.isInteger(first.totalReturnMinor)).toBe(true);
    const second = createSupplierReturnAtomic(args);
    expect(second).toEqual(first);
    expect(count(db, "supplier_returns")).toBe(1);
    expect(count(db, "supplier_return_items")).toBe(2);
  });
});
