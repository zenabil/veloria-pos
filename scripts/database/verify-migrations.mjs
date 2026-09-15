// Veloria PoS — scripts/database/verify-migrations.mjs
// Verifies versioned migrations apply cleanly on a temp DB (no npm deps, uses node:sqlite).
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const migDir = path.join(root, "database", "migrations");
const files = fs
  .readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
if (files.length < 5) {
  console.error(`FAIL: expected >=5 migrations, found ${files.length}`);
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-verify-"));
const dbFile = path.join(tmp, "Veloria POS DB.sqlite");
const db = new DatabaseSync(dbFile);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = FULL;");
db.exec("PRAGMA busy_timeout = 10000;");
db.exec(
  "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL);",
);

for (const f of files) {
  const sql = fs.readFileSync(path.join(migDir, f), "utf-8");
  const checksum = crypto.createHash("sha256").update(sql).digest("hex");
  const m = f.match(/^(\d+)_/);
  const version = Number(m[1]);
  db.exec(sql);
  db.prepare("INSERT INTO schema_migrations (version, applied_at, checksum) VALUES (?, ?, ?)").run(
    version,
    new Date().toISOString(),
    checksum,
  );
  console.log(`OK  migration ${version} ${f}`);
}

// 0001 starts with PRAGMA foreign_keys = OFF (CLI-friendly); the app runs
// migrations inside a transaction where that pragma is a no-op, so FKs stay
// ON. Re-assert the app invariant here before constraint checks.
db.exec("PRAGMA foreign_keys = ON;");

// Constraints: overpayment must fail
db.prepare(
  "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u1','FAC-2026-00001',1000,1000,500,500,'partial','2026-01-01','2026-01-01')",
).run();
let rejected = false;
try {
  db.prepare(
    "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u2','FAC-2026-00002',1000,1000,1500,-500,'partial','2026-01-01','2026-01-01')",
  ).run();
} catch {
  rejected = true;
}
if (!rejected) {
  console.error("FAIL: overpayment CHECK constraint not enforced");
  process.exit(1);
}
console.log("OK  CHECK constraint rejects overpayment");

// Barcode uniqueness
db.prepare(
  "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES ('p1','Test','PIECE',0,100,10,2,'in_stock','2026-01-01','2026-01-01')",
).run();
db.prepare(
  "INSERT INTO product_barcodes (product_id, barcode, is_primary, created_at) VALUES (1, '619000000001', 1, '2026-01-01')",
).run();
let dupRejected = false;
try {
  db.prepare(
    "INSERT INTO product_barcodes (product_id, barcode, is_primary, created_at) VALUES (1, '619000000001', 0, '2026-01-01')",
  ).run();
} catch {
  dupRejected = true;
}
if (!dupRejected) {
  console.error("FAIL: barcode UNIQUE not enforced");
  process.exit(1);
}
console.log("OK  UNIQUE barcode enforced");

// 0004: standalone customer payment (sale_id NULL) must be accepted,
// dangling sale_id must still be rejected by the FK.
db.prepare(
  "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('c1','Amine','Benali','amine benali','2026-01-01','2026-01-01')",
).run();
db.prepare(
  "INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at) VALUES ('pay-standalone', NULL, 1, 200, 'cash', '2026-01-02', '2026-01-02')",
).run();
console.log("OK  standalone customer payment (sale_id NULL) accepted");
let fkRejected = false;
try {
  db.prepare(
    "INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at) VALUES ('pay-bad', 99999, 1, 100, 'cash', '2026-01-03', '2026-01-03')",
  ).run();
} catch {
  fkRejected = true;
}
if (!fkRejected) {
  console.error("FAIL: dangling sale_payments.sale_id not rejected");
  process.exit(1);
}
console.log("OK  dangling sale_payments.sale_id rejected by FK");

// 0005: phase 6-9 indexes + inventory default
const idx = db
  .prepare(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name IN ('idx_proformas_customer_created','idx_bread_pickup_date','idx_closings_date','idx_customers_debt_status','idx_products_stock_status')",
  )
  .get();
if (idx.c !== 5) {
  console.error(`FAIL: 0005 indexes missing (found ${idx.c}/5)`);
  process.exit(1);
}
console.log("OK  0005 phase 6-9 indexes present");
const inv = db.prepare("SELECT value_json FROM app_settings WHERE key = 'inventory'").get();
if (!inv) {
  console.error("FAIL: inventory default setting missing");
  process.exit(1);
}
console.log("OK  inventory default setting seeded");

// Integrity
const ic = db.prepare("PRAGMA integrity_check").get();
const fk = db.prepare("PRAGMA foreign_key_check").all();
console.log(`OK  integrity_check=${ic.integrity_check} foreign_key_violations=${fk.length}`);
if (ic.integrity_check !== "ok" || fk.length !== 0) process.exit(1);

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log("MIGRATIONS VERIFIED");
