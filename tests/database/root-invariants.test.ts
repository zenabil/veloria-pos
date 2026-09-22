// Veloria PoS — Tests invariants racine (migration 0023, DB-05/DB-06/DB-09/DB-13).
// node:sqlite en mémoire/tmp (pas de toolchain native). Chaque test = Bug ID.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function freshDb(tmp: string, name: string): InstanceType<typeof DatabaseSync> {
  const db = new DatabaseSync(path.join(tmp, name));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  expect(files).toContain("0023_root_invariants.sql");
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL);",
  );
  for (const f of files) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  return db;
}

describe("Invariants racine 0023", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-root-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("DB-05 — crédit refusé sur UPDATE (pas seulement INSERT)", () => {
    const db = freshDb(tmp, "c1.sqlite");
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('c1','A','B','a b',0,'2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u1','FAC-1',1,1000,1000,1000,0,'paid','2026-01-01','2026-01-01')",
    ).run();
    // Comptant OK, passage à crédit sans autorisation refusé.
    expect(() =>
      db.prepare("UPDATE sales SET remaining_balance_minor = 500 WHERE id = 1").run(),
    ).toThrow();
    db.close();
  });

  it("DB-06 — couche FIFO bornée des deux côtés", () => {
    const db = freshDb(tmp, "c2.sqlite");
    db.prepare(
      "INSERT INTO products (uuid, name, created_at, updated_at) VALUES ('p1','Huile','2026-01-01','2026-01-01')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO inventory_layers (uuid, product_id, original_quantity, remaining_quantity, unit_cost_minor, reason, created_at) VALUES ('l1',1,10,11,100,'intake','2026-01-01')",
        )
        .run(),
    ).toThrow();
    db.prepare(
      "INSERT INTO inventory_layers (uuid, product_id, original_quantity, remaining_quantity, unit_cost_minor, reason, created_at) VALUES ('l2',1,10,10,100,'intake','2026-01-01')",
    ).run();
    expect(() =>
      db.prepare("UPDATE inventory_layers SET remaining_quantity = 11 WHERE id = 1").run(),
    ).toThrow();
    expect(() =>
      db.prepare("UPDATE inventory_layers SET remaining_quantity = -1 WHERE id = 1").run(),
    ).toThrow();
    db.close();
  });

  it("DB-13 — soldes tiers jamais négatifs", () => {
    const db = freshDb(tmp, "c3.sqlite");
    try {
      db.prepare(
        "INSERT INTO customers (uuid, first_name, last_name, search_name, outstanding_balance_minor, created_at, updated_at) VALUES ('c1','A','B','a b',100,'2026-01-01','2026-01-01')",
      ).run();
      db.prepare(
        "INSERT INTO suppliers (uuid, name, code, outstanding_balance_minor, created_at, updated_at) VALUES ('s1','Fou','FOU-00001',100,'2026-01-01','2026-01-01')",
      ).run();
      expect(() =>
        db.prepare("UPDATE customers SET outstanding_balance_minor = -1 WHERE id = 1").run(),
      ).toThrow();
      expect(() =>
        db.prepare("UPDATE suppliers SET outstanding_balance_minor = -1 WHERE id = 1").run(),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it("DB-09 — colonne layers_json traçabilité retours fournisseurs", () => {
    const db = freshDb(tmp, "c4.sqlite");
    const cols = db.prepare("PRAGMA table_info(supplier_returns)").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("layers_json");
    db.close();
  });

  it("DB-09b — numéros futurs obligatoires à l'INSERT", () => {
    const db = freshDb(tmp, "c5.sqlite");
    try {
      db.prepare(
        "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('s1','Fou','FOU-00001','2026-01-01','2026-01-01')",
      ).run();
      expect(() =>
        db
          .prepare(
            "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('s2','Bar',NULL,'2026-01-01','2026-01-01')",
          )
          .run(),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it("P0/0024 — séquences de retours + numéros pré-alloués", () => {
    const db = freshDb(tmp, "c6.sqlite");
    try {
      // Séquences amorcées par 0024.
      for (const key of ["return_customer", "return_supplier"]) {
        const row = db
          .prepare("SELECT prefix, next_value FROM number_sequences WHERE sequence_key = ?")
          .get(key) as { prefix: string; next_value: number } | undefined;
        expect(row).toBeDefined();
        if (row) expect(row.next_value).toBeGreaterThanOrEqual(1);
      }
      // INSERT direct avec numéro (workflow repo post-0024) accepté.
      db.prepare(
        "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('c1','A','B','a b',1,'2026-01-01','2026-01-01')",
      ).run();
      db.prepare(
        "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u1','FAC-1',1,1000,1000,1000,0,'paid','2026-01-01','2026-01-01')",
      ).run();
      db.prepare(
        "INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('r1','RET-C-00001',1,'FAC-1',100,'validated','2026-01-02','2026-01-02')",
      ).run();
      // Doublon de numéro rejeté (garantie UNIQUE conservée).
      expect(() =>
        db
          .prepare(
            "INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('r2','RET-C-00001',1,'FAC-1',100,'validated','2026-01-02','2026-01-02')",
          )
          .run(),
      ).toThrow();
    } finally {
      db.close();
    }
  });
});
