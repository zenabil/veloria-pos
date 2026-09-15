// Veloria PoS — scripts/quality/verify-perf.mjs
// Micro-benchmark sans dépendances (node:sqlite) : 10 000 produits + recherche
// indexée. Seuils : recherche nom < 500 ms, lecture code-barres < 50 ms.
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
  "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES (?, ?, 'PIECE', 100, 200, 10, 2, 'in_stock', ?, ?)",
);
const insB = db.prepare(
  "INSERT INTO product_barcodes (product_id, barcode, is_primary, created_at) VALUES (?, ?, 1, ?)",
);
const t0 = Date.now();
db.exec("BEGIN;");
for (let i = 0; i < 10000; i++) {
  insP.run(`p-${i}`, `Produit ${String(i).padStart(5, "0")} Semoule`, now, now);
  if (i % 10 === 0) insB.run(i + 1, `619${String(100000000 + i)}`, now);
}
db.exec("COMMIT;");
console.log(`OK  seed 10000 produits en ${Date.now() - t0} ms`);

let s = Date.now();
const rows = db.prepare("SELECT id FROM products WHERE name LIKE ? LIMIT 50").all("%Semoule%");
const nameMs = Date.now() - s;
console.log(`OK  recherche nom: ${rows.length} lignes en ${nameMs} ms`);

s = Date.now();
db.prepare("SELECT product_id FROM product_barcodes WHERE barcode = ?").get("619100000100");
const barcodeMs = Date.now() - s;
console.log(`OK  lecture code-barres en ${barcodeMs} ms`);

s = Date.now();
db.prepare("SELECT COUNT(*) AS c FROM sales WHERE substr(created_at,1,10) = ?").get("2026-01-01");
const aggMs = Date.now() - s;
console.log(`OK  agrégat dashboard en ${aggMs} ms`);

db.close();
fs.rmSync(tmp, { recursive: true, force: true });

let fail = 0;
if (nameMs > 500) {
  console.error(`FAIL: recherche nom ${nameMs} ms > 500 ms`);
  fail = 1;
}
if (barcodeMs > 50) {
  console.error(`FAIL: code-barres ${barcodeMs} ms > 50 ms`);
  fail = 1;
}
if (fail === 0) console.log("PERF VERIFIED");
process.exit(fail);
