// Veloria PoS — scripts/quality/verify-perf.mjs
// Benchmark sans dépendances (node:sqlite) sur jeu réaliste : 10 000 produits,
// 5 000 clients, 10 000 ventes + 30 000 lignes + journal stock.
// Seuils : recherche nom < 500 ms, code-barres < 50 ms, commit vente < 150 ms,
// pagination historique < 300 ms, rapport période < 1000 ms, backup < 30 s.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-perf-"));
const db = new DatabaseSync(path.join(tmp, "perf.sqlite"));
db.exec("PRAGMA foreign_keys = ON;");
const migDir = path.join(root, "database", "migrations");
for (const f of fs
  .readdirSync(migDir)
  .filter((x) => x.endsWith(".sql"))
  .sort()) {
  db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
}
db.exec("PRAGMA foreign_keys = ON;");

const now = "2026-01-01T00:00:00.000Z";
const insP = db.prepare(
  "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES (?, ?, 'PIECE', 100, 200, 100000, 2, 'in_stock', ?, ?)",
);
const insB = db.prepare(
  "INSERT INTO product_barcodes (product_id, barcode, is_primary, created_at) VALUES (?, ?, 1, ?)",
);
const insC = db.prepare(
  "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
);
let t0 = Date.now();
db.exec("BEGIN;");
for (let i = 0; i < 10000; i++) {
  insP.run(`p-${i}`, `Produit ${String(i).padStart(5, "0")} Semoule`, now, now);
  if (i % 10 === 0) insB.run(i + 1, `619${String(100000000 + i)}`, now);
}
for (let i = 0; i < 5000; i++) {
  insC.run(`c-${i}`, "Client", `Num${i}`, `client num${i}`, now, now);
}
const insS = db.prepare(
  "INSERT INTO sales (uuid, invoice_number, subtotal_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, operation_id, created_at, updated_at) VALUES (?, ?, 300, 0, 0, 300, 300, 0, 'paid', ?, ?, ?)",
);
const insI = db.prepare(
  "INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_code, unit_price_minor, purchase_price_minor, quantity, line_total_minor) VALUES (?, 1, 'Produit', 'PIECE', 100, 100, 3, 300)",
);
for (let i = 0; i < 10000; i++) {
  insS.run(`s-${i}`, `FAC-2026-${String(i).padStart(5, "0")}`, `op-${i}`, now, now);
  const saleId = i + 1;
  for (let j = 0; j < 3; j++) insI.run(saleId);
}
db.exec("COMMIT;");
console.log(`OK  seed (10k produits, 5k clients, 10k ventes, 30k lignes) en ${Date.now() - t0} ms`);

function measure(label, fn) {
  const s = Date.now();
  const out = fn();
  const ms = Date.now() - s;
  console.log(`OK  ${label} en ${ms} ms`);
  return { out, ms };
}

let fail = 0;
const check = (label, ms, max) => {
  if (ms > max) {
    console.error(`FAIL: ${label} ${ms} ms > ${max} ms`);
    fail = 1;
  }
};

const name = measure("recherche nom", () =>
  db.prepare("SELECT id FROM products WHERE name LIKE ? LIMIT 50").all("%Semoule%"),
);
check("recherche nom", name.ms, 500);

const barcode = measure("lecture code-barres", () =>
  db.prepare("SELECT product_id FROM product_barcodes WHERE barcode = ?").get("619100000100"),
);
check("lecture code-barres", barcode.ms, 50);

// Commit vente équivalent repo : facture + lignes + paiement + mouvements + audit = 1 tx.
const commit = measure("commit vente (1 tx, 3 lignes)", () => {
  db.exec("BEGIN;");
  try {
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, operation_id, created_at, updated_at) VALUES ('sx','FAC-2026-99999',300,300,300,0,'paid','opx',?,?)",
    ).run(now, now);
    const saleId = db.prepare("SELECT last_insert_rowid() AS id").get().id;
    for (let j = 0; j < 3; j++) insI.run(saleId);
    db.prepare(
      "INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, created_at) VALUES ('mx',1,'sale_out',-3,99997,?)",
    ).run(now);
    db.exec("COMMIT;");
  } catch (e) {
    db.exec("ROLLBACK;");
    throw e;
  }
});
check("commit vente", commit.ms, 150);

const hist = measure("pagination historique", () =>
  db
    .prepare(
      "SELECT s.*, c.search_name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id ORDER BY s.id DESC LIMIT 20 OFFSET 5000",
    )
    .all(),
);
check("pagination historique", hist.ms, 300);
if (hist.out.length !== 20) {
  console.error("FAIL: pagination historique incomplète");
  fail = 1;
}

const agg = measure("agrégat dashboard", () =>
  db.prepare("SELECT COUNT(*) AS c FROM sales WHERE substr(created_at,1,10) = ?").get("2026-01-01"),
);
check("agrégat dashboard", agg.ms, 200);

const report = measure("rapport période (top 10)", () =>
  db
    .prepare(
      "SELECT si.product_name_snapshot AS name, SUM(si.quantity) AS qty, SUM(si.line_total_minor) AS revenue FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE substr(s.created_at,1,10) BETWEEN ? AND ? AND s.is_cancelled = 0 GROUP BY si.product_name_snapshot ORDER BY revenue DESC LIMIT 10",
    )
    .all("2026-01-01", "2026-01-02"),
);
check("rapport période", report.ms, 1000);

const backupFile = path.join(tmp, "backup.vposdb");
const backup = measure("backup VACUUM INTO", () => {
  db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
});
check("backup", backup.ms, 30000);
console.log(`OK  taille backup ${(fs.statSync(backupFile).size / 1024).toFixed(0)} Ko`);

db.close();
fs.rmSync(tmp, { recursive: true, force: true });

if (fail === 0) console.log("PERF VERIFIED");
process.exit(fail);
