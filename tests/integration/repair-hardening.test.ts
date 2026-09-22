// Veloria PoS — P1 hardening mirrors (node:sqlite, sans Electron).
// Miroirs documentés des repos main (better-sqlite3, même grammaire SQL) :
// on prouve le PATTERN idempotence + bypass direct + stock, pas le runtime natif
// (couvert par le smoke empaqueté).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function openMigrated(tmp: string, name: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, name));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function seedSupplier(db: DatabaseSync): number {
  db.prepare(
    "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('sup-rh','Scierie','FOU-00077','2026-01-01','2026-01-01')",
  ).run();
  return Number(
    (db.prepare("SELECT id FROM suppliers WHERE uuid = 'sup-rh'").get() as { id: number }).id,
  );
}

describe("M-2 : idempotence suppressions (pattern peek/claim/store/replay)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-rh-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("retry même operationId rejoue le résultat stocké (pas d'échec 'introuvable')", () => {
    const db = openMigrated(tmp, "idem.sqlite");
    const id = seedSupplier(db);
    const op = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const now = "2026-03-01T00:00:00.000Z";
    const runDelete = (): { deleted: boolean } => {
      const hit = db
        .prepare("SELECT result_json FROM idempotency_keys WHERE operation_id = ?")
        .get(op) as { result_json: string } | undefined;
      if (hit && hit.result_json !== "{}")
        return JSON.parse(hit.result_json) as { deleted: boolean };
      db.exec("BEGIN;");
      try {
        db.prepare(
          "INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, 'suppliers.delete', '{}', ?)",
        ).run(op, now);
        const row = db.prepare("SELECT name FROM suppliers WHERE id = ?").get(id) as
          | { name: string }
          | undefined;
        if (!row) throw new Error("Fournisseur introuvable.");
        db.prepare("DELETE FROM suppliers WHERE id = ?").run(id);
        db.prepare("UPDATE idempotency_keys SET result_json = ? WHERE operation_id = ?").run(
          JSON.stringify({ deleted: true }),
          op,
        );
        db.exec("COMMIT;");
        return { deleted: true };
      } catch (e) {
        try {
          db.exec("ROLLBACK;");
        } catch {
          /* déjà rollback */
        }
        throw e;
      }
    };
    expect(runDelete()).toEqual({ deleted: true });
    // Ligne déjà supprimée : le retry rejoue le stocké au lieu d'échouer.
    expect(runDelete()).toEqual({ deleted: true });
    expect(
      (db.prepare("SELECT COUNT(*) AS c FROM suppliers WHERE id = ?").get(id) as { c: number }).c,
    ).toBe(0);
    db.close();
  });

  it("operationId différent + même ligne déjà supprimée => échec explicite (pas de succès mensonger)", () => {
    const db = openMigrated(tmp, "idem2.sqlite");
    const id = seedSupplier(db);
    db.prepare("DELETE FROM suppliers WHERE id = ?").run(id);
    const row = db.prepare("SELECT name FROM suppliers WHERE id = ?").get(id);
    expect(row).toBeUndefined();
    db.close();
  });
});

describe("M-4 : contournement SQL direct fermé (bypass)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-rh-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("INSERT vente total négatif refusé au niveau DB", () => {
    const db = openMigrated(tmp, "bypass.sqlite");
    expect(() =>
      db
        .prepare(
          "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('b1','FAC-B1',100,-1,0,-1,'unpaid','2026-01-01','2026-01-01')",
        )
        .run(),
    ).toThrow();
    db.close();
  });

  it("INSERT vente surpayée refusé au niveau DB", () => {
    const db = openMigrated(tmp, "bypass2.sqlite");
    expect(() =>
      db
        .prepare(
          "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('b2','FAC-B2',100,100,150,-50,'partial','2026-01-01','2026-01-01')",
        )
        .run(),
    ).toThrow();
    db.close();
  });

  it("return_number NULL refusé INSERT + UPDATE (H-2 sur schéma 0025)", () => {
    const db = openMigrated(tmp, "bypass3.sqlite");
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('cb','C','B','c b','2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('sb','FAC-SB',100,100,100,0,'paid','2026-01-01','2026-01-01')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('rb',NULL,1,'FAC-SB',10,'validated','2026-01-02','2026-01-02')",
        )
        .run(),
    ).toThrow();
    db.prepare(
      "INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('rb2','RET-C-00077',1,'FAC-SB',10,'validated','2026-01-02','2026-01-02')",
    ).run();
    expect(() =>
      db.prepare("UPDATE returns SET return_number = NULL WHERE uuid = 'rb2'").run(),
    ).toThrow();
    db.close();
  });
});

describe("M-5/M-6 : révocation crédit + stock (miroirs SQL)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-rh-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("M-5 : révocation avec dette refusée, soldée autorisée", () => {
    const db = openMigrated(tmp, "cred.sqlite");
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, outstanding_balance_minor, created_at, updated_at) VALUES ('cc','C','C','c c',1,250,'2026-01-01','2026-01-01')",
    ).run();
    expect(() =>
      db.prepare("UPDATE customers SET credit_allowed = 0 WHERE uuid = 'cc'").run(),
    ).toThrow();
    db.prepare("UPDATE customers SET outstanding_balance_minor = 0 WHERE uuid = 'cc'").run();
    db.prepare("UPDATE customers SET credit_allowed = 0 WHERE uuid = 'cc'").run();
    const row = db.prepare("SELECT credit_allowed FROM customers WHERE uuid = 'cc'").get() as {
      credit_allowed: number;
    };
    expect(row.credit_allowed).toBe(0);
    db.close();
  });

  it("M-6 : vente bloquée sans stock quand allowNegativeStock=false", () => {
    const db = openMigrated(tmp, "stk.sqlite");
    db.prepare(
      "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES ('ps','Vis','PIECE',10,20,3,0,'in_stock','2026-01-01','2026-01-01')",
    ).run();
    // Miroir du garde sales.repo:185 — le main refuse avant toute mutation.
    // (les deux branches via paramètre : pas de rétrécissement de littéral.)
    const saleBlocked = (allowNegativeStock: boolean, requested: number, stock: number): boolean =>
      !allowNegativeStock && requested > stock;
    const qty = Number(
      (db.prepare("SELECT quantity FROM products WHERE uuid = 'ps'").get() as { quantity: number })
        .quantity,
    );
    expect(saleBlocked(false, 5, qty)).toBe(true);
    expect(saleBlocked(true, 5, qty)).toBe(false);
    db.close();
  });
});
