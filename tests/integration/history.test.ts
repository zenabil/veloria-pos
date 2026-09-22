import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHistoryQuery } from "../../electron/ipc/handlers/history-query.ts";

// L'UNION de l'historique s'exécute sur node:sqlite (même grammaire que
// better-sqlite3) avec des données représentatives.
function openSeeded(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "hist.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  db.exec("PRAGMA foreign_keys = ON;");
  db.prepare(
    "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('c1','Karim','Ziani','karim ziani','2026-09-10T08:00:00.000Z','2026-09-10T08:00:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('f1','Moulin','FOU-00001','2026-09-10T08:00:00.000Z','2026-09-10T08:00:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES ('p1','Farine','KG',4000,5000,10,2,'in_stock','2026-09-10T08:00:00.000Z','2026-09-10T08:00:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('s1','FAC-2026-00001',1,1000,1000,1000,0,'paid','2026-09-12T10:00:00.000Z','2026-09-12T10:00:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at) VALUES ('pay1',1,1,1000,'cash','2026-09-12','2026-09-12T10:05:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO stock_intakes (uuid, supplier_id, invoice_number, invoice_date, subtotal_minor, shipping_cost_minor, total_minor, status, created_at, updated_at) VALUES ('i1',1,'BL-100','2026-09-11',5000,0,5000,'committed','2026-09-11T09:00:00.000Z','2026-09-11T09:00:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, related_entity_type, reason, created_at) VALUES ('m1',1,'intake_in',8,18,'intake','Entrée fournisseur','2026-09-11T09:01:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES ('e1','product.created','product','1','op1','{\"name\":\"Farine\"}','2026-09-10T08:01:00.000Z')",
  ).run();
  return db;
}

function runList(
  db: DatabaseSync,
  over: Partial<Parameters<typeof buildHistoryQuery>[0]> = {},
): Record<string, unknown>[] {
  const q = buildHistoryQuery({
    op: "all",
    from: null,
    to: null,
    query: "",
    sort: "date_desc",
    page: 1,
    pageSize: 100,
    ...over,
  });
  const params = q.params as (string | number)[];
  return db.prepare(q.sql).all(...params) as Record<string, unknown>[];
}

describe("History UNION (seeded)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-hist-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("lists every source in reverse chronological order", () => {
    const db = openSeeded(tmp);
    const rows = runList(db);
    const kinds = rows.map((r) => r["kind"]);
    for (const k of [
      "sale",
      "payment_in",
      "purchase",
      "stock_in",
      "product_create",
      "customer_create",
      "supplier_create",
    ]) {
      expect(kinds.includes(k), k).toBe(true);
    }
    const dates = rows.map((r) => String(r["created_at"]));
    expect([...dates].sort().reverse()).toEqual(dates);
    const sale = rows.find((r) => r["kind"] === "sale") as Record<string, unknown>;
    expect(sale["ref"]).toBe("FAC-2026-00001");
    expect(sale["amount_minor"]).toBe(1000);
    expect(sale["status"]).toBe("Validée");
    const mov = rows.find((r) => r["kind"] === "stock_in") as Record<string, unknown>;
    expect(mov["stock_before"]).toBe(10);
    expect(mov["stock_after"]).toBe(18);
    db.close();
  });

  it("filters by operation, date range and search", () => {
    const db = openSeeded(tmp);
    expect(runList(db, { op: "sale" }).every((r) => r["kind"] === "sale")).toBe(true);
    expect(runList(db, { op: "sale" }).length).toBe(1);
    expect(runList(db, { from: "2026-09-12", to: "2026-09-12" }).length).toBe(2);
    expect(runList(db, { query: "BL-100" }).map((r) => r["kind"])).toEqual(["purchase"]);
    expect(runList(db, { query: "moulin" }).length).toBeGreaterThan(0);
    db.close();
  });
});
