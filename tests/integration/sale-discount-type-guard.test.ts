// Veloria PoS — FIX-P1-02 : discountType "percent" refusé fail-closed.
// La remise vit dans les lignes (P0-7) ; un taux flottant (ex. 2.5) n'a rien
// à faire dans la colonne INTEGER discount_value_minor (MONEY-ROOT).
// Repos RÉELS sur base migrée temporaire (node:sqlite).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null, depth: 0 }));

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

const NOW = "2026-10-15T08:00:00.000Z";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "disc-guard.sqlite"));
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

function baseArgs(over: Record<string, unknown> = {}): CreateSaleInput {
  return {
    operationId: "11111111-1111-4111-8111-111111111111",
    uuid: "22222222-2222-4222-8222-222222222222",
    invoiceNumber: "FAC-TEST-000001",
    customerId: null,
    subtotalMinor: 2000,
    discountType: "none",
    discountValueMinor: 0,
    discountAmountMinor: 0,
    deliveryFeeMinor: 0,
    totalMinor: 2000,
    amountPaidMinor: 2000,
    remainingMinor: 0,
    paymentStatus: "paid",
    paymentMethod: "cash",
    dueDate: null,
    lines: [
      {
        productId: null,
        productName: "Sachet",
        unitCode: "PIECE",
        originalUnitPriceMinor: 1000,
        unitPriceMinor: 1000,
        purchasePriceMinor: 0,
        quantity: 2,
      },
    ],
    lineTotals: [2000],
    now: NOW,
    allowNegativeStock: false,
    ...over,
  };
}

describe("FIX-P1-02 : garde discountType fail-closed", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-disc-"));
    db = openMigrated(tmp);
    repoDb.current = db;
    repoDb.depth = 0;
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

  it("discountType 'percent' = refus FR + rollback complet (zéro vente)", () => {
    expect(() =>
      createSaleAtomic(baseArgs({ discountType: "percent", discountValueMinor: 2.5 }) as never),
    ).toThrow(/remises par lignes/);
    const sales = Number((db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number }).c);
    const items = Number(
      (db.prepare("SELECT COUNT(*) AS c FROM sale_items").get() as { c: number }).c,
    );
    expect(sales).toBe(0);
    expect(items).toBe(0);
  });

  it("discountType 'none' = vente acceptée, montants entiers", () => {
    const res = createSaleAtomic(baseArgs());
    expect(res.invoiceNumber).toBe("FAC-TEST-000001");
    const row = db.prepare("SELECT total_minor FROM sales WHERE id = ?").get(res.saleId) as {
      total_minor: number;
    };
    expect(row.total_minor).toBe(2000);
    expect(Number.isInteger(row.total_minor)).toBe(true);
  });
});
