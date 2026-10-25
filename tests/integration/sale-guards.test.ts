// Veloria PoS — Gardes de vente : stock négatif, produit archivé, client archivé.
// Repo réel sur base migrée temporaire (même harnais que sale-credit-limit).
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

import { createSaleAtomic, type CreateSaleInput } from "../../electron/ipc/handlers/sales.repo";

const NOW = "2026-10-25T08:00:00.000Z";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "sale-guards.sqlite"));
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

function seedProduct(db: DatabaseSync, isActive = 1, quantity = 10): number {
  const r = db
    .prepare(
      `INSERT INTO products (uuid, name, unit_code, purchase_price_minor,
        selling_price_minor, quantity, min_stock_level, stock_status, is_active,
        created_at, updated_at)
       VALUES (?, 'Article', 'PIECE', 500, 1000, ?, 0, 'in_stock', ?, ?, ?)`,
    )
    .run(crypto.randomUUID(), quantity, isActive, NOW, NOW);
  return Number(r.lastInsertRowid);
}

function seedCustomer(db: DatabaseSync, deletedAt: string | null): number {
  const r = db
    .prepare(
      `INSERT INTO customers (uuid, first_name, last_name, search_name,
        credit_allowed, credit_limit_minor, outstanding_balance_minor, debt_status,
        is_over_limit, deleted_at, created_at, updated_at)
       VALUES (?, 'Ali', 'Client', 'Ali Client', 1, 0, 0, 'none', 0, ?, ?, ?)`,
    )
    .run(crypto.randomUUID(), deletedAt, NOW, NOW);
  return Number(r.lastInsertRowid);
}

function saleArgs(
  productId: number,
  customerId: number | null,
  allowNegative = false,
): CreateSaleInput {
  return {
    operationId: crypto.randomUUID(),
    uuid: crypto.randomUUID(),
    invoiceNumber: `FAC-${crypto.randomUUID().slice(0, 8)}`,
    customerId,
    subtotalMinor: 1000,
    discountType: "none",
    discountValueMinor: 0,
    discountAmountMinor: 0,
    deliveryFeeMinor: 0,
    totalMinor: 1000,
    amountPaidMinor: 1000,
    remainingMinor: 0,
    paymentStatus: "paid",
    paymentMethod: "cash",
    dueDate: null,
    lines: [
      {
        productId,
        productName: "Article",
        unitCode: "PIECE",
        originalUnitPriceMinor: 1000,
        unitPriceMinor: 1000,
        purchasePriceMinor: 500,
        quantity: 1,
        billedTotalMinor: null,
      },
    ],
    lineTotals: [1000],
    now: NOW,
    allowNegativeStock: allowNegative,
  };
}

describe("Gardes de vente", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-sale-guards-"));
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

  it("refuse un produit archivé", () => {
    const productId = seedProduct(db, 0);
    expect(() => createSaleAtomic(saleArgs(productId, null))).toThrow(/archivé/i);
    expect((db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number }).c).toBe(0);
  });

  it("refuse un client archivé", () => {
    const productId = seedProduct(db);
    const customerId = seedCustomer(db, NOW);
    expect(() => createSaleAtomic(saleArgs(productId, customerId))).toThrow(/Client archivé/i);
    expect((db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number }).c).toBe(0);
  });

  it("refuse toujours le stock négatif, même avec l'ancien paramètre", () => {
    const productId = seedProduct(db, 1, 0);
    expect(() => createSaleAtomic(saleArgs(productId, null, true))).toThrow(/Stock insuffisant/i);
    expect((db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number }).c).toBe(0);
  });
});
