import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Garde quantité 0037 : toute écriture products.quantity vit dans une
// transaction atomique (repos) + trigger final de rejet (noguard négatif).
// Les repos main (better-sqlite3) partagent la même grammaire SQL ; les
// séquences ci-dessous miroient l'ordre exact des repos (vente, ajustement).
function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "qty.sqlite"));
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

function seedProduct(db: DatabaseSync): void {
  db.prepare(
    "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES ('p1','Farine','KG',4000,5000,5,2,'in_stock','2026-01-01','2026-01-01')",
  ).run();
}

function qty(db: DatabaseSync): number {
  return Number(
    (db.prepare("SELECT quantity FROM products WHERE id = 1").get() as { quantity: number })
      .quantity,
  );
}

describe("Quantity atomic guard (0037)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-qty-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("trigger final : INSERT négatif rejeté", () => {
    const db = openMigrated(tmp);
    seedProduct(db);
    expect(() =>
      db
        .prepare(
          "INSERT INTO products (uuid, name, quantity, created_at, updated_at) VALUES ('px','X',-1,'2026-01-01','2026-01-01')",
        )
        .run(),
    ).toThrow();
    expect(qty(db)).toBe(5);
    db.close();
  });

  it("trigger final : UPDATE négatif rejeté, stock inchangé", () => {
    const db = openMigrated(tmp);
    seedProduct(db);
    expect(() => db.prepare("UPDATE products SET quantity = -2 WHERE id = 1").run()).toThrow();
    expect(qty(db)).toBe(5);
    db.close();
  });

  it("survente : séquence vente avortée = rollback total (aucune ligne partielle)", () => {
    const db = openMigrated(tmp);
    seedProduct(db);
    db.exec("BEGIN;");
    try {
      db.prepare(
        "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, operation_id, created_at, updated_at) VALUES ('s1','F-1',5000,5000,5000,0,'paid','op-1','2026-01-02','2026-01-02')",
      ).run();
      db.prepare(
        "INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_code, original_unit_price_minor, unit_price_minor, purchase_price_minor, quantity, line_total_minor) VALUES (1,1,'Farine','KG',5000,5000,4000,7,35000)",
      ).run();
      // after = 5 - 7 = -2 : le repo lève AVANT l'UPDATE, le trigger l'interdirait sinon.
      const after = qty(db) - 7;
      if (after < 0)
        throw new Error("Stock insuffisant (survente refusée : stock négatif interdit).");
      db.prepare("UPDATE products SET quantity = ? WHERE id = 1").run(after);
      db.exec("COMMIT;");
      throw new Error("aurait dû avorter");
    } catch (e) {
      db.exec("ROLLBACK;");
      expect(String((e as Error).message)).toMatch(/négatif/);
    }
    expect((db.prepare("SELECT COUNT(*) AS n FROM sales").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM sale_items").get() as { n: number }).n).toBe(0);
    expect(qty(db)).toBe(5);
    db.close();
  });

  it("vente valide : commit atomique (stock + lignes)", () => {
    const db = openMigrated(tmp);
    seedProduct(db);
    db.exec("BEGIN;");
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, operation_id, created_at, updated_at) VALUES ('s1','F-1',10000,10000,10000,0,'paid','op-1','2026-01-02','2026-01-02')",
    ).run();
    db.prepare(
      "INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_code, original_unit_price_minor, unit_price_minor, purchase_price_minor, quantity, line_total_minor) VALUES (1,1,'Farine','KG',5000,5000,4000,2,10000)",
    ).run();
    db.prepare("UPDATE products SET quantity = ? WHERE id = 1").run(3);
    db.prepare(
      "INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, related_entity_type, related_entity_id, reason, created_at) VALUES ('m1',1,'sale_out',-2,3,'sale','1','Vente','2026-01-02')",
    ).run();
    db.exec("COMMIT;");
    expect(qty(db)).toBe(3);
    expect((db.prepare("SELECT COUNT(*) AS n FROM sales").get() as { n: number }).n).toBe(1);
    db.close();
  });

  it("ajustement valide : écriture dans la transaction acceptée par le trigger", () => {
    const db = openMigrated(tmp);
    seedProduct(db);
    db.exec("BEGIN;");
    db.prepare("UPDATE products SET quantity = ? WHERE id = 1").run(7);
    db.prepare(
      "INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, related_entity_type, reason, created_at) VALUES ('m2',1,'adjust_in',2,7,'adjustment','Ajustement','2026-01-02')",
    ).run();
    db.exec("COMMIT;");
    expect(qty(db)).toBe(7);
    db.close();
  });
});
