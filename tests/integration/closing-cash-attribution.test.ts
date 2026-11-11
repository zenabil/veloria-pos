// Veloria PoS — Audit 2026-11-09 : الإغلاق يتبع تدفق النقد الفعلي (C-01/C-02/C-03).
//
// - C-01 : تسديد فاتورة قديمة (sale_id مربوط) يدخل في نقد يوم التسديد ويُحسب
//   كـ `collections`، لا يُستبعد.
// - C-02 : دفعة لاحقة على فاتورة سابقة لا يُنسب ليوم إنشائها بل ليوم دفعها.
// - C-03 : استرداد لاحق لمرتجع سابق يُنسب ليوم الاسترداد (return_refund_movements).
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

const DAY1 = "2026-10-18";
const DAY2 = "2026-10-19";
const STAMP1 = `${DAY1}T10:00:00.000Z`;
const STAMP2 = `${DAY2}T10:00:00.000Z`;

describe("Audit 2026-11-09 : clôture — le tiroir suit le flux de caisse", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-closing-attrib-"));
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

  function seedSale(invoice: string, total: number, paid: number, stamp: string): number {
    // فاتورة ائتمانية تتطلب عميلاً (trigger 0023 رسالة FR).
    const cust = db
      .prepare(
        `INSERT INTO customers (uuid, first_name, last_name, search_name, credit_limit_minor, credit_allowed, created_at, updated_at) VALUES (?, 'A', 'B', 'a b', 100000000, 1, ?, ?)`,
      )
      .run(crypto.randomUUID(), stamp, stamp);
    const customerId = Number(cust.lastInsertRowid);
    const r = db
      .prepare(
        `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, discount_type, discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, payment_method, is_cancelled, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'none', 0, 0, 0, ?, ?, ?, ?, 'cash', 0, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        invoice,
        customerId,
        total,
        total,
        paid,
        total - paid,
        paid >= total ? "paid" : "partial",
        stamp,
        stamp,
      );
    return Number(r.lastInsertRowid);
  }

  function payment(
    saleId: number | null,
    amount: number,
    method: string,
    paymentDate: string,
    stamp: string,
  ): void {
    db.prepare(
      `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), saleId, amount, method, paymentDate, stamp);
  }

  it("C-01 : تسديد فاتورة قديمة يدخل collections ليوم التسديد (لا عجز وهمي)", () => {
    const saleId = seedSale("FAC-OLD", 5000, 0, STAMP1);
    // التسديد الأصلي خارج النافذة: اليوم 2 فقط.
    payment(saleId, 5000, "cash", DAY2, STAMP2);
    const res = createDailyClosingAtomic({
      businessDate: DAY2,
      openingMinor: 0,
      operationId: crypto.randomUUID(),
      now: STAMP2,
    }) as { cashSalesMinor: number; collectionsMinor: number; closingMinor: number };
    expect(res.cashSalesMinor).toBe(0);
    expect(res.collectionsMinor).toBe(5000);
    expect(res.closingMinor).toBe(5000);
  });

  it("C-02 : الدفعة اللاحقة تُنسب ليوم دفعها لا ليوم إنشاء الفاتورة", () => {
    const saleId = seedSale("FAC-SPLIT", 10000, 3000, STAMP1);
    payment(saleId, 3000, "cash", DAY1, STAMP1); // الدفعة الأولى يوم 1
    payment(saleId, 7000, "cash", DAY2, STAMP2); // الباقي يوم 2
    // اليوم 1: مبيعات نقدية = الأساسي فقط (3000)، collections = 0
    const day1 = createDailyClosingAtomic({
      businessDate: DAY1,
      openingMinor: 0,
      operationId: crypto.randomUUID(),
      now: STAMP1,
    }) as { cashSalesMinor: number; collectionsMinor: number; closingMinor: number };
    expect(day1.cashSalesMinor).toBe(3000);
    expect(day1.collectionsMinor).toBe(0);
    expect(day1.closingMinor).toBe(3000);
    // اليوم 2: لا مبيعات جديدة، الاستلام = الباقي كـ collections
    const day2 = createDailyClosingAtomic({
      businessDate: DAY2,
      openingMinor: 0,
      operationId: crypto.randomUUID(),
      now: STAMP2,
    }) as { cashSalesMinor: number; collectionsMinor: number; closingMinor: number };
    expect(day2.cashSalesMinor).toBe(0);
    expect(day2.collectionsMinor).toBe(7000);
    expect(day2.closingMinor).toBe(7000);
  });

  it("C-03 : الاسترداد اللاحق يُنسب ليوم الاسترداد (return_refund_movements)", () => {
    const saleId = seedSale("FAC-RET", 8000, 8000, STAMP1);
    payment(saleId, 8000, "cash", DAY1, STAMP1);
    const r = db
      .prepare(
        `INSERT INTO returns (uuid, original_sale_id, original_invoice_number, customer_id, total_return_value_minor, amount_refunded_minor, credit_to_customer_minor, return_number, status, created_at, updated_at)
         VALUES (?, ?, 'FAC-RET', NULL, 2000, 0, 0, 'RET-1', 'validated', ?, ?)`,
      )
      .run(crypto.randomUUID(), saleId, STAMP1, STAMP1);
    const retId = Number(r.lastInsertRowid);
    db.prepare(`UPDATE returns SET amount_refunded_minor = 1500, updated_at = ? WHERE id = ?`).run(
      STAMP2,
      retId,
    );
    db.prepare(
      `INSERT INTO return_refund_movements (uuid, return_id, amount_minor, method, created_at) VALUES (?, ?, 1500, 'cash', ?)`,
    ).run(crypto.randomUUID(), retId, STAMP2);
    const day1 = createDailyClosingAtomic({
      businessDate: DAY1,
      openingMinor: 0,
      operationId: crypto.randomUUID(),
      now: STAMP1,
    }) as { cashSalesMinor: number; refundsMinor: number; closingMinor: number };
    expect(day1.refundsMinor).toBe(0);
    expect(day1.closingMinor).toBe(8000);
    const day2 = createDailyClosingAtomic({
      businessDate: DAY2,
      openingMinor: 0,
      operationId: crypto.randomUUID(),
      now: STAMP2,
    }) as { cashSalesMinor: number; refundsMinor: number; closingMinor: number };
    expect(day2.refundsMinor).toBe(1500);
    expect(day2.closingMinor).toBe(-1500);
  });
});
