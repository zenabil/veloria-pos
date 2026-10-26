// Veloria PoS — Tests d'intégration FIFO (invariants SQL sur node:sqlite).
// Miroir documenté de electron/ipc/handlers/fifo.ts + receiveStockAtomic +
// createSaleAtomic + retours (les repos exigent Electron : même pattern que
// atomic-slices.test.ts — on prouve couches, atomicité, immuabilité).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IPC_CHANNELS } from "../../electron/ipc/channels.ts";

function migFiles(): string[] {
  const migDir = path.join(process.cwd(), "database", "migrations");
  return fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort();
}

function openMigrated(tmp: string, name: string, onlyBefore0018 = false): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, name));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of migFiles()) {
    if (onlyBefore0018 && f >= "0018_fifo_cost_layers.sql") continue;
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function seedProduct(
  db: DatabaseSync,
  uuid: string,
  qty: number,
  cost: number,
  selling: number,
): number {
  db.prepare(
    "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES (?, 'FIFO Prod', 'PIECE', ?, ?, ?, 0, 'in_stock', '2026-09-01', '2026-09-01')",
  ).run(uuid, cost, selling, qty);
  return Number(
    (db.prepare("SELECT id FROM products WHERE uuid = ?").get(uuid) as { id: number }).id,
  );
}

function seedSupplier(db: DatabaseSync): number {
  // 0023: code requis à l'INSERT (contrat repo).
  db.prepare(
    "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('fs','Moulin','FOU-00001','2026-09-01','2026-09-01')",
  ).run();
  return Number(
    (db.prepare("SELECT id FROM suppliers WHERE uuid = 'fs'").get() as { id: number }).id,
  );
}

/** Miroir receiveStockAtomic (couche par apport net, même transaction). */
function intake(
  db: DatabaseSync,
  pid: number,
  sup: number | null,
  qty: number,
  cost: number,
  op: string,
  selling: number | null = null,
): number {
  db.exec("BEGIN;");
  try {
    db.prepare(
      "INSERT INTO stock_intakes (uuid, supplier_id, subtotal_minor, total_minor, status, operation_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'committed', ?, '2026-09-02', '2026-09-02')",
    ).run(`iu-${op}`, sup, cost * qty, cost * qty, op);
    const intakeId = Number(
      (db.prepare("SELECT id FROM stock_intakes WHERE operation_id = ?").get(op) as { id: number })
        .id,
    );
    db.prepare(
      "INSERT INTO stock_intake_items (stock_intake_id, product_id, product_name_snapshot, quantity_received, purchase_price_minor, landing_cost_minor) VALUES (?, ?, 'FIFO Prod', ?, ?, ?)",
    ).run(intakeId, pid, qty, cost, cost);
    const itemId = Number((db.prepare("SELECT last_insert_rowid() AS i").get() as { i: number }).i);
    db.prepare(
      "INSERT INTO inventory_layers (uuid, product_id, stock_intake_id, stock_intake_item_id, original_quantity, remaining_quantity, unit_cost_minor, purchase_date, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, '2026-09-02', 'intake', '2026-09-02')",
    ).run(`ly-${op}`, pid, intakeId, itemId, qty, qty, cost);
    if (selling !== null) {
      db.prepare(
        "UPDATE products SET quantity = quantity + ?, purchase_price_minor = ?, selling_price_minor = ? WHERE id = ?",
      ).run(qty, cost, selling, pid);
    } else {
      db.prepare(
        "UPDATE products SET quantity = quantity + ?, purchase_price_minor = ? WHERE id = ?",
      ).run(qty, cost, pid);
    }
    if (sup !== null) {
      db.prepare(
        "UPDATE suppliers SET outstanding_balance_minor = outstanding_balance_minor + ? WHERE id = ?",
      ).run(cost * qty, sup);
    }
    db.exec("COMMIT;");
    return intakeId;
  } catch (e) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* déjà annulé */
    }
    throw e;
  }
}

/** Miroir consumeLayers (ancien-d'abord, traçabilité, figé). */
function sell(
  db: DatabaseSync,
  pid: number,
  qty: number,
  unitPrice: number,
  invoice: string,
  oversell: boolean,
  fallback: number,
): { saleId: number; cogs: number } {
  db.exec("BEGIN;");
  try {
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 'paid', '2026-09-03', '2026-09-03')",
    ).run(`su-${invoice}`, invoice, unitPrice * qty, unitPrice * qty, unitPrice * qty);
    const saleId = Number(
      (db.prepare("SELECT id FROM sales WHERE invoice_number = ?").get(invoice) as { id: number })
        .id,
    );
    db.prepare(
      "INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_code, unit_price_minor, purchase_price_minor, quantity, line_total_minor) VALUES (?, ?, 'FIFO Prod', 'PIECE', ?, 0, ?, ?)",
    ).run(saleId, pid, unitPrice, qty, unitPrice * qty);
    const itemId = Number((db.prepare("SELECT last_insert_rowid() AS i").get() as { i: number }).i);
    let need = qty;
    let cogs = 0;
    const layers = db
      .prepare(
        "SELECT id, remaining_quantity AS q, unit_cost_minor AS c FROM inventory_layers WHERE product_id = ? AND remaining_quantity > 0 ORDER BY id ASC",
      )
      .all(pid) as { id: number; q: number; c: number }[];
    for (const l of layers) {
      if (need <= 0) break;
      const take = Math.min(need, Number(l.q));
      db.prepare(
        "UPDATE inventory_layers SET remaining_quantity = remaining_quantity - ? WHERE id = ?",
      ).run(take, l.id);
      db.prepare(
        "INSERT INTO sale_fifo_consumption (sale_id, sale_item_id, product_id, layer_id, quantity, unit_cost_minor, created_at) VALUES (?, ?, ?, ?, ?, ?, '2026-09-03')",
      ).run(saleId, itemId, pid, l.id, take, l.c);
      cogs += Math.round(Number(l.c) * take);
      need = Math.round((need - take) * 1000) / 1000;
    }
    if (need > 0) {
      if (!oversell) throw new Error("Stock FIFO insuffisant.");
      db.prepare(
        "INSERT INTO sale_fifo_consumption (sale_id, sale_item_id, product_id, layer_id, quantity, unit_cost_minor, created_at) VALUES (?, ?, ?, NULL, ?, ?, '2026-09-03')",
      ).run(saleId, itemId, pid, need, fallback);
      cogs += Math.round(fallback * need);
    }
    db.prepare("UPDATE sale_items SET cogs_minor = ? WHERE id = ?").run(cogs, itemId);
    db.prepare("UPDATE products SET quantity = quantity - ? WHERE id = ?").run(qty, pid);
    db.exec("COMMIT;");
    return { saleId, cogs };
  } catch (e) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* déjà annulé */
    }
    throw e;
  }
}

describe("FIFO cost layers (SQL invariants)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-fifo-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("Test 1 : 10×20, vente 3×25 → COGS 60, revenu 75, profit 15, couche à 7", () => {
    const db = openMigrated(tmp, "t1.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p1", 0, 2000, 2500);
    intake(db, pid, sup, 10, 2000, "op-t1");
    const { cogs } = sell(db, pid, 3, 2500, "FAC-T1-00001", false, 0);
    expect(cogs).toBe(6000);
    const item = db
      .prepare("SELECT cogs_minor, unit_price_minor FROM sale_items WHERE sale_id = 1")
      .get() as {
      cogs_minor: number;
      unit_price_minor: number;
    };
    expect(item.cogs_minor).toBe(6000);
    expect(item.cogs_minor).toBe(6000);
    expect(item.unit_price_minor - 0).toBe(2500);
    expect(item.unit_price_minor * 3 - item.cogs_minor).toBe(1500);
    const rem = db
      .prepare("SELECT remaining_quantity AS q FROM inventory_layers WHERE product_id = ?")
      .get(pid) as { q: number };
    expect(Number(rem.q)).toBe(7);
    const qty = db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as {
      quantity: number;
    };
    expect(Number(qty.quantity)).toBe(7);
    db.close();
  });

  it("Test 2 : 10×20 puis 10×24, vente 3×30 → coût 20 (pas le dernier coût)", () => {
    const db = openMigrated(tmp, "t2.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p2", 0, 2000, 2500);
    intake(db, pid, sup, 10, 2000, "op-t2a");
    intake(db, pid, sup, 10, 2400, "op-t2b", 3000);
    const { cogs } = sell(db, pid, 3, 3000, "FAC-T2-00001", false, 0);
    expect(cogs).toBe(6000);
    const first = db
      .prepare(
        "SELECT remaining_quantity AS q FROM inventory_layers WHERE product_id = ? ORDER BY id ASC",
      )
      .all(pid) as { q: number }[];
    expect(Number(first[0]?.q)).toBe(7);
    expect(Number(first[1]?.q)).toBe(10);
    db.close();
  });

  it("Tests 3+14 : 10×20 + 10×24, vente 15×30 → 10×20 + 5×24 = 320", () => {
    const db = openMigrated(tmp, "t3.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p3", 0, 2000, 3000);
    intake(db, pid, sup, 10, 2000, "op-t3a");
    intake(db, pid, sup, 10, 2400, "op-t3b");
    const { cogs } = sell(db, pid, 15, 3000, "FAC-T3-00001", false, 0);
    expect(cogs).toBe(10 * 2000 + 5 * 2400);
    expect(15 * 3000 - cogs).toBe(45000 - 32000);
    const rows = db
      .prepare(
        "SELECT remaining_quantity AS q FROM inventory_layers WHERE product_id = ? ORDER BY id ASC",
      )
      .all(pid) as { q: number }[];
    expect(Number(rows[0]?.q)).toBe(0);
    expect(Number(rows[1]?.q)).toBe(5);
    db.close();
  });

  it("Test 4 : vente 25→30 ne touche pas les couches ; Test 5 : achat 20→24 ne touche pas la vente", () => {
    const db = openMigrated(tmp, "t45.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p45", 0, 2000, 2500);
    intake(db, pid, sup, 10, 2000, "op-t45a");
    const before = JSON.stringify(
      db
        .prepare(
          "SELECT id, remaining_quantity, unit_cost_minor FROM inventory_layers WHERE product_id = ? ORDER BY id",
        )
        .all(pid),
    );
    db.prepare("UPDATE products SET selling_price_minor = 3000 WHERE id = ?").run(pid);
    const afterSell = JSON.stringify(
      db
        .prepare(
          "SELECT id, remaining_quantity, unit_cost_minor FROM inventory_layers WHERE product_id = ? ORDER BY id",
        )
        .all(pid),
    );
    expect(afterSell).toBe(before);
    db.prepare("UPDATE products SET purchase_price_minor = 2400 WHERE id = ?").run(pid);
    const p = db
      .prepare("SELECT purchase_price_minor, selling_price_minor FROM products WHERE id = ?")
      .get(pid) as {
      purchase_price_minor: number;
      selling_price_minor: number;
    };
    expect(p.purchase_price_minor).toBe(2400);
    expect(p.selling_price_minor).toBe(3000);
    db.close();
  });

  it("Test 6 : profit historique figé après nouvel achat", () => {
    const db = openMigrated(tmp, "t6.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p6", 0, 2000, 2500);
    intake(db, pid, sup, 10, 2000, "op-t6a");
    sell(db, pid, 3, 2500, "FAC-T6-00001", false, 0);
    intake(db, pid, sup, 10, 2400, "op-t6b", 3000);
    const item = db
      .prepare("SELECT cogs_minor, unit_price_minor, quantity FROM sale_items WHERE sale_id = 1")
      .get() as {
      cogs_minor: number;
      unit_price_minor: number;
      quantity: number;
    };
    expect(item.cogs_minor).toBe(6000);
    expect(item.unit_price_minor * Number(item.quantity) - item.cogs_minor).toBe(1500);
    db.close();
  });

  it("Test 7 : facture sans prix de vente → prix actuel conservé", () => {
    const db = openMigrated(tmp, "t7.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p7", 5, 2000, 10000);
    intake(db, pid, sup, 5, 2500, "op-t7", null);
    const p = db
      .prepare(
        "SELECT quantity, purchase_price_minor, selling_price_minor FROM products WHERE id = ?",
      )
      .get(pid) as {
      quantity: number;
      purchase_price_minor: number;
      selling_price_minor: number;
    };
    expect(Number(p.quantity)).toBe(10);
    expect(p.purchase_price_minor).toBe(2500);
    expect(p.selling_price_minor).toBe(10000);
    db.close();
  });

  it("Test 8 : retour client → couches d'origine restaurées (pas un coût récent)", () => {
    const db = openMigrated(tmp, "t8.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p8", 0, 2000, 3000);
    intake(db, pid, sup, 10, 2000, "op-t8a");
    intake(db, pid, sup, 10, 2400, "op-t8b");
    const { saleId } = sell(db, pid, 12, 3000, "FAC-T8-00001", false, 0);
    // L1 épuisée (10), L2 à 8. Retour de 2 → L1 remonte à 2 (coût 20 préservé).
    const cons = db
      .prepare(
        "SELECT layer_id AS l, quantity AS q FROM sale_fifo_consumption WHERE sale_id = ? ORDER BY id ASC",
      )
      .all(saleId) as { l: number | null; q: number }[];
    let need = 2;
    for (const c of cons) {
      if (need <= 0 || c.l === null) break;
      const take = Math.min(need, Number(c.q));
      db.prepare(
        "UPDATE inventory_layers SET remaining_quantity = remaining_quantity + ? WHERE id = ?",
      ).run(take, c.l);
      need = Math.round((need - take) * 1000) / 1000;
    }
    expect(need).toBe(0);
    db.prepare("UPDATE products SET quantity = quantity + 2 WHERE id = ?").run(pid);
    const l1 = db
      .prepare(
        "SELECT remaining_quantity AS q, unit_cost_minor AS c FROM inventory_layers WHERE product_id = ? ORDER BY id ASC",
      )
      .all(pid) as {
      q: number;
      c: number;
    }[];
    expect(Number(l1[0]?.q)).toBe(2);
    expect(l1[0]?.c).toBe(2000);
    expect(Number(l1[1]?.q)).toBe(8);
    db.close();
  });

  it("Test 9 : retour fournisseur → déduit la couche de CETTE facture ; sur-retour refusé", () => {
    const db = openMigrated(tmp, "t9.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p9", 0, 2000, 3000);
    const intakeId = intake(db, pid, sup, 10, 2000, "op-t9a");
    const layerId = Number(
      (
        db.prepare("SELECT id FROM inventory_layers WHERE product_id = ?").get(pid) as {
          id: number;
        }
      ).id,
    );
    db.prepare(
      "UPDATE inventory_layers SET remaining_quantity = remaining_quantity - 3 WHERE id = ?",
    ).run(layerId);
    db.prepare("UPDATE products SET quantity = quantity - 3 WHERE id = ?").run(pid);
    const rem = db
      .prepare(
        "SELECT COALESCE(SUM(remaining_quantity),0) AS q FROM inventory_layers WHERE product_id = ? AND stock_intake_id = ?",
      )
      .get(pid, intakeId) as { q: number };
    expect(Number(rem.q)).toBe(7);
    // 8 > 7 liés restants → refus (quantité déjà vendue), rollback total.
    let failed = false;
    db.exec("BEGIN;");
    try {
      const linked = db
        .prepare(
          "SELECT COALESCE(SUM(remaining_quantity),0) AS q FROM inventory_layers WHERE product_id = ? AND stock_intake_id = ?",
        )
        .get(pid, intakeId) as { q: number };
      if (8 > Number(linked.q))
        throw new Error("Retour impossible : cette quantité a déjà été vendue ou ajustée.");
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
    const still = db
      .prepare(
        "SELECT COALESCE(SUM(remaining_quantity),0) AS q FROM inventory_layers WHERE product_id = ?",
      )
      .get(pid) as { q: number };
    expect(Number(still.q)).toBe(7);
    db.close();
  });

  it("Tests 10+11 : factures immuables (annulation seule, pas d'update/delete) + operationId UNIQUE", () => {
    const names = Object.keys(IPC_CHANNELS);
    // ADR-139 : la réception reste immuable ligne à ligne ; seules la lecture
    // détaillée et l'annulation (stock rendu si intact) sont ajoutées.
    expect(names.filter((k) => k.startsWith("stock.intake"))).toEqual([
      "stock.intake",
      "stock.intakes",
      "stock.intakeDetail",
      "stock.intakeCancel",
    ]);
    expect(names.some((k) => /intake\.(update|delete|remove)/.test(k))).toBe(false);
    const db = openMigrated(tmp, "t1011.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p1011", 0, 2000, 2500);
    intake(db, pid, sup, 4, 2000, "op-dup");
    expect(() =>
      db
        .prepare(
          "INSERT INTO stock_intakes (uuid, supplier_id, subtotal_minor, total_minor, status, operation_id, created_at, updated_at) VALUES ('iu-dup2', ?, 8000, 8000, 'committed', 'op-dup', '2026-09-02', '2026-09-02')",
        )
        .run(sup),
    ).toThrow();
    db.close();
  });

  it("Test 12 : survente bloquée (stock insuffisant) — couches et stock intacts", () => {
    const db = openMigrated(tmp, "t12.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p12", 0, 2000, 3000);
    intake(db, pid, sup, 2, 2000, "op-t12a");
    expect(() => sell(db, pid, 5, 3000, "FAC-T12-00001", false, 0)).toThrow(
      "Stock FIFO insuffisant",
    );
    const rem = db
      .prepare(
        "SELECT COALESCE(SUM(remaining_quantity),0) AS q FROM inventory_layers WHERE product_id = ?",
      )
      .get(pid) as { q: number };
    expect(Number(rem.q)).toBe(2);
    const qty = db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as {
      quantity: number;
    };
    expect(Number(qty.quantity)).toBe(2);
    const n = db
      .prepare("SELECT COUNT(*) AS c FROM sales WHERE invoice_number = 'FAC-T12-00001'")
      .get() as { c: number };
    expect(n.c).toBe(0);
    db.close();
  });

  it("Test 13 : échec en pleine transaction — rollback (ni facture, ni couche, ni stock, ni dette)", () => {
    const db = openMigrated(tmp, "t13.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "p13", 5, 2000, 2500);
    let failed = false;
    db.exec("BEGIN;");
    try {
      db.prepare(
        "INSERT INTO stock_intakes (uuid, supplier_id, subtotal_minor, total_minor, status, operation_id, created_at, updated_at) VALUES ('iu-bad', ?, 100, 100, 'committed', 'op-bad', '2026-09-02', '2026-09-02')",
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
    expect(
      (
        db.prepare("SELECT COUNT(*) AS c FROM stock_intakes WHERE uuid = 'iu-bad'").get() as {
          c: number;
        }
      ).c,
    ).toBe(0);
    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS c FROM inventory_layers WHERE uuid LIKE 'ly-bad%'")
          .get() as { c: number }
      ).c,
    ).toBe(0);
    expect(
      Number(
        (db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as { quantity: number })
          .quantity,
      ),
    ).toBe(5);
    expect(
      Number(
        (
          db.prepare("SELECT outstanding_balance_minor FROM suppliers WHERE id = ?").get(sup) as {
            outstanding_balance_minor: number;
          }
        ).outstanding_balance_minor,
      ),
    ).toBe(0);
    db.close();
  });

  it("Valorisation FIFO : 5×20 + 10×24 = 340", () => {
    const db = openMigrated(tmp, "tv.sqlite");
    const sup = seedSupplier(db);
    const pid = seedProduct(db, "pv", 0, 2000, 3000);
    intake(db, pid, sup, 10, 2000, "op-tv1");
    intake(db, pid, sup, 10, 2400, "op-tv2");
    sell(db, pid, 5, 3000, "FAC-TV-00001", false, 0);
    const v = db
      .prepare(
        "SELECT COALESCE(SUM(remaining_quantity * unit_cost_minor),0) AS v FROM inventory_layers WHERE product_id = ?",
      )
      .get(pid) as { v: number };
    expect(Math.round(Number(v.v))).toBe(5 * 2000 + 10 * 2400);
    db.close();
  });

  it("Migration 0018 : reprise — couche d'ouverture + cogs historique", () => {
    const db = openMigrated(tmp, "tm.sqlite", true);
    db.prepare(
      "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES ('pm','Ancien', 'PIECE', 1800, 2500, 20, 0, 'in_stock', '2026-01-01', '2026-01-01')",
    ).run();
    const pid = Number(
      (db.prepare("SELECT id FROM products WHERE uuid = 'pm'").get() as { id: number }).id,
    );
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('sm','FAC-M-00001', 5000, 5000, 5000, 0, 'paid','2026-02-01','2026-02-01')",
    ).run();
    const saleId = Number(
      (db.prepare("SELECT id FROM sales WHERE uuid = 'sm'").get() as { id: number }).id,
    );
    db.prepare(
      "INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_code, unit_price_minor, purchase_price_minor, quantity, line_total_minor) VALUES (?, ?, 'Ancien', 'PIECE', 2500, 1800, 2, 5000)",
    ).run(saleId, pid);
    const migDir = path.join(process.cwd(), "database", "migrations");
    db.exec(fs.readFileSync(path.join(migDir, "0018_fifo_cost_layers.sql"), "utf-8"));
    db.exec("PRAGMA foreign_keys = ON;");
    const layer = db
      .prepare(
        "SELECT original_quantity AS o, remaining_quantity AS r, unit_cost_minor AS c, reason FROM inventory_layers WHERE product_id = ?",
      )
      .get(pid) as {
      o: number;
      r: number;
      c: number;
      reason: string;
    };
    expect(Number(layer.o)).toBe(20);
    expect(Number(layer.r)).toBe(20);
    expect(layer.c).toBe(1800);
    expect(layer.reason).toBe("opening");
    const item = db.prepare("SELECT cogs_minor FROM sale_items WHERE sale_id = ?").get(saleId) as {
      cogs_minor: number;
    };
    expect(item.cogs_minor).toBe(3600);
    db.close();
  });
});
