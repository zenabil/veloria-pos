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
// P9: nom inattendu / version dupliquée / trou de séquence = FAIL explicite
// (pas seulement "le fichier existe").
{
  const versions = [];
  for (const f of files) {
    const m = f.match(/^(\d+)_.*\.sql$/);
    if (!m) {
      console.error(`FAIL: unexpected migration filename ${f}`);
      process.exit(1);
    }
    versions.push(Number(m[1]));
  }
  const dupes = versions.filter((v, i) => versions.indexOf(v) !== i);
  if (dupes.length > 0) {
    console.error(`FAIL: duplicate migration versions ${dupes.join(",")}`);
    process.exit(1);
  }
  for (let i = 1; i < versions.length; i++) {
    if (versions[i] !== versions[i - 1] + 1) {
      console.error(`FAIL: migration gap between ${versions[i - 1]} and ${versions[i]}`);
      process.exit(1);
    }
  }
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

// Constraints: overpayment must fail (customer 1 is credit-authorized, 0007).
db.prepare(
  "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('c1','Amine','Benali','amine benali',1,'2026-01-01','2026-01-01')",
).run();
db.prepare(
  "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u1','FAC-2026-00001',1,1000,1000,500,500,'partial','2026-01-01','2026-01-01')",
).run();
let rejected = false;
try {
  db.prepare(
    "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u2','FAC-2026-00002',1,1000,1000,1500,-500,'partial','2026-01-01','2026-01-01')",
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
// dangling sale_id must still be rejected by the FK (customer 1 seeded above).
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

// 0006: notes libres sur les fiches clients
const notes = db
  .prepare("SELECT COUNT(*) AS c FROM pragma_table_info('customers') WHERE name = 'notes'")
  .get();
if (notes.c !== 1) {
  console.error("FAIL: 0006 customers.notes column missing");
  process.exit(1);
}
console.log("OK  0006 customers.notes column present");

// 0007: vente à crédit réservée aux clients autorisés (colonne + trigger)
const custCols = db
  .prepare("SELECT name FROM pragma_table_info('customers')")
  .all()
  .map((r) => r.name);
if (!custCols.includes("credit_allowed")) {
  console.error("FAIL: 0007 customers.credit_allowed column missing");
  process.exit(1);
}
const trg = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_sales_credit_allowed'",
  )
  .get();
if (!trg) {
  console.error("FAIL: 0007 trg_sales_credit_allowed trigger missing");
  process.exit(1);
}
console.log("OK  0007 credit_allowed + trigger present");

// 0008: fiche fournisseur enrichie (code unique + actif par défaut)
const supCols = db
  .prepare("SELECT name FROM pragma_table_info('suppliers')")
  .all()
  .map((r) => r.name);
for (const col of ["code", "tax_number", "commercial_register", "notes", "is_active"]) {
  if (!supCols.includes(col)) {
    console.error(`FAIL: 0008 suppliers.${col} column missing`);
    process.exit(1);
  }
}
console.log("OK  0008 supplier file columns present");
// (Le remplissage des codes existants est testé dans atomic-slices ; ici :
// code explicite stocké, actif par défaut, doublon rejeté.)
db.prepare(
  "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('f1','Moulin El Baraka','FOU-00001','2026-01-01','2026-01-01')",
).run();
const sup = db.prepare("SELECT code, is_active FROM suppliers WHERE uuid = 'f1'").get();
if (sup.code !== "FOU-00001" || sup.is_active !== 1) {
  console.error("FAIL: 0008 stored code / active default wrong");
  process.exit(1);
}
console.log("OK  0008 stored code + active default");
let codeDupRejected = false;
try {
  db.prepare(
    "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('f2','Autre','FOU-00001','2026-01-01','2026-01-01')",
  ).run();
} catch {
  codeDupRejected = true;
}
if (!codeDupRejected) {
  console.error("FAIL: duplicate supplier code accepted");
  process.exit(1);
}
console.log("OK  duplicate supplier code rejected");

// 0009: page stock (plafond produit, référence mouvement, index)
const prodCols = db
  .prepare("SELECT name FROM pragma_table_info('products')")
  .all()
  .map((r) => r.name);
if (!prodCols.includes("max_stock_level")) {
  console.error("FAIL: 0009 products.max_stock_level column missing");
  process.exit(1);
}
const movCols = db
  .prepare("SELECT name FROM pragma_table_info('stock_movements')")
  .all()
  .map((r) => r.name);
if (!movCols.includes("reference")) {
  console.error("FAIL: 0009 stock_movements.reference column missing");
  process.exit(1);
}
const movIdx = db
  .prepare(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name IN ('idx_movements_product_created','idx_movements_type')",
  )
  .get();
if (movIdx.c !== 2) {
  console.error("FAIL: 0009 movement indexes missing");
  process.exit(1);
}
console.log("OK  0009 max stock + movement reference + indexes");

// 0010: retours fournisseurs + numéros/statuts (CHECK contraints)
const retCols = db
  .prepare("SELECT name FROM pragma_table_info('returns')")
  .all()
  .map((r) => r.name);
for (const col of ["return_number", "status", "refund_method"]) {
  if (!retCols.includes(col)) {
    console.error(`FAIL: 0010 returns.${col} column missing`);
    process.exit(1);
  }
}
const sret = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('supplier_returns','supplier_return_items')",
  )
  .all();
if (sret.length !== 2) {
  console.error("FAIL: 0010 supplier_returns tables missing");
  process.exit(1);
}
console.log("OK  0010 supplier returns tables + return columns");
let badStatusRejected = false;
try {
  db.prepare(
    "INSERT INTO returns (uuid, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('rbad',1,'FAC-X',100,'pending','2026-01-01','2026-01-01')",
  ).run();
} catch {
  badStatusRejected = true;
}
if (!badStatusRejected) {
  console.error("FAIL: invalid return status accepted");
  process.exit(1);
}
console.log("OK  return status CHECK enforced");

// 0011: fiche dépense enrichie (fournisseur, moyen, statut)
const expCols = db
  .prepare("SELECT name FROM pragma_table_info('expenses')")
  .all()
  .map((r) => r.name);
for (const col of ["supplier_id", "payment_method", "status", "reference", "notes"]) {
  if (!expCols.includes(col)) {
    console.error(`FAIL: 0011 expenses.${col} column missing`);
    process.exit(1);
  }
}
console.log("OK  0011 expense file columns present");
let badExpenseRejected = false;
try {
  db.prepare(
    "INSERT INTO expenses (uuid, description, category, amount_minor, expense_date, status, created_at, updated_at) VALUES ('ebad','X','Y',100,'2026-01-01','draft','2026-01-01','2026-01-01')",
  ).run();
} catch {
  badExpenseRejected = true;
}
if (!badExpenseRejected) {
  console.error("FAIL: invalid expense status accepted");
  process.exit(1);
}
console.log("OK  expense status CHECK enforced");

// 0012: pain enrichi + conditions proforma + historique zakat
const breadCols = db
  .prepare("SELECT name FROM pragma_table_info('bread_orders')")
  .all()
  .map((r) => r.name);
for (const col of ["bread_type", "custom_phone", "payment_method", "order_status"]) {
  if (!breadCols.includes(col)) {
    console.error(`FAIL: 0012 bread_orders.${col} column missing`);
    process.exit(1);
  }
}
console.log("OK  0012 bread order columns present");
const proCols = db
  .prepare("SELECT name FROM pragma_table_info('proforma_invoices')")
  .all()
  .map((r) => r.name);
if (!proCols.includes("terms")) {
  console.error("FAIL: 0012 proforma_invoices.terms column missing");
  process.exit(1);
}
const zak = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'zakat_calculations'")
  .get();
if (!zak) {
  console.error("FAIL: 0012 zakat_calculations table missing");
  process.exit(1);
}
console.log("OK  0012 proforma terms + zakat history");

// 0013: nom commercial société
const coCols = db
  .prepare("SELECT name FROM pragma_table_info('company_profile')")
  .all()
  .map((r) => r.name);
if (!coCols.includes("commercial_name")) {
  console.error("FAIL: 0013 company_profile.commercial_name column missing");
  process.exit(1);
}
console.log("OK  0013 company commercial name");

// 0014: index retours (2).
for (const idx of ["idx_return_items_return", "idx_supplier_return_items_return"]) {
  const found = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(idx);
  if (!found) {
    console.error(`FAIL: 0014 index ${idx} missing`);
    process.exit(1);
  }
}
console.log("OK  0014 return items indexes");

// 0015: jonction produits↔fournisseurs + reprise.
const psTable = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_suppliers'")
  .get();
if (!psTable) {
  console.error("FAIL: 0015 product_suppliers table missing");
  process.exit(1);
}
const psIdx = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_product_suppliers_supplier'",
  )
  .get();
if (!psIdx) {
  console.error("FAIL: 0015 idx_product_suppliers_supplier index missing");
  process.exit(1);
}
console.log("OK  0015 product_suppliers + index");

// 0016: pain récurrent + nom commande.
const breadCols16 = db
  .prepare("SELECT name FROM pragma_table_info('bread_orders')")
  .all()
  .map((r) => r.name);
for (const col of ["order_name", "is_recurring"]) {
  if (!breadCols16.includes(col)) {
    console.error(`FAIL: 0016 bread_orders.${col} column missing`);
    process.exit(1);
  }
}
const recIdx = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_bread_recurring'")
  .get();
if (!recIdx) {
  console.error("FAIL: 0016 idx_bread_recurring index missing");
  process.exit(1);
}
console.log("OK  0016 bread recurring + order_name");

// 0017: idempotence des réceptions (operation_id unique, NULL historique toléré)
const intakeCols = db
  .prepare("SELECT name FROM pragma_table_info('stock_intakes')")
  .all()
  .map((r) => r.name);
if (!intakeCols.includes("operation_id")) {
  console.error("FAIL: 0017 stock_intakes.operation_id column missing");
  process.exit(1);
}
const opIdx = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_stock_intakes_operation'",
  )
  .get();
if (!opIdx) {
  console.error("FAIL: 0017 idx_stock_intakes_operation index missing");
  process.exit(1);
}
console.log("OK  0017 intake operation_id + unique index");

// 0018: couches FIFO + coût historique (tables, colonne, reprise)
const layerTables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('inventory_layers','sale_fifo_consumption')",
  )
  .all();
if (layerTables.length !== 2) {
  console.error("FAIL: 0018 FIFO tables missing");
  process.exit(1);
}
const itemCols = db
  .prepare("SELECT name FROM pragma_table_info('sale_items')")
  .all()
  .map((r) => r.name);
if (!itemCols.includes("cogs_minor")) {
  console.error("FAIL: 0018 sale_items.cogs_minor column missing");
  process.exit(1);
}
console.log("OK  0018 FIFO tables + sale_items.cogs_minor");
db.prepare(
  "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES ('vfifo','FIFO Test','PIECE',2000,3000,10,0,'in_stock','2026-01-01','2026-01-01')",
).run();
db.prepare(
  "INSERT INTO inventory_layers (uuid, product_id, original_quantity, remaining_quantity, unit_cost_minor, reason, created_at) VALUES ('vl1', (SELECT id FROM products WHERE uuid = 'vfifo'), 10, 7, 2000, 'opening', '2026-01-01')",
).run();
const rem = db
  .prepare(
    "SELECT COALESCE(SUM(remaining_quantity),0) AS q FROM inventory_layers WHERE product_id = (SELECT id FROM products WHERE uuid = 'vfifo')",
  )
  .get();
if (rem.q !== 7) {
  console.error("FAIL: 0018 layer remaining arithmetic wrong");
  process.exit(1);
}
let layerNegRejected = false;
try {
  db.prepare(
    "INSERT INTO inventory_layers (uuid, product_id, original_quantity, remaining_quantity, unit_cost_minor, reason, created_at) VALUES ('vbad', 1, 1, -1, 100, 'intake', '2026-01-01')",
  ).run();
} catch {
  layerNegRejected = true;
}
if (!layerNegRejected) {
  console.error("FAIL: negative layer remaining accepted");
  process.exit(1);
}
console.log("OK  0018 layer arithmetic + CHECK enforced");

// 0019: index de recherche transverses.
for (const idx of [
  "idx_consumption_product",
  "idx_returns_customer",
  "idx_return_items_product",
  "idx_supplier_return_items_product",
  "idx_bread_sale",
  "idx_proformas_converted_sale",
]) {
  const found = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(idx);
  if (!found) {
    console.error(`FAIL: 0019 index ${idx} missing`);
    process.exit(1);
  }
}
console.log("OK  0019 lookup indexes");

// 0021: clés d'idempotence génériques.
const idemTable = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'idempotency_keys'")
  .get();
if (!idemTable) {
  console.error("FAIL: 0021 idempotency_keys table missing");
  process.exit(1);
}
const idemCols = db
  .prepare("SELECT name FROM pragma_table_info('idempotency_keys')")
  .all()
  .map((r) => r.name);
for (const col of ["operation_id", "op_type", "result_json", "created_at"]) {
  if (!idemCols.includes(col)) {
    console.error(`FAIL: 0021 idempotency_keys.${col} column missing`);
    process.exit(1);
  }
}
console.log("OK  0021 idempotency_keys");

// 0020: idempotence des paiements (operation_id unique, NULL historique toléré)
for (const table of ["sale_payments", "supplier_payments"]) {
  const cols = db
    .prepare(`SELECT name FROM pragma_table_info('${table}')`)
    .all()
    .map((r) => r.name);
  if (!cols.includes("operation_id")) {
    console.error(`FAIL: 0020 ${table}.operation_id column missing`);
    process.exit(1);
  }
}
const payIdx = db
  .prepare(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name IN ('idx_sale_payments_operation','idx_supplier_payments_operation')",
  )
  .get();
if (payIdx.c !== 2) {
  console.error("FAIL: 0020 payment operation_id unique indexes missing");
  process.exit(1);
}
// Même operationId rejoué = conflit UNIQUE (le repo relit l'existant) ;
// deux NULL restent acceptés (historique antérieur à 0020).
db.prepare(
  "INSERT INTO supplier_payments (uuid, supplier_id, amount_minor, method, payment_date, operation_id, created_at) VALUES ('op1', 1, 100, 'cash', '2026-01-01', '11111111-1111-4111-8111-111111111111', '2026-01-01')",
).run();
let payDupRejected = false;
try {
  db.prepare(
    "INSERT INTO supplier_payments (uuid, supplier_id, amount_minor, method, payment_date, operation_id, created_at) VALUES ('op2', 1, 100, 'cash', '2026-01-01', '11111111-1111-4111-8111-111111111111', '2026-01-01')",
  ).run();
} catch {
  payDupRejected = true;
}
if (!payDupRejected) {
  console.error("FAIL: duplicate payment operation_id accepted");
  process.exit(1);
}
db.prepare(
  "INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at) VALUES ('pay-null-1', NULL, 1, 50, 'cash', '2026-01-02', '2026-01-02')",
).run();
db.prepare(
  "INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at) VALUES ('pay-null-2', NULL, 1, 50, 'cash', '2026-01-02', '2026-01-02')",
).run();
console.log("OK  0020 payment operation_id + unique index + NULL legacy");

// 0022: idempotence des créations (operation_id unique, NULL historique toléré)
for (const table of ["products", "customers", "suppliers", "expenses"]) {
  const cols = db
    .prepare(`SELECT name FROM pragma_table_info('${table}')`)
    .all()
    .map((r) => r.name);
  if (!cols.includes("operation_id")) {
    console.error(`FAIL: 0022 ${table}.operation_id column missing`);
    process.exit(1);
  }
}
const createIdx = db
  .prepare(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name IN ('idx_products_operation','idx_customers_operation','idx_suppliers_operation','idx_expenses_operation')",
  )
  .get();
if (createIdx.c !== 4) {
  console.error("FAIL: 0022 create operation_id unique indexes missing");
  process.exit(1);
}
// Même operationId rejoué = conflit UNIQUE (le repo relit l'existant).
db.prepare(
  "INSERT INTO expenses (uuid, operation_id, description, category, amount_minor, expense_date, status, created_at, updated_at) VALUES ('exop1', '22222222-2222-4222-8222-222222222222', 'Loyer', 'Loyer', 50000, '2026-01-05', 'pending', '2026-01-05', '2026-01-05')",
).run();
let createDupRejected = false;
try {
  db.prepare(
    "INSERT INTO expenses (uuid, operation_id, description, category, amount_minor, expense_date, status, created_at, updated_at) VALUES ('exop2', '22222222-2222-4222-8222-222222222222', 'Loyer', 'Loyer', 50000, '2026-01-05', 'pending', '2026-01-05', '2026-01-05')",
  ).run();
} catch {
  createDupRejected = true;
}
if (!createDupRejected) {
  console.error("FAIL: duplicate create operation_id accepted");
  process.exit(1);
}
// Lignes historiques sans operation_id (NULL) : créations multiples acceptées.
// 0023: code requis à l'INSERT (fourni ici ; NULL legacy pré-0008 préservés).
db.prepare(
  "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('sup-null-1', 'Legacy A', 'FOU-90001', '2026-01-01', '2026-01-01')",
).run();
db.prepare(
  "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('sup-null-2', 'Legacy B', 'FOU-90002', '2026-01-01', '2026-01-01')",
).run();
console.log("OK  0022 create operation_id + unique index + NULL legacy");

// 0023 invariants racine : 8 triggers créés, dont 2 abandonnés par 0024
// (numérotation pré-allouée — voir 0024). Ici : les 6 restants présents.
const trg23 = db
  .prepare(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name IN ('trg_sales_credit_allowed_update','trg_layers_remaining_insert','trg_layers_remaining_update','trg_customers_outstanding_nonneg','trg_suppliers_outstanding_nonneg','trg_returns_number_required','trg_supplier_returns_number_required','trg_suppliers_code_required')",
  )
  .get();
if (trg23.c !== 6) {
  console.error(`FAIL: 0023 root triggers missing (found ${trg23.c}/6 kept)`);
  process.exit(1);
}
console.log("OK  0023 root triggers kept (6/8, 2 dropped by 0024)");
const scol23 = db
  .prepare("SELECT name FROM pragma_table_info('supplier_returns')")
  .all()
  .map((r) => r.name);
if (!scol23.includes("layers_json")) {
  console.error("FAIL: 0023 supplier_returns.layers_json missing");
  process.exit(1);
}
console.log("OK  0023 supplier_returns.layers_json");

// 0024: séquences de retours + abandon des triggers BEFORE INSERT.
for (const key of ["return_customer", "return_supplier"]) {
  const row = db
    .prepare("SELECT prefix, next_value FROM number_sequences WHERE sequence_key = ?")
    .get(key);
  if (!row || row.next_value < 1) {
    console.error(`FAIL: 0024 number_sequences.${key} missing`);
    process.exit(1);
  }
}
console.log("OK  0024 return sequences seeded");
for (const trg of ["trg_returns_number_required", "trg_supplier_returns_number_required"]) {
  const gone = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?")
    .get(trg);
  if (gone) {
    console.error(`FAIL: 0024 trigger ${trg} still present`);
    process.exit(1);
  }
}
console.log("OK  0024 impossible BEFORE INSERT triggers dropped");
// Numérotation pré-allouée : INSERT direct avec numéro (plus de UPDATE post-INSERT).
db.prepare(
  "INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('r24','RET-C-00001',1,'FAC-2026-00001',100,'validated','2026-01-02','2026-01-02')",
).run();
console.log("OK  0024 pre-allocated return_number accepted");

// 0025 H-2: return_number MUST NEVER BE NULL (schema NOT NULL + triggers).
for (const table of ["returns", "supplier_returns"]) {
  const info = db.prepare(`SELECT name, [notnull] AS nn FROM pragma_table_info('${table}')`).all();
  const col = info.find((r) => r.name === "return_number");
  if (!col || col.nn !== 1) {
    console.error(`FAIL: 0025 ${table}.return_number is not NOT NULL`);
    process.exit(1);
  }
}
console.log("OK  0025 return_number NOT NULL (both tables)");
const trg25 = db
  .prepare(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name IN ('trg_returns_number_notnull_ins','trg_returns_number_notnull_upd','trg_supplier_returns_number_notnull_ins','trg_supplier_returns_number_notnull_upd')",
  )
  .get();
if (trg25.c !== 4) {
  console.error(`FAIL: 0025 NULL-rejection triggers missing (found ${trg25.c}/4)`);
  process.exit(1);
}
console.log("OK  0025 NULL-rejection triggers present (4/4)");
// NULL must be rejected on INSERT (schema) for both tables.
let nullInsRejected = false;
try {
  db.prepare(
    "INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('r25-null','__NULL__',1,'FAC-2026-00001',10,'validated','2026-01-03','2026-01-03')",
  ).run();
  db.prepare("UPDATE returns SET return_number = NULL WHERE uuid = 'r25-null'").run();
} catch {
  nullInsRejected = true;
}
if (db.prepare("SELECT uuid FROM returns WHERE uuid = 'r25-null'").get()) {
  db.prepare("DELETE FROM returns WHERE uuid = 'r25-null'").run();
}
let nullInsRejected2 = false;
try {
  db.prepare(
    "INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('r25-null2',NULL,1,'FAC-2026-00001',10,'validated','2026-01-03','2026-01-03')",
  ).run();
} catch {
  nullInsRejected2 = true;
}
if (db.prepare("SELECT uuid FROM returns WHERE uuid = 'r25-null2'").get()) {
  db.prepare("DELETE FROM returns WHERE uuid = 'r25-null2'").run();
}
if (!nullInsRejected || !nullInsRejected2) {
  console.error("FAIL: 0025 NULL return_number accepted (INSERT or UPDATE)");
  process.exit(1);
}
console.log("OK  0025 NULL return_number rejected (INSERT + UPDATE)");
// Duplicate must be rejected (UNIQUE preserved after rebuild).
let ret25DupRejected = false;
try {
  db.prepare(
    "INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('r25-dup','RET-C-00001',1,'FAC-2026-00001',10,'validated','2026-01-03','2026-01-03')",
  ).run();
} catch {
  ret25DupRejected = true;
}
if (!ret25DupRejected) {
  console.error("FAIL: 0025 duplicate return_number accepted");
  process.exit(1);
}
console.log("OK  0025 duplicate return_number rejected (UNIQUE preserved)");
// Data preservation: r24 row + sequences intact.
const r24 = db.prepare("SELECT return_number FROM returns WHERE uuid = 'r24'").get();
if (!r24 || r24.return_number !== "RET-C-00001") {
  console.error("FAIL: 0025 data loss (r24 row)");
  process.exit(1);
}
console.log("OK  0025 data preserved + sequences intact");

// 0026 M-4: defensive INSERT triggers (direct-SQL bypass closed).
const trg26 = db
  .prepare(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name IN ('trg_sales_no_negative_total_ins','trg_customers_outstanding_nonneg_ins','trg_suppliers_outstanding_nonneg_ins','trg_customers_credit_revoke_guard')",
  )
  .get();
if (trg26.c !== 4) {
  console.error(`FAIL: 0026 defensive triggers missing (found ${trg26.c}/4)`);
  process.exit(1);
}
console.log("OK  0026 defensive triggers present (4/4)");
// INSERT with total<0 must fail at DB level (was UPDATE-only before 0026).
let negInsRejected = false;
try {
  db.prepare(
    "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('neg26','FAC-NEG-26',100,-5,0,-5,'unpaid','2026-01-04','2026-01-04')",
  ).run();
} catch {
  negInsRejected = true;
}
if (!negInsRejected) {
  console.error("FAIL: 0026 negative-total INSERT accepted");
  process.exit(1);
}
console.log("OK  0026 negative-total INSERT rejected");
// INSERT with negative outstanding must fail at DB level.
let negCustRejected = false;
try {
  db.prepare(
    "INSERT INTO customers (uuid, first_name, last_name, search_name, outstanding_balance_minor, created_at, updated_at) VALUES ('negc26','Neg','Atif','neg atif',-10,'2026-01-04','2026-01-04')",
  ).run();
} catch {
  negCustRejected = true;
}
if (!negCustRejected) {
  console.error("FAIL: 0026 negative-outstanding customer INSERT accepted");
  process.exit(1);
}
console.log("OK  0026 negative-outstanding INSERT rejected");
// M-5: credit revocation refused while debt outstanding...
db.prepare(
  "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, outstanding_balance_minor, created_at, updated_at) VALUES ('cred26','Cred','It','cred it',1,500,'2026-01-04','2026-01-04')",
).run();
let revokeRejected = false;
try {
  db.prepare("UPDATE customers SET credit_allowed = 0 WHERE uuid = 'cred26'").run();
} catch {
  revokeRejected = true;
}
if (!revokeRejected) {
  console.error("FAIL: 0026 credit revocation with outstanding debt accepted");
  process.exit(1);
}
// ...but allowed once settled, and paying existing debt is never blocked.
db.prepare("UPDATE customers SET outstanding_balance_minor = 0 WHERE uuid = 'cred26'").run();
db.prepare("UPDATE customers SET credit_allowed = 0 WHERE uuid = 'cred26'").run();
console.log("OK  0026 credit-revocation policy (refused with debt, allowed when settled)");

// 0027: prix d'origine + remise par ligne (colonnes + backfill).
{
  const cols = db
    .prepare("SELECT name FROM pragma_table_info('sale_items')")
    .all()
    .map((r) => r.name);
  for (const col of ["original_unit_price_minor", "discount_minor"]) {
    if (!cols.includes(col)) {
      console.error(`FAIL: 0027 sale_items.${col} column missing`);
      process.exit(1);
    }
  }
  console.log("OK  0027 sale item line prices (original + discount)");
}

// 0028: index retours restauré après rebuild 0025.
{
  const found = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get("idx_returns_original_sale");
  if (!found) {
    console.error("FAIL: 0028 idx_returns_original_sale index missing");
    process.exit(1);
  }
  console.log("OK  0028 restored returns sale index");
}

// 0029: bons de commande fournisseurs (tables + séquence CMD).
{
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('purchase_orders','purchase_order_items')",
    )
    .all();
  if (tables.length !== 2) {
    console.error("FAIL: 0029 purchase_orders tables missing");
    process.exit(1);
  }
  const seq = db
    .prepare("SELECT prefix FROM number_sequences WHERE sequence_key = 'purchase_order'")
    .get();
  if (!seq) {
    console.error("FAIL: 0029 purchase_order sequence missing");
    process.exit(1);
  }
  console.log("OK  0029 purchase orders + CMD sequence");
}

// 0030: brouillons paniers (table, jamais LocalStorage).
{
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cart_drafts'")
    .get();
  if (!table) {
    console.error("FAIL: 0030 cart_drafts table missing");
    process.exit(1);
  }
  console.log("OK  0030 cart drafts table");
}

// 0031 RADICAL: triggers défensifs remises (discount >= 0, origine >= 0, borne).
{
  const trg = db
    .prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name IN ('trg_sale_items_discount_nonneg_ins','trg_sale_items_discount_nonneg_upd','trg_sale_items_original_nonneg_ins','trg_sale_items_original_nonneg_upd','trg_sale_items_discount_bound_ins','trg_sale_items_discount_bound_upd')",
    )
    .get();
  if (trg.c !== 6) {
    console.error(`FAIL: 0031 discount defensive triggers missing (found ${trg.c}/6)`);
    process.exit(1);
  }
  console.log("OK  0031 discount defensive triggers (6/6)");
  // Remise négative refusée au niveau DB (était acceptée avant 0031).
  // Vente comptant soldée (pas de crédit → trigger 0007 OK sans client).
  db.prepare(
    "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('neg31','FAC-NEG-31',100,100,100,0,'paid','2026-01-05','2026-01-05')",
  ).run();
  const saleId = db.prepare("SELECT id FROM sales WHERE uuid = 'neg31'").get().id;
  let negDiscountRejected = false;
  try {
    db.prepare(
      "INSERT INTO sale_items (sale_id, product_name_snapshot, unit_code, unit_price_minor, purchase_price_minor, quantity, line_total_minor, original_unit_price_minor, discount_minor) VALUES (?, 'Test', 'PIECE', 100, 50, 1, 100, 100, -5)",
    ).run(saleId);
  } catch {
    negDiscountRejected = true;
  }
  if (!negDiscountRejected) {
    console.error("FAIL: 0031 negative discount accepted");
    process.exit(1);
  }
  let overDiscountRejected = false;
  try {
    db.prepare(
      "INSERT INTO sale_items (sale_id, product_name_snapshot, unit_code, unit_price_minor, purchase_price_minor, quantity, line_total_minor, original_unit_price_minor, discount_minor) VALUES (?, 'Test', 'PIECE', 0, 50, 1, 0, 100, 200)",
    ).run(saleId);
  } catch {
    overDiscountRejected = true;
  }
  if (!overDiscountRejected) {
    console.error("FAIL: 0031 over-discount accepted");
    process.exit(1);
  }
  // Ligne saine acceptée.
  db.prepare(
    "INSERT INTO sale_items (sale_id, product_name_snapshot, unit_code, unit_price_minor, purchase_price_minor, quantity, line_total_minor, original_unit_price_minor, discount_minor) VALUES (?, 'Test', 'PIECE', 80, 50, 2, 160, 100, 40)",
  ).run(saleId);
  console.log("OK  0031 discount bounds enforced (negative/over rejected, sane accepted)");
}

// 0032: accès clients APK + file miroir (3 tables + CHECKs).
{
  const tables = db
    .prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name IN ('customer_access','sync_outbox','announcements')",
    )
    .get();
  if (tables.c !== 3) {
    console.error(`FAIL: 0032 tables missing (found ${tables.c}/3)`);
    process.exit(1);
  }
  // kind hors union déclarée = refus DB (miroir jetable : aucun autre canal).
  let badKindRejected = false;
  try {
    db.prepare(
      "INSERT INTO sync_outbox (operation_id, kind, payload_json, created_at) VALUES ('op-bad','teleportation','{}','2026-01-01')",
    ).run();
  } catch {
    badKindRejected = true;
  }
  if (!badKindRejected) {
    console.error("FAIL: 0032 invalid outbox kind accepted");
    process.exit(1);
  }
  // PIN n'est jamais stocké : seuls des condensats + compteurs bornés.
  let negAttemptsRejected = false;
  try {
    db.prepare(
      "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, failed_attempts, created_at, updated_at) VALUES (1,'h1','p1',-1,'2026-01-01','2026-01-01')",
    ).run();
  } catch {
    negAttemptsRejected = true;
  }
  if (!negAttemptsRejected) {
    console.error("FAIL: 0032 negative failed_attempts accepted");
    process.exit(1);
  }
  // Annonce > 120 caractères refusée (limite 0032).
  let longAnnouncementRejected = false;
  try {
    db.prepare(
      "INSERT INTO announcements (text, is_active, created_at) VALUES (?, 1, '2026-01-01')",
    ).run("x".repeat(121));
  } catch {
    longAnnouncementRejected = true;
  }
  if (!longAnnouncementRejected) {
    console.error("FAIL: 0032 over-long announcement accepted");
    process.exit(1);
  }
  console.log("OK  0032 customer_access + sync_outbox + announcements (CHECKs enforced)");
}

// 0033: rattachement client de la file miroir (colonne + index).
{
  const col = db.prepare("PRAGMA table_info(sync_outbox)").all();
  if (!col.some((c) => c.name === "customer_id")) {
    console.error("FAIL: 0033 sync_outbox.customer_id missing");
    process.exit(1);
  }
  const idx = db
    .prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='index' AND name='idx_sync_outbox_customer_status'",
    )
    .get();
  if (idx.c !== 1) {
    console.error("FAIL: 0033 idx_sync_outbox_customer_status missing");
    process.exit(1);
  }
  console.log("OK  0033 sync_outbox.customer_id + customer/status index");
}

// 0034: un seul accès ACTIF par numéro (index UNIQUE partiel + réparation).
{
  const idx = db
    .prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='index' AND name='idx_customer_access_phone_hash_active'",
    )
    .get();
  if (idx.c !== 1) {
    console.error("FAIL: 0034 idx_customer_access_phone_hash_active missing");
    process.exit(1);
  }
  // Deux actifs sur le même condensat = refus DB (l'activation bloque déjà
  // à la source ; ici c'est le garde schéma contre toute autre voie).
  db.prepare(
    "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('phA','A','A','a a','2026-01-01','2026-01-01')",
  ).run();
  db.prepare(
    "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('phB','B','B','b b','2026-01-01','2026-01-01')",
  ).run();
  const idA = db.prepare("SELECT id FROM customers WHERE uuid = 'phA'").get().id;
  const idB = db.prepare("SELECT id FROM customers WHERE uuid = 'phB'").get().id;
  db.prepare(
    "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, created_at, updated_at) VALUES (?, 'dup-hash', 'p1', '2026-01-01', '2026-01-01')",
  ).run(idA);
  let dupRejected = false;
  try {
    db.prepare(
      "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, created_at, updated_at) VALUES (?, 'dup-hash', 'p2', '2026-01-02', '2026-01-02')",
    ).run(idB);
  } catch {
    dupRejected = true;
  }
  if (!dupRejected) {
    console.error("FAIL: 0034 duplicate active phone_hash accepted");
    process.exit(1);
  }
  // Révoquée : son phone_hash reste tracé mais ne bloque plus un autre client.
  db.prepare(
    "UPDATE customer_access SET revoked_at = '2026-01-03', updated_at = '2026-01-03' WHERE customer_id = ?",
  ).run(idA);
  db.prepare(
    "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, created_at, updated_at) VALUES (?, 'dup-hash', 'p2', '2026-01-04', '2026-01-04')",
  ).run(idB);
  console.log("OK  0034 active phone_hash unique (revoked keeps tracing, no block)");
}

// 0035: identité fiscale complète (NIS + article, NULLables, compat ascendante).
{
  const cols = db
    .prepare("PRAGMA table_info(company_profile)")
    .all()
    .map((c) => c.name);
  for (const col of ["nis", "article_imposition"]) {
    if (!cols.includes(col)) {
      console.error(`FAIL: 0035 company_profile.${col} missing`);
      process.exit(1);
    }
  }
  db.prepare(
    "INSERT INTO company_profile (id, uuid, company_name, nis, article_imposition, created_at, updated_at) VALUES (1, 'v35', 'SARL Test', '123456789012345', 'ART-1', '2026-01-01', '2026-01-01')",
  ).run();
  const row = db.prepare("SELECT nis, article_imposition FROM company_profile WHERE id = 1").get();
  if (row.nis !== "123456789012345" || row.article_imposition !== "ART-1") {
    console.error("FAIL: 0035 nis/article_imposition not writable");
    process.exit(1);
  }
  console.log("OK  0035 company_profile.nis + article_imposition (nullable)");
}

// 0036: Print Studio (7 modèles d'usine, un actif par type, unicités).
{
  const rows = db
    .prepare("SELECT doc_type, name, is_factory, is_active FROM print_templates")
    .all();
  if (rows.length !== 7) {
    console.error(`FAIL: 0036 seed compte ${rows.length}, attendu 7`);
    process.exit(1);
  }
  const types = new Set(rows.map((r) => r.doc_type));
  for (const t of [
    "facture",
    "ticket",
    "proforma",
    "bon_livraison",
    "recu",
    "avoir",
    "etiquette",
  ]) {
    if (!types.has(t)) {
      console.error(`FAIL: 0036 seed sans type ${t}`);
      process.exit(1);
    }
  }
  for (const r of rows) {
    if (r.name !== "Défaut" || r.is_factory !== 1 || r.is_active !== 1) {
      console.error("FAIL: 0036 seed non conforme (Défaut/usine/actif)");
      process.exit(1);
    }
  }
  let dupActive = false;
  try {
    db.prepare(
      "INSERT INTO print_templates (doc_type, name, is_active, created_at, updated_at) VALUES ('ticket', 'X', 1, '2026-01-01', '2026-01-01')",
    ).run();
  } catch {
    dupActive = true;
  }
  if (!dupActive) {
    console.error("FAIL: 0036 double actif accepté");
    process.exit(1);
  }
  console.log("OK  0036 print_templates (seed 7 usines actives, unicités)");
}

// 0037: garde-fou quantité produit non-négative (triggers FR, rejet négatif).
{
  const trg37 = db
    .prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name IN ('trg_products_quantity_nonneg_ins','trg_products_quantity_nonneg_upd')",
    )
    .get();
  if (trg37.c !== 2) {
    console.error(`FAIL: 0037 quantity guards missing (found ${trg37.c}/2)`);
    process.exit(1);
  }
  db.prepare(
    "INSERT INTO categories (uuid, name, created_at, updated_at) VALUES ('c37','Garde37','2026-01-01','2026-01-01')",
  ).run();
  const cat37 = db.prepare("SELECT id FROM categories WHERE uuid = 'c37'").get().id;
  let negRefused = false;
  let negMsg = "";
  try {
    db.prepare(
      "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, category_id, created_at, updated_at) VALUES ('p37neg','GardeNeg','PIECE',0,100,-1,0,'in_stock',?,'2026-01-01','2026-01-01')",
    ).run(cat37);
  } catch (e) {
    negRefused = true;
    negMsg = String(e.message);
  }
  if (!negRefused || !/Quantité produit invalide/.test(negMsg)) {
    console.error("FAIL: 0037 negative quantity accepted or not FR");
    process.exit(1);
  }
  console.log("OK  0037 products.quantity triggers FR (2/2, rejet négatif)");
}

// 0038: customer_access + sync_outbox en RESTRICT (jamais de disparition silencieuse).
{
  const ca = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'customer_access'")
    .get();
  const so = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sync_outbox'")
    .get();
  if (!ca.sql.includes("ON DELETE RESTRICT") || /ON DELETE CASCADE/.test(ca.sql)) {
    console.error("FAIL: 0038 customer_access without RESTRICT (or still CASCADE)");
    process.exit(1);
  }
  if (!so.sql.includes("ON DELETE RESTRICT") || /ON DELETE CASCADE/.test(so.sql)) {
    console.error("FAIL: 0038 sync_outbox without RESTRICT (or still CASCADE)");
    process.exit(1);
  }
  db.prepare(
    "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('c38','Garde','R38','garde r38','2026-01-01','2026-01-01')",
  ).run();
  const cust38 = db.prepare("SELECT id FROM customers WHERE uuid = 'c38'").get().id;
  db.prepare(
    "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, created_at, updated_at) VALUES (?, 'h38', 'p38', '2026-01-01', '2026-01-01')",
  ).run(cust38);
  db.prepare(
    "INSERT INTO sync_outbox (operation_id, kind, payload_json, status, created_at, customer_id) VALUES ('op38','access_revocation','{}','pending','2026-01-01',?)",
  ).run(cust38);
  let custRefused = false;
  try {
    db.prepare("DELETE FROM customers WHERE id = ?").run(cust38);
  } catch {
    custRefused = true;
  }
  if (!custRefused) {
    console.error("FAIL: 0038 customer with access/outbox deleted (RESTRICT missing)");
    process.exit(1);
  }
  console.log("OK  0038 customer_access + sync_outbox RESTRICT (rebuild, refus suppression)");
}

// 0039: condensat PIN lent (sel par client, transitoire SHA-256).
{
  const cols = db
    .prepare("PRAGMA table_info(customer_access)")
    .all()
    .map((c) => c.name);
  for (const col of ["pin_salt", "pin_algo"]) {
    if (!cols.includes(col)) {
      console.error(`FAIL: 0039 customer_access.${col} missing`);
      process.exit(1);
    }
  }
  // Ligne historique (sans sel) inscriptible ; ligne neuve avec sel aussi.
  db.prepare(
    "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('kdfA','Kdf','A','kdf a','2026-01-01','2026-01-01')",
  ).run();
  db.prepare(
    "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('kdfB','Kdf','B','kdf b','2026-01-01','2026-01-01')",
  ).run();
  const kdfA = db.prepare("SELECT id FROM customers WHERE uuid = 'kdfA'").get().id;
  const kdfB = db.prepare("SELECT id FROM customers WHERE uuid = 'kdfB'").get().id;
  db.prepare(
    "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, created_at, updated_at) VALUES (?, 'h39', 'p39', '2026-01-01', '2026-01-01')",
  ).run(kdfA);
  db.prepare(
    "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, pin_salt, pin_algo, created_at, updated_at) VALUES (?, 'h39b', 'k39', 'ab', 'pbkdf2-sha256-100k', '2026-01-01', '2026-01-01')",
  ).run(kdfB);
  console.log("OK  0039 customer_access.pin_salt + pin_algo (legacy + KDF rows)");
}

// 0040: ON DELETE RESTRICT explicite (rebuild) + gardes BEFORE DELETE.
{
  const exp = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'expenses'")
    .get();
  if (!exp.sql.includes("ON DELETE RESTRICT")) {
    console.error("FAIL: 0040 expenses FK without explicit RESTRICT");
    process.exit(1);
  }
  const conso = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sale_fifo_consumption'",
    )
    .get();
  const restrictCount = (conso.sql.match(/ON DELETE RESTRICT/g) || []).length;
  if (restrictCount !== 4) {
    console.error(`FAIL: 0040 sale_fifo_consumption has ${restrictCount}/4 RESTRICT`);
    process.exit(1);
  }
  const trg40 = db
    .prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name IN ('trg_categories_no_delete_with_products','trg_suppliers_no_delete_with_products','trg_customers_no_delete_with_sales','trg_products_no_delete_with_items','trg_products_no_delete_with_layers','trg_stock_intakes_no_delete_with_layers','trg_stock_intake_items_no_delete_with_layers')",
    )
    .get();
  if (trg40.c !== 7) {
    console.error(`FAIL: 0040 parent guards missing (found ${trg40.c}/7)`);
    process.exit(1);
  }
  // Rebuild réel (clause) : fournisseur avec dépense = refus.
  db.prepare(
    "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('r40','Garde R','FOU-40001','2026-01-01','2026-01-01')",
  ).run();
  const sup40 = db.prepare("SELECT id FROM suppliers WHERE uuid = 'r40'").get().id;
  db.prepare(
    "INSERT INTO expenses (uuid, description, category, amount_minor, expense_date, status, supplier_id, created_at, updated_at) VALUES ('e40','Garde','Autre',100,'2026-01-01','paid',?,'2026-01-01','2026-01-01')",
  ).run(sup40);
  let supRefused = false;
  try {
    db.prepare("DELETE FROM suppliers WHERE id = ?").run(sup40);
  } catch {
    supRefused = true;
  }
  if (!supRefused) {
    console.error("FAIL: 0040 supplier with expense deleted (RESTRICT missing)");
    process.exit(1);
  }
  // Garde parent (trigger FR) : catégorie avec produit = refus explicite.
  db.prepare(
    "INSERT INTO categories (uuid, name, created_at, updated_at) VALUES ('c40','Garde','2026-01-01','2026-01-01')",
  ).run();
  const cat40 = db.prepare("SELECT id FROM categories WHERE uuid = 'c40'").get().id;
  db.prepare(
    "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, category_id, created_at, updated_at) VALUES ('p40','Garde','PIECE',0,100,1,0,'in_stock',?,'2026-01-01','2026-01-01')",
  ).run(cat40);
  let catRefused = false;
  let catMsg = "";
  try {
    db.prepare("DELETE FROM categories WHERE id = ?").run(cat40);
  } catch (e) {
    catRefused = true;
    catMsg = String(e.message);
  }
  if (!catRefused || !/Suppression impossible/.test(catMsg)) {
    console.error("FAIL: 0040 category guard missing or not FR");
    process.exit(1);
  }
  console.log("OK  0040 explicit RESTRICT (rebuild) + parent guards FR (7/7)");
}

// 0041: rôles internes gérant / utilisateur (tables + gardes FR).
{
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('staff_users','staff_user_permissions')",
    )
    .all()
    .map((r) => r.name);
  if (!tables.includes("staff_users") || !tables.includes("staff_user_permissions")) {
    console.error("FAIL: 0041 staff tables missing");
    process.exit(1);
  }
  const trg41 = db
    .prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name IN ('trg_staff_no_delete_last_manager','trg_staff_no_demise_last_manager')",
    )
    .get();
  if (trg41.c !== 2) {
    console.error(`FAIL: 0041 staff guards missing (found ${trg41.c}/2)`);
    process.exit(1);
  }
  // Garde dernier gérant : suppression refusée en FR.
  db.prepare(
    "INSERT INTO staff_users (uuid, username, display_name, role, code_hash, code_salt, code_algo, must_change_code, is_active, failed_attempts, created_at, updated_at) VALUES ('v41','Gérant Unique','Gérant','manager','h','s','pbkdf2-sha256-100k',0,1,0,'2026-01-01','2026-01-01')",
  ).run();
  let mgrRefused = false;
  let mgrMsg = "";
  try {
    db.prepare("DELETE FROM staff_users WHERE uuid = 'v41'").run();
  } catch (e) {
    mgrRefused = true;
    mgrMsg = String(e.message);
  }
  if (!mgrRefused || !/gérant actif/.test(mgrMsg)) {
    console.error("FAIL: 0041 last-manager guard missing or not FR");
    process.exit(1);
  }
  console.log("OK  0041 staff_roles (tables + gardes FR 2/2)");
}

// 0042: code de secours gérant (singleton id=1).
{
  const rec = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'staff_recovery'")
    .get();
  if (!rec || !/CHECK \(id = 1\)/.test(rec.sql)) {
    console.error("FAIL: 0042 staff_recovery singleton missing");
    process.exit(1);
  }
  db.prepare(
    "INSERT INTO staff_recovery (id, code_hash, code_salt, code_algo, failed_attempts, created_at, updated_at) VALUES (1,'h','s','pbkdf2-sha256-100k',0,'2026-01-01','2026-01-01')",
  ).run();
  let dupRefused = false;
  try {
    db.prepare(
      "INSERT INTO staff_recovery (id, code_hash, code_salt, code_algo, failed_attempts, created_at, updated_at) VALUES (1,'h2','s2','pbkdf2-sha256-100k',0,'2026-01-01','2026-01-01')",
    ).run();
  } catch {
    dupRefused = true;
  }
  if (!dupRefused) {
    console.error("FAIL: 0042 singleton duplicate accepted");
    process.exit(1);
  }
  console.log("OK  0042 staff_recovery (singleton id=1)");
}

// 0043: garde pin_algo (liste blanche sha256 historique + PBKDF2 canonique).
{
  const trg43 = db
    .prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name IN ('trg_customer_access_pin_algo_ins','trg_customer_access_pin_algo_upd')",
    )
    .get();
  if (trg43.c !== 2) {
    console.error(`FAIL: 0043 pin_algo guards missing (found ${trg43.c}/2)`);
    process.exit(1);
  }
  db.prepare(
    "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('kdf43','Kdf','C43','kdf c43','2026-01-01','2026-01-01')",
  ).run();
  const kdf43 = db.prepare("SELECT id FROM customers WHERE uuid = 'kdf43'").get().id;
  let algoRefused = false;
  let algoMsg = "";
  try {
    db.prepare(
      "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, pin_algo, created_at, updated_at) VALUES (?, 'h43', 'p43', 'md5', '2026-01-01', '2026-01-01')",
    ).run(kdf43);
  } catch (e) {
    algoRefused = true;
    algoMsg = String(e.message);
  }
  if (!algoRefused || !/algorithme non pris en charge/.test(algoMsg)) {
    console.error("FAIL: 0043 bad pin_algo accepted or not FR");
    process.exit(1);
  }
  console.log("OK  0043 pin_algo whitelist FR (2/2, rejet md5)");
}

// 0044: frais de livraison par brouillon (colonne + CHECK + défaut 0).
{
  const col44 = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cart_drafts'")
    .get();
  if (!col44 || !/delivery_fee_minor INTEGER NOT NULL DEFAULT 0/i.test(col44.sql)) {
    console.error("FAIL: 0044 cart_drafts.delivery_fee_minor missing");
    process.exit(1);
  }
  let negRefused = false;
  try {
    db.prepare(
      "INSERT INTO cart_drafts (tab_id, name, lines_json, delivery_fee_minor, updated_at) VALUES (1, 'T', '[]', -5, '2026-01-01')",
    ).run();
  } catch {
    negRefused = true;
  }
  if (!negRefused) {
    console.error("FAIL: 0044 negative delivery_fee accepted");
    process.exit(1);
  }
  db.prepare(
    "INSERT INTO cart_drafts (tab_id, name, lines_json, updated_at) VALUES (2, 'T', '[]', '2026-01-01')",
  ).run();
  const dflt = db.prepare("SELECT delivery_fee_minor AS v FROM cart_drafts WHERE tab_id = 2").get();
  if (dflt.v !== 0) {
    console.error("FAIL: 0044 delivery_fee default is not 0");
    process.exit(1);
  }
  console.log("OK  0044 cart_drafts.delivery_fee_minor (colonne + CHECK + défaut 0)");
}

// Integrity
const ic = db.prepare("PRAGMA integrity_check").get();
const fk = db.prepare("PRAGMA foreign_key_check").all();
console.log(`OK  integrity_check=${ic.integrity_check} foreign_key_violations=${fk.length}`);
if (ic.integrity_check !== "ok" || fk.length !== 0) process.exit(1);

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log("MIGRATIONS VERIFIED");
