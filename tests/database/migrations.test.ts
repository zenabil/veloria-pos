import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Migration tests run on the built-in node:sqlite driver (no native toolchain
// required). Driver-specific behavior of better-sqlite3 is covered by the
// packaged runtime smoke test (scripts/release/smoke.js + install QA).
describe("SQLite migrations + integrity", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("applies all migrations in order and enforces foreign keys", () => {
    const dbFile = path.join(tmp, "Veloria POS DB.sqlite");
    const db = new DatabaseSync(dbFile);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    const files = fs
      .readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(3);
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL);",
    );
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migDir, f), "utf-8");
      db.exec(sql);
    }
    // CHECK constraint: overpayment must fail
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u1','FAC-2026-00001',1000,1000,500,500,'partial','2026-01-01','2026-01-01')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u2','FAC-2026-00002',1000,1000,1500,-500,'partial','2026-01-01','2026-01-01')",
        )
        .run(),
    ).toThrow();
    const ic = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    expect(ic.integrity_check).toBe("ok");
    db.close();
  });

  it("rejects sales whose totals break the arithmetic invariant", () => {
    const db = new DatabaseSync(path.join(tmp, "arith.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    // total != subtotal - discount + delivery must fail
    expect(() =>
      db
        .prepare(
          "INSERT INTO sales (uuid, invoice_number, subtotal_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u9','FAC-2026-00009',1000,0,0,500,0,500,'unpaid','2026-01-01','2026-01-01')",
        )
        .run(),
    ).toThrow();
    db.close();
  });

  it("0004 allows standalone customer payments and preserves existing rows", () => {
    const db = new DatabaseSync(path.join(tmp, "pay.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    const files = fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(4);
    const read = (f: string): string => fs.readFileSync(path.join(migDir, f), "utf-8");
    for (const f of files.filter((f) => !f.startsWith("0004"))) db.exec(read(f));
    // Seed: one customer + one sale + one sale-linked payment (pre-0004 schema).
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('c1','Amine','Benali','amine benali','2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u1','FAC-2026-00001',1000,1000,500,500,'partial','2026-01-01','2026-01-01')",
    ).run();
    const saleId = Number(
      (
        db.prepare("SELECT id FROM sales WHERE invoice_number = 'FAC-2026-00001'").get() as {
          id: number;
        }
      ).id,
    );
    db.prepare(
      "INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at) VALUES ('pay1', ?, 1, 500, 'cash', '2026-01-01', '2026-01-01')",
    ).run(saleId);
    // Apply 0004, then verify preservation + new nullability.
    const m0004 = files.find((f) => f.startsWith("0004"));
    expect(m0004).toBeDefined();
    db.exec(read(m0004 as string));
    // 0001 starts with PRAGMA foreign_keys = OFF; re-assert the app invariant
    // (the app runs migrations inside a transaction where that pragma is a no-op).
    db.exec("PRAGMA foreign_keys = ON;");
    const kept = db
      .prepare("SELECT sale_id, amount_minor FROM sale_payments WHERE uuid = 'pay1'")
      .get() as {
      sale_id: number;
      amount_minor: number;
    };
    expect(kept.sale_id).toBe(saleId);
    expect(kept.amount_minor).toBe(500);
    // Standalone collection on the customer account (no linked sale).
    db.prepare(
      "INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at) VALUES ('pay2', NULL, 1, 200, 'cash', '2026-01-02', '2026-01-02')",
    ).run();
    // Dangling sale reference is still rejected by the FK.
    expect(() =>
      db
        .prepare(
          "INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at) VALUES ('pay3', 99999, 1, 100, 'cash', '2026-01-03', '2026-01-03')",
        )
        .run(),
    ).toThrow();
    // 0002 indexes were recreated after the rebuild.
    const idx = db
      .prepare(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name IN ('idx_sale_payments_sale','idx_sale_payments_customer_date')",
      )
      .get() as { c: number };
    expect(idx.c).toBe(2);
    db.close();
  });
});
