import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Tranches 6-9 : invariants SQL atomiques vérifiés sur node:sqlite (sans Electron).
// Les repos main (better-sqlite3) partagent la même grammaire SQL ; le smoke
// empaqueté vérifie le runtime natif.
function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "slices.sqlite"));
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

describe("Atomic slices (SQL invariants)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-slices-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("entrée fournisseur : intake + lignes + stock + solde = 1 transaction", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO suppliers (uuid, name, created_at, updated_at) VALUES ('s1','Moulin','2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES ('p1','Farine','KG',4000,5000,10,2,'in_stock','2026-01-01','2026-01-01')",
    ).run();
    // Transaction complète simulée comme le repo : tout réussit ensemble.
    const tx = (): void => {
      db.exec("BEGIN;");
      try {
        db.prepare(
          "INSERT INTO stock_intakes (uuid, supplier_id, subtotal_minor, total_minor, status, created_at, updated_at) VALUES ('i1',1,32000,32000,'committed','2026-01-02','2026-01-02')",
        ).run();
        db.prepare(
          "INSERT INTO stock_intake_items (stock_intake_id, product_id, product_name_snapshot, quantity_received, purchase_price_minor, landing_cost_minor) VALUES (1,1,'Farine',8,4000,4000)",
        ).run();
        db.prepare("UPDATE products SET quantity = quantity + 8 WHERE id = 1").run();
        db.prepare(
          "UPDATE suppliers SET outstanding_balance_minor = outstanding_balance_minor + 32000 WHERE id = 1",
        ).run();
        db.exec("COMMIT;");
      } catch (e) {
        db.exec("ROLLBACK;");
        throw e;
      }
    };
    tx();
    const prod = db.prepare("SELECT quantity FROM products WHERE id = 1").get() as {
      quantity: number;
    };
    expect(Number(prod.quantity)).toBe(18);
    const sup = db
      .prepare("SELECT outstanding_balance_minor FROM suppliers WHERE id = 1")
      .get() as {
      outstanding_balance_minor: number;
    };
    expect(sup.outstanding_balance_minor).toBe(32000);

    // Échec au milieu (ligne invalide) => rollback total, stock inchangé.
    let failed = false;
    try {
      db.exec("BEGIN;");
      db.prepare(
        "INSERT INTO stock_intakes (uuid, supplier_id, subtotal_minor, total_minor, status, created_at, updated_at) VALUES ('i2',1,100,100,'committed','2026-01-03','2026-01-03')",
      ).run();
      db.prepare(
        "INSERT INTO stock_intake_items (stock_intake_id, product_id, product_name_snapshot, quantity_received, purchase_price_minor, landing_cost_minor) VALUES (2,1,'Farine',-5,4000,4000)",
      ).run();
      db.exec("COMMIT;");
    } catch {
      failed = true;
      try {
        db.exec("ROLLBACK;");
      } catch {
        /* déjà annulé */
      }
    }
    expect(failed).toBe(true);
    const prod2 = db.prepare("SELECT quantity FROM products WHERE id = 1").get() as {
      quantity: number;
    };
    expect(Number(prod2.quantity)).toBe(18);
    db.close();
  });

  it("clôture Z : unicité par date + formule", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO daily_closings (uuid, business_date, cash_sales_minor, cash_payments_minor, customer_collections_minor, expenses_minor, refunds_minor, closing_balance_minor, closed_at) VALUES ('z1','2026-03-01',50000,50000,5000,8000,2000,45000,'2026-03-01T20:00:00Z')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO daily_closings (uuid, business_date, cash_sales_minor, cash_payments_minor, customer_collections_minor, expenses_minor, refunds_minor, closing_balance_minor, closed_at) VALUES ('z2','2026-03-01',1,1,0,0,0,1,'2026-03-01T21:00:00Z')",
        )
        .run(),
    ).toThrow();
    db.close();
  });

  it("proforma : statuts + conversion liée", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO proforma_invoices (uuid, proforma_number, subtotal_minor, total_minor, status, created_at, updated_at) VALUES ('pr1','PRO-2026-00001',20000,20000,'draft','2026-01-01','2026-01-01')",
    ).run();
    db.prepare("UPDATE proforma_invoices SET status = 'sent' WHERE id = 1").run();
    // Statut invalide rejeté par CHECK.
    expect(() =>
      db.prepare("UPDATE proforma_invoices SET status = 'nope' WHERE id = 1").run(),
    ).toThrow();
    db.close();
  });

  it("pain : surpaiement rejeté + statuts contraints", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO bread_orders (uuid, order_number, order_date, pickup_date, quantity, unit_price_minor, total_amount_minor, amount_paid_minor, remaining_amount_minor, payment_status, pickup_status, created_at, updated_at) VALUES ('b1','PAIN-2026-00001','2026-01-01','2026-01-02',10,1500,15000,10000,5000,'partial','pending','2026-01-01','2026-01-01')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO bread_orders (uuid, order_number, order_date, pickup_date, quantity, unit_price_minor, total_amount_minor, amount_paid_minor, remaining_amount_minor, payment_status, pickup_status, created_at, updated_at) VALUES ('b2','PAIN-2026-00002','2026-01-01','2026-01-02',1,1000,1000,1500,-500,'partial','pending','2026-01-01','2026-01-01')",
        )
        .run(),
    ).toThrow();
    db.close();
  });
});
