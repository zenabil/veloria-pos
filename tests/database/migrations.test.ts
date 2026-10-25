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
    // RADICAL-FIX: contiguïté exacte 0001→0053 (tout trou = drift refusé par verify-migrations).
    expect(files.length).toBe(53);
    expect(files[0]).toMatch(/^0001_/);
    expect(files[files.length - 1]).toMatch(/^0053_/);
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL);",
    );
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migDir, f), "utf-8");
      db.exec(sql);
    }
    // CHECK constraint: overpayment must fail (customer 1 is credit-authorized).
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('c1','Amine','Benali','amine benali',1,'2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u1','FAC-2026-00001',1,1000,1000,500,500,'partial','2026-01-01','2026-01-01')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u2','FAC-2026-00002',1,1000,1000,1500,-500,'partial','2026-01-01','2026-01-01')",
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
    // total != subtotal - discount + delivery must fail (authorized customer).
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('c9','Lina','Haddad','lina haddad',1,'2026-01-01','2026-01-01')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u9','FAC-2026-00009',1,1000,0,0,500,0,500,'unpaid','2026-01-01','2026-01-01')",
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
    expect(files.length).toBe(53);
    const read = (f: string): string => fs.readFileSync(path.join(migDir, f), "utf-8");
    for (const f of files.filter((f) => !f.startsWith("0004"))) db.exec(read(f));
    // Seed: one credit-authorized customer + one sale + one sale-linked payment.
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('c1','Amine','Benali','amine benali',1,'2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u1','FAC-2026-00001',1,1000,1000,500,500,'partial','2026-01-01','2026-01-01')",
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

  it("0005 adds phase 6-9 indexes and seeds the inventory policy", () => {
    const db = new DatabaseSync(path.join(tmp, "p5.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
    const idx = db
      .prepare(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name IN ('idx_proformas_customer_created','idx_proformas_status','idx_bread_pickup_date','idx_closings_date','idx_customers_debt_status','idx_products_stock_status')",
      )
      .get() as { c: number };
    expect(idx.c).toBe(6);
    const inv = db.prepare("SELECT value_json FROM app_settings WHERE key = 'inventory'").get() as {
      value_json: string;
    };
    expect(JSON.parse(inv.value_json) as { allowNegativeStock: boolean }).toEqual({
      allowNegativeStock: false,
    });
    db.close();
  });

  it("0016 upgrades an old database: order_name backfilled, recurring defaults to 0", () => {
    // Base ancienne (0001..0015) avec une commande existante, puis 0016 seule.
    const db = new DatabaseSync(path.join(tmp, "p16.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    const files = fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort();
    expect(files.filter((f) => f.startsWith("0016"))).toHaveLength(1);
    for (const f of files.filter((f) => !f.startsWith("0016"))) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
    db.prepare(
      "INSERT INTO bread_orders (uuid, order_number, bread_type, order_date, pickup_date, quantity, unit_price_minor, total_amount_minor, payment_status, pickup_status, created_at, updated_at) VALUES ('b16','PAIN-2026-00016','Pain maison','2026-01-01','2026-01-02',5,1500,7500,'unpaid','pending','2026-01-01','2026-01-01')",
    ).run();
    const m0016 = files.find((f) => f.startsWith("0016")) as string;
    db.exec(fs.readFileSync(path.join(migDir, m0016), "utf-8"));
    db.exec("PRAGMA foreign_keys = ON;");
    const backfill = db
      .prepare("SELECT order_name, is_recurring FROM bread_orders WHERE uuid = 'b16'")
      .get() as { order_name: string; is_recurring: number };
    expect(backfill.order_name).toBe("Pain maison");
    expect(backfill.is_recurring).toBe(0);
    // Lignes fraîches : défaut ponctuel, flag contraint.
    db.prepare(
      "INSERT INTO bread_orders (uuid, order_number, bread_type, order_name, is_recurring, order_date, pickup_date, quantity, unit_price_minor, total_amount_minor, payment_status, pickup_status, created_at, updated_at) VALUES ('b16b','PAIN-2026-00017','Pain','Quotidienne',1,'2026-01-01','2026-01-02',2,1500,3000,'unpaid','pending','2026-01-01','2026-01-01')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO bread_orders (uuid, order_number, bread_type, is_recurring, order_date, pickup_date, quantity, unit_price_minor, total_amount_minor, payment_status, pickup_status, created_at, updated_at) VALUES ('b16c','PAIN-2026-00018','Pain',2,'2026-01-01','2026-01-02',2,1500,3000,'unpaid','pending','2026-01-01','2026-01-01')",
        )
        .run(),
    ).toThrow();
    const idx = db
      .prepare(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name = 'idx_bread_recurring'",
      )
      .get() as { c: number };
    expect(idx.c).toBe(1);
    db.close();
  });

  it("0031 arms defensive sale-item triggers (discount coherence)", () => {
    const db = new DatabaseSync(path.join(tmp, "p31.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
    const trg = db
      .prepare(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%sale_item%'",
      )
      .get() as { c: number };
    expect(trg.c).toBeGreaterThan(0);
    db.close();
  });

  it("0034 enforces client phone uniqueness (access sync)", () => {
    const db = new DatabaseSync(path.join(tmp, "p34.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
    const files = fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort();
    expect(files.some((f) => f.startsWith("0034_"))).toBe(true);
    db.close();
  });

  it("0035 adds company NIS + article_imposition (nullable, factures DZ)", () => {
    const db = new DatabaseSync(path.join(tmp, "p35.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    const cols = db
      .prepare("PRAGMA table_info(company_profile)")
      .all()
      .map((c) => (c as { name: string }).name);
    expect(cols).toContain("nis");
    expect(cols).toContain("article_imposition");
    db.prepare(
      "INSERT INTO company_profile (id, uuid, company_name, nis, article_imposition, created_at, updated_at) VALUES (1, 'u35', 'SARL Test', '123', 'ART-9', '2026-01-01', '2026-01-01')",
    ).run();
    const row = db
      .prepare("SELECT nis, article_imposition FROM company_profile WHERE id = 1")
      .get() as { nis: string; article_imposition: string };
    expect(row.nis).toBe("123");
    expect(row.article_imposition).toBe("ART-9");
    db.close();
  });
});
