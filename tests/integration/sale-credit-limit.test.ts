// Veloria PoS — Plafond bloquant : solde + reste > plafond = refus,
// sauf accord vendeur (limitOverrideApproved, tracé sur la vente + audit).
// Repos RÉELS sur base migrée temporaire (node:sqlite, même pattern que
// sale-discount-type-guard).
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

const NOW = "2026-10-16T08:00:00.000Z";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "credit-limit.sqlite"));
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

function seedCustomer(
  db: DatabaseSync,
  over: { outstanding?: number; limit?: number; allowed?: number } = {},
): number {
  const outstanding = over.outstanding ?? 900000;
  const limit = over.limit ?? 1000000;
  const allowed = over.allowed ?? 1;
  const r = db
    .prepare(
      `INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, credit_limit_minor, outstanding_balance_minor, debt_status, is_over_limit, created_at, updated_at)
       VALUES (?, 'Karim', 'Bensalem', 'karim bensalem', ?, ?, ?, 'due', 0, ?, ?)`,
    )
    .run(crypto.randomUUID(), allowed, limit, outstanding, NOW, NOW);
  return Number(r.lastInsertRowid);
}

function saleArgs(customerId: number, over: Record<string, unknown> = {}): CreateSaleInput {
  return {
    operationId: crypto.randomUUID(),
    uuid: crypto.randomUUID(),
    invoiceNumber: `FAC-${crypto.randomUUID().slice(0, 8)}`,
    customerId,
    subtotalMinor: 5000000,
    discountType: "none",
    discountValueMinor: 0,
    discountAmountMinor: 0,
    deliveryFeeMinor: 0,
    totalMinor: 5000000,
    amountPaidMinor: 0,
    remainingMinor: 5000000,
    paymentStatus: "unpaid",
    paymentMethod: null,
    dueDate: null,
    lines: [],
    lineTotals: [],
    now: NOW,
    allowNegativeStock: true,
    ...over,
  };
}

describe("Plafond bloquant (main, atomique)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-limit-"));
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

  it("refuse solde + reste > plafond (rollback complet, zéro vente)", () => {
    const id = seedCustomer(db, { outstanding: 900000, limit: 1000000 });
    // projeté = 900 000 + 5 000 000 = 5 900 000 > 1 000 000
    expect(() => createSaleAtomic(saleArgs(id))).toThrow(/Plafond de crédit dépassé/);
    const sales = Number((db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number }).c);
    expect(sales).toBe(0);
    const bal = (
      db.prepare("SELECT outstanding_balance_minor AS b FROM customers WHERE id = ?").get(id) as {
        b: number;
      }
    ).b;
    expect(bal).toBe(900000);
  });

  it("accord vendeur = vente acceptée + flag figé + audit tracé", () => {
    const id = seedCustomer(db, { outstanding: 900000, limit: 1000000 });
    const res = createSaleAtomic(saleArgs(id, { limitOverrideApproved: true }));
    expect(res.saleId).toBeGreaterThan(0);
    const row = db
      .prepare("SELECT credit_limit_override AS o FROM sales WHERE id = ?")
      .get(res.saleId) as { o: number };
    expect(row.o).toBe(1);
    const bal = (
      db.prepare("SELECT outstanding_balance_minor AS b FROM customers WHERE id = ?").get(id) as {
        b: number;
      }
    ).b;
    expect(bal).toBe(5900000);
    const audit = (
      db
        .prepare(
          "SELECT details_json AS j FROM audit_log WHERE entity_id = ? AND event_type = 'sale.created'",
        )
        .get(String(res.saleId)) as { j: string }
    ).j;
    expect(audit).toContain('"limitOverride":1');
  });

  it("sous le plafond = vente acceptée sans accord", () => {
    const id = seedCustomer(db, { outstanding: 100000, limit: 10000000 });
    const res = createSaleAtomic(saleArgs(id));
    expect(res.saleId).toBeGreaterThan(0);
    const row = db
      .prepare("SELECT credit_limit_override AS o FROM sales WHERE id = ?")
      .get(res.saleId) as { o: number };
    expect(row.o).toBe(0);
  });

  it("retry même operationId = vente unique (idempotence)", () => {
    const id = seedCustomer(db, { outstanding: 100000, limit: 10000000 });
    const op = crypto.randomUUID();
    const first = createSaleAtomic(saleArgs(id, { operationId: op }));
    const second = createSaleAtomic(saleArgs(id, { operationId: op }));
    expect(second.saleId).toBe(first.saleId);
  });
});
