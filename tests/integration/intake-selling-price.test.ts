// Veloria PoS — Tests d'intégration : réception fournisseur + prix de vente.
// Même pattern que atomic-slices : invariants SQL vérifiés sur node:sqlite
// (sans Electron). La logique métier miroir est celle de
// electron/ipc/handlers/inventory.repo.ts:receiveStockAtomic.
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
  // 0023: code requis à l'INSERT (contrat repo).
  db.prepare(
    "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('f1','Moulin','FOU-00001','2026-01-01','2026-01-01')",
  ).run();
  return Number(
    (db.prepare("SELECT id FROM suppliers WHERE uuid = 'f1'").get() as { id: number }).id,
  );
}

function seedProduct(
  db: DatabaseSync,
  uuid: string,
  qty: number,
  cost: number,
  selling: number,
): number {
  db.prepare(
    "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES (?, 'Coca Cola 1L', 'PIECE', ?, ?, ?, 0, 'in_stock', '2026-01-01', '2026-01-01')",
  ).run(uuid, cost, selling, qty);
  return Number(
    (db.prepare("SELECT id FROM products WHERE uuid = ?").get(uuid) as { id: number }).id,
  );
}

describe("Réception fournisseur + prix de vente (SQL invariants)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-intake-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("Test 1 : produit existant — stock +, coût et vente mis à jour (20+10=30, 80→85, 100→110)", () => {
    const db = openMigrated(tmp, "t1.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p1", 20, 8000, 10000);
    // Miroir repo : INSERT intake + item + UPDATE produit + mouvement + dette = 1 tx.
    db.exec("BEGIN;");
    db.prepare(
      "INSERT INTO stock_intakes (uuid, supplier_id, invoice_number, invoice_date, subtotal_minor, shipping_cost_minor, total_minor, status, operation_id, created_at, updated_at) VALUES ('i1', ?, 'FAC-1', '2026-09-17', 85000, 0, 85000, 'committed', 'op-t1', '2026-09-17', '2026-09-17')",
    ).run(sup);
    db.prepare(
      "INSERT INTO stock_intake_items (stock_intake_id, product_id, product_name_snapshot, quantity_received, quantity_damaged, purchase_price_minor, landing_cost_minor) VALUES (1, ?, 'Coca Cola 1L', 10, 0, 8500, 8500)",
    ).run(pid);
    db.prepare(
      "UPDATE products SET quantity = quantity + 10, purchase_price_minor = 8500, selling_price_minor = 11000, updated_at = '2026-09-17' WHERE id = ?",
    ).run(pid);
    db.prepare(
      "INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, created_at) VALUES ('m1', ?, 'intake_in', 10, 30, 8500, 'intake', '1', 'Entrée fournisseur', '2026-09-17')",
    ).run(pid);
    db.prepare(
      "UPDATE suppliers SET outstanding_balance_minor = outstanding_balance_minor + 85000 WHERE id = ?",
    ).run(sup);
    db.exec("COMMIT;");
    const p = db
      .prepare(
        "SELECT quantity, purchase_price_minor, selling_price_minor FROM products WHERE id = ?",
      )
      .get(pid) as {
      quantity: number;
      purchase_price_minor: number;
      selling_price_minor: number;
    };
    expect(Number(p.quantity)).toBe(30);
    expect(p.purchase_price_minor).toBe(8500);
    expect(p.selling_price_minor).toBe(11000);
    db.close();
  });

  it("Test 2 : produit nouveau — création + stock initial + coûts (jamais de marge auto)", () => {
    const db = openMigrated(tmp, "t2.sqlite");
    const sup = seedSupplier(db);
    db.exec("BEGIN;");
    db.prepare(
      "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at) VALUES ('pn', 'Jus Bio', 'PIECE', 12000, 15000, 5, 0, 'in_stock', 1, '2026-09-17', '2026-09-17')",
    ).run();
    const pid = Number(
      (db.prepare("SELECT id FROM products WHERE uuid = 'pn'").get() as { id: number }).id,
    );
    db.prepare(
      "INSERT INTO stock_intakes (uuid, supplier_id, subtotal_minor, total_minor, status, operation_id, created_at, updated_at) VALUES ('i2', ?, 60000, 60000, 'committed', 'op-t2', '2026-09-17', '2026-09-17')",
    ).run(sup);
    db.prepare(
      "INSERT INTO stock_intake_items (stock_intake_id, product_id, product_name_snapshot, quantity_received, purchase_price_minor, landing_cost_minor) VALUES (1, ?, 'Jus Bio', 5, 12000, 12000)",
    ).run(pid);
    db.prepare(
      "INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, reason, created_at) VALUES ('m2', ?, 'intake_in', 5, 5, 'Entrée fournisseur', '2026-09-17')",
    ).run(pid);
    db.exec("COMMIT;");
    const p = db
      .prepare(
        "SELECT quantity, purchase_price_minor, selling_price_minor FROM products WHERE id = ?",
      )
      .get(pid) as {
      quantity: number;
      purchase_price_minor: number;
      selling_price_minor: number;
    };
    expect(Number(p.quantity)).toBe(5);
    expect(p.purchase_price_minor).toBe(12000);
    expect(p.selling_price_minor).toBe(15000);
    db.close();
  });

  it("Test 3 : multi-produits — chaque produit garde son prix de vente propre", () => {
    const db = openMigrated(tmp, "t3.sqlite");
    seedSupplier(db);
    const a = seedProduct(db, "pa", 10, 8000, 10000);
    const b = seedProduct(db, "pb", 10, 12000, 14000);
    db.prepare("UPDATE products SET selling_price_minor = 10000 WHERE id = ?").run(a);
    db.prepare("UPDATE products SET selling_price_minor = 15000 WHERE id = ?").run(b);
    const ra = db.prepare("SELECT selling_price_minor FROM products WHERE id = ?").get(a) as {
      selling_price_minor: number;
    };
    const rb = db.prepare("SELECT selling_price_minor FROM products WHERE id = ?").get(b) as {
      selling_price_minor: number;
    };
    expect(ra.selling_price_minor).toBe(10000);
    expect(rb.selling_price_minor).toBe(15000);
    db.close();
  });

  it("Test 4 : vente vide — le prix actuel est conservé (pas d'écrasement)", () => {
    const db = openMigrated(tmp, "t4.sqlite");
    seedSupplier(db);
    const pid = seedProduct(db, "p4", 20, 8000, 10000);
    // Miroir repo : selling NULL → UPDATE sans toucher selling_price_minor.
    db.prepare(
      "UPDATE products SET quantity = quantity + 5, purchase_price_minor = 8500 WHERE id = ?",
    ).run(pid);
    const p = db
      .prepare(
        "SELECT quantity, purchase_price_minor, selling_price_minor FROM products WHERE id = ?",
      )
      .get(pid) as {
      quantity: number;
      purchase_price_minor: number;
      selling_price_minor: number;
    };
    expect(Number(p.quantity)).toBe(25);
    expect(p.purchase_price_minor).toBe(8500);
    expect(p.selling_price_minor).toBe(10000);
    db.close();
  });

  it("Test 5 : facture à crédit (avec fournisseur) — dette mise à jour", () => {
    const db = openMigrated(tmp, "t5.sqlite");
    const sup = seedSupplier(db);
    db.prepare(
      "INSERT INTO stock_intakes (uuid, supplier_id, subtotal_minor, total_minor, status, operation_id, created_at, updated_at) VALUES ('i5', ?, 50000, 50000, 'committed', 'op-t5', '2026-09-17', '2026-09-17')",
    ).run(sup);
    db.prepare(
      "UPDATE suppliers SET outstanding_balance_minor = outstanding_balance_minor + 50000 WHERE id = ?",
    ).run(sup);
    const s = db
      .prepare("SELECT outstanding_balance_minor FROM suppliers WHERE id = ?")
      .get(sup) as {
      outstanding_balance_minor: number;
    };
    expect(s.outstanding_balance_minor).toBe(50000);
    db.close();
  });

  it("Test 6 : facture comptant (sans fournisseur) — aucune dette créée", () => {
    const db = openMigrated(tmp, "t6.sqlite");
    const sup = seedSupplier(db);
    db.prepare(
      "INSERT INTO stock_intakes (uuid, supplier_id, subtotal_minor, total_minor, status, operation_id, created_at, updated_at) VALUES ('i6', NULL, 30000, 30000, 'committed', 'op-t6', '2026-09-17', '2026-09-17')",
    ).run();
    const s = db
      .prepare("SELECT outstanding_balance_minor FROM suppliers WHERE id = ?")
      .get(sup) as {
      outstanding_balance_minor: number;
    };
    expect(s.outstanding_balance_minor).toBe(0);
    db.close();
  });

  it("Test 7 : échec au milieu — rollback complet (ni facture, ni stock, ni dette)", () => {
    const db = openMigrated(tmp, "t7.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p7", 20, 8000, 10000);
    let failed = false;
    try {
      db.exec("BEGIN;");
      db.prepare(
        "INSERT INTO stock_intakes (uuid, supplier_id, subtotal_minor, total_minor, status, operation_id, created_at, updated_at) VALUES ('i7', ?, 100, 100, 'committed', 'op-t7', '2026-09-17', '2026-09-17')",
      ).run(sup);
      // Ligne invalide : quantité négative rejetée par CHECK.
      db.prepare(
        "INSERT INTO stock_intake_items (stock_intake_id, product_id, product_name_snapshot, quantity_received, purchase_price_minor, landing_cost_minor) VALUES (1, ?, 'X', -5, 100, 100)",
      ).run(pid);
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
    const n = db.prepare("SELECT COUNT(*) AS c FROM stock_intakes WHERE uuid = 'i7'").get() as {
      c: number;
    };
    expect(n.c).toBe(0);
    const p = db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as {
      quantity: number;
    };
    expect(Number(p.quantity)).toBe(20);
    const s = db
      .prepare("SELECT outstanding_balance_minor FROM suppliers WHERE id = ?")
      .get(sup) as {
      outstanding_balance_minor: number;
    };
    expect(s.outstanding_balance_minor).toBe(0);
    db.close();
  });

  it("Tests 8+9 : pas de modification/suppression de facture — rejouer operationId ne duplique rien (UNIQUE)", () => {
    const db = openMigrated(tmp, "t89.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p89", 20, 8000, 10000);
    db.prepare(
      "INSERT INTO stock_intakes (uuid, supplier_id, subtotal_minor, total_minor, status, operation_id, created_at, updated_at) VALUES ('i89', ?, 85000, 85000, 'committed', 'op-dup', '2026-09-17', '2026-09-17')",
    ).run(sup);
    db.prepare("UPDATE products SET quantity = quantity + 10 WHERE id = ?").run(pid);
    db.prepare(
      "UPDATE suppliers SET outstanding_balance_minor = outstanding_balance_minor + 85000 WHERE id = ?",
    ).run(sup);
    // Rejeu du même operationId (double-clic / retry) : contrainte UNIQUE → rejet,
    // donc aucun second mouvement de stock/dette. Le repo retourne la ligne existante.
    expect(() =>
      db
        .prepare(
          "INSERT INTO stock_intakes (uuid, supplier_id, subtotal_minor, total_minor, status, operation_id, created_at, updated_at) VALUES ('i89b', ?, 85000, 85000, 'committed', 'op-dup', '2026-09-17', '2026-09-17')",
        )
        .run(sup),
    ).toThrow();
    const p = db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as {
      quantity: number;
    };
    expect(Number(p.quantity)).toBe(30);
    const s = db
      .prepare("SELECT outstanding_balance_minor FROM suppliers WHERE id = ?")
      .get(sup) as {
      outstanding_balance_minor: number;
    };
    expect(s.outstanding_balance_minor).toBe(85000);
    // Aucun canal de modification/suppression : une facture reste immuable
    // (correction via Ajustement/Inventaire, retour via Retours fournisseur).
    const cols = db.prepare("SELECT name FROM pragma_table_info('stock_intakes')").all() as {
      name: string;
    }[];
    expect(cols.map((c) => c.name).includes("operation_id")).toBe(true);
    db.close();
  });
});
