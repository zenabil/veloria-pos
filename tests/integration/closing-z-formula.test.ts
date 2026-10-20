// Veloria PoS — E-22 : la clôture journalière (Z) ne doit compter QUE
// l'argent réellement présent dans le tiroir :
//  - les ventes par chèque / virement ne sont pas des espèces ;
//  - une dépense « pending » (non décaissée) ne sort pas d'argent ;
//  - un retour ANNULÉ ne rembourse rien.
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
  backupStatus: () => ({ count: 0, lastAt: null, lastFile: null, auto: null }),
}));

import { createDailyClosingAtomic } from "../../electron/ipc/handlers/finance.repo";

const DAY = "2026-10-18";
const STAMP = `${DAY}T10:00:00.000Z`;

describe("E-22 : clôture Z — Only the cash actually in the drawer", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-closing-"));
    db = new DatabaseSync(path.join(tmp, "closing.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
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

  function seedSale(
    invoice: string,
    total: number,
    paid: number,
    method: string | null,
    cancelled = 0,
  ): number {
    const r = db
      .prepare(
        `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, discount_type, discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, payment_method, is_cancelled, created_at, updated_at)
         VALUES (?, ?, NULL, ?, 'none', 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        invoice,
        total,
        total,
        paid,
        total - paid,
        paid >= total ? "paid" : "partial",
        method,
        cancelled,
        STAMP,
        STAMP,
      );
    return Number(r.lastInsertRowid);
  }

  it("chèque et virement exclus du tiroir, dépenses pending exclues, retour annulé exclu", () => {
    seedSale("FAC-Z-00001", 10000, 10000, "cash");
    seedSale("FAC-Z-00002", 5000, 5000, "cheque");
    seedSale("FAC-Z-00003", 3000, 3000, "transfer");
    // Dépenses : une payée (sort de la caisse), une pending (ne sort pas).
    db.prepare(
      `INSERT INTO expenses (uuid, description, category, amount_minor, expense_date, status, created_at, updated_at)
       VALUES (?, 'Loyer', 'Loyer', 2000, ?, 'paid', ?, ?)`,
    ).run(crypto.randomUUID(), DAY, STAMP, STAMP);
    db.prepare(
      `INSERT INTO expenses (uuid, description, category, amount_minor, expense_date, status, created_at, updated_at)
       VALUES (?, 'En attente', 'Divers', 700, ?, 'pending', ?, ?)`,
    ).run(crypto.randomUUID(), DAY, STAMP, STAMP);
    // Retour : un remboursé (sort de la caisse), un annulé (ne sort pas).
    const saleId = seedSale("FAC-Z-00004", 1000, 1000, "cash");
    db.prepare(
      `INSERT INTO returns (uuid, original_sale_id, original_invoice_number, customer_id, total_return_value_minor, amount_refunded_minor, credit_to_customer_minor, return_number, status, created_at, updated_at)
       VALUES (?, ?, 'FAC-Z-00004', NULL, 100, 100, 0, 'RET-Z-00001', 'validated', ?, ?)`,
    ).run(crypto.randomUUID(), saleId, STAMP, STAMP);
    db.prepare(
      `INSERT INTO returns (uuid, original_sale_id, original_invoice_number, customer_id, total_return_value_minor, amount_refunded_minor, credit_to_customer_minor, return_number, status, created_at, updated_at)
       VALUES (?, ?, 'FAC-Z-00005', NULL, 400, 400, 0, 'RET-Z-00002', 'cancelled', ?, ?)`,
    ).run(crypto.randomUUID(), saleId, STAMP, STAMP);

    const res = createDailyClosingAtomic({
      businessDate: DAY,
      openingMinor: 0,
      operationId: crypto.randomUUID(),
      now: STAMP,
    }) as {
      cashSalesMinor: number;
      expensesMinor: number;
      refundsMinor: number;
      closingMinor: number;
    };

    // Espèces = 11000 (10000 + la vente cash de 1000 liée aux retours) UNIQUEMENT.
    expect(res.cashSalesMinor).toBe(11000);
    // Dépenses payées = 2000 (la pending est exclue).
    expect(res.expensesMinor).toBe(2000);
    // Remboursements = 100 (le retour annulé est exclu).
    expect(res.refundsMinor).toBe(100);
    // Clôture = 0 + 11000 − 2000 − 100 = 8900.
    expect(res.closingMinor).toBe(8900);
  });

  it("vente ANNULÉE : hors caisse (régression)", () => {
    seedSale("FAC-Z-00006", 4000, 4000, "cash", 1);
    const res = createDailyClosingAtomic({
      businessDate: DAY,
      openingMinor: 0,
      operationId: crypto.randomUUID(),
      now: STAMP,
    }) as { cashSalesMinor: number; closingMinor: number };
    expect(res.cashSalesMinor).toBe(0);
    expect(res.closingMinor).toBe(0);
  });
});
