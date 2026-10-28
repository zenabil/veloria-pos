// Veloria PoS — Caisse : coût de référence FIFO et audit sous-coût.
// Le dernier prix d'achat ne doit jamais masquer les couches plus anciennes :
// le coût affiché au prix est la prochaine couche FIFO, et l'audit
// « vente sous coût » compare le total facturé au COGS FIFO réel.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null, depth: 0 }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const state = repoDb as {
      current: {
        prepare: (sql: string) => {
          all: (...p: unknown[]) => unknown[];
          get: (...p: unknown[]) => unknown;
          run: (...p: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
        };
        exec: (sql: string) => void;
      } | null;
      depth: number;
    };
    const db = state.current;
    if (!db) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => db.prepare(sql),
      get inTransaction(): boolean {
        return state.depth > 0;
      },
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          if (state.depth > 0) {
            db.exec("SAVEPOINT nested;");
            state.depth += 1;
            try {
              const out = fn();
              db.exec("RELEASE nested;");
              state.depth -= 1;
              return out;
            } catch (err) {
              try {
                db.exec("ROLLBACK TO nested;");
                db.exec("RELEASE nested;");
              } catch {
                /* best-effort */
              }
              state.depth -= 1;
              throw err;
            }
          }
          db.exec("BEGIN;");
          state.depth = 1;
          try {
            const out = fn();
            db.exec("COMMIT;");
            state.depth = 0;
            return out;
          } catch (err) {
            try {
              db.exec("ROLLBACK;");
            } catch {
              /* best-effort */
            }
            state.depth = 0;
            throw err;
          }
        },
    };
  },
}));

vi.mock("../../electron/services/logger", () => ({
  log: () => {},
  initLogger: () => "",
  getLogFile: () => "",
}));

import { createSaleAtomic } from "../../electron/ipc/handlers/sales.repo";
import { receiveStockAtomic } from "../../electron/ipc/handlers/inventory.repo";
import { searchProducts } from "../../electron/ipc/handlers/products.repo";

const NOW = "2026-10-25T10:00:00.000Z";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "fifo-sale.sqlite"));
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

function seedProduct(db: DatabaseSync): number {
  db.prepare(
    `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at)
     VALUES ('p-fifo-sale', 'FIFO Prod', 'PIECE', 2000, 3000, 5, 0, 'in_stock', 1, ?, ?)`,
  ).run(NOW, NOW);
  const pid = Number(
    (db.prepare("SELECT id FROM products WHERE uuid = 'p-fifo-sale'").get() as { id: number }).id,
  );
  db.prepare(
    `INSERT INTO inventory_layers (uuid, product_id, original_quantity, remaining_quantity, unit_cost_minor, purchase_date, reason, created_at)
     VALUES ('layer-old', ?, 5, 5, 2000, '2026-10-01', 'opening', ?)`,
  ).run(pid, NOW);
  return pid;
}

function sale(pid: number, qty: number, unitPrice: number, op: string): { saleId: number } {
  const total = qty * unitPrice;
  const res = createSaleAtomic({
    operationId: `op-${op}`,
    uuid: `uuid-${op}`,
    invoiceNumber: `FAC-${op}`,
    customerId: null,
    subtotalMinor: total,
    discountType: "none",
    discountValueMinor: 0,
    discountAmountMinor: 0,
    deliveryFeeMinor: 0,
    totalMinor: total,
    amountPaidMinor: total,
    remainingMinor: 0,
    paymentStatus: "paid",
    paymentMethod: "cash",
    dueDate: null,
    lines: [
      {
        productId: pid,
        productName: "FIFO Prod",
        unitCode: "PIECE",
        originalUnitPriceMinor: 3000,
        unitPriceMinor: unitPrice,
        purchasePriceMinor: 2500,
        quantity: qty,
        billedTotalMinor: null,
        packagingId: null,
        unitFactor: 1,
      },
    ],
    lineTotals: [total],
    now: NOW,
    allowNegativeStock: false,
  });
  return res;
}

function belowCostLines(db: DatabaseSync, saleId: number): unknown[] {
  const row = db
    .prepare(
      `SELECT details_json FROM audit_log WHERE event_type = 'sale.created' AND entity_id = ?`,
    )
    .get(String(saleId)) as { details_json: string };
  return (JSON.parse(row.details_json) as { belowCostLines: unknown[] }).belowCostLines;
}

describe("Coût FIFO en caisse", () => {
  let tmp: string;
  let db: DatabaseSync;
  let pid: number;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-fifo-sale-"));
    db = openMigrated(tmp);
    repoDb.current = db;
    repoDb.depth = 0;
    pid = seedProduct(db);
  });

  afterEach(() => {
    repoDb.current = null;
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("expose la prochaine couche FIFO, pas le dernier prix d'achat", () => {
    receiveStockAtomic({
      supplierId: null,
      invoiceNumber: null,
      invoiceDate: "2026-10-20",
      shippingMinor: 0,
      notes: null,
      lines: [
        {
          productId: pid,
          productName: "FIFO Prod",
          quantityReceived: 5,
          quantityDamaged: 0,
          purchasePriceMinor: 2500,
          sellingPriceMinor: null,
        },
      ],
      operationId: "11111111-1111-4111-8111-111111111111",
      now: NOW,
    });

    const product = db
      .prepare("SELECT quantity, purchase_price_minor FROM products WHERE id = ?")
      .get(pid) as { quantity: number; purchase_price_minor: number };
    expect(Number(product.quantity)).toBe(10);
    expect(product.purchase_price_minor).toBe(2500);

    const found = searchProducts({ query: "FIFO", page: 1, pageSize: 10 });
    expect(found.rows[0]?.fifo_next_unit_cost_minor).toBe(2000);
    expect(found.rows[0]?.purchase_price_minor).toBe(2500);

    sale(pid, 2, 2100, "A");
    const after = searchProducts({ query: "FIFO", page: 1, pageSize: 10 });
    expect(after.rows[0]?.fifo_next_unit_cost_minor).toBe(2000);
  });

  it("ne signale pas sous coût quand la couche ancienne couvre la vente", () => {
    receiveStockAtomic({
      supplierId: null,
      invoiceNumber: null,
      invoiceDate: "2026-10-20",
      shippingMinor: 0,
      notes: null,
      lines: [
        {
          productId: pid,
          productName: "FIFO Prod",
          quantityReceived: 5,
          quantityDamaged: 0,
          purchasePriceMinor: 2500,
          sellingPriceMinor: null,
        },
      ],
      operationId: "22222222-2222-4222-8222-222222222222",
      now: NOW,
    });

    const res = sale(pid, 2, 2100, "B");
    const item = db
      .prepare("SELECT cogs_minor, purchase_price_minor FROM sale_items WHERE sale_id = ?")
      .get(res.saleId) as { cogs_minor: number; purchase_price_minor: number };
    expect(item.cogs_minor).toBe(4000);
    expect(item.purchase_price_minor).toBe(2000);
    expect(belowCostLines(db, res.saleId)).toEqual([]);
  });

  it("audite le COGS FIFO réel quand la vente traverse les couches", () => {
    receiveStockAtomic({
      supplierId: null,
      invoiceNumber: null,
      invoiceDate: "2026-10-20",
      shippingMinor: 0,
      notes: null,
      lines: [
        {
          productId: pid,
          productName: "FIFO Prod",
          quantityReceived: 5,
          quantityDamaged: 0,
          purchasePriceMinor: 2500,
          sellingPriceMinor: null,
        },
      ],
      operationId: "33333333-3333-4333-8333-333333333333",
      now: NOW,
    });

    sale(pid, 2, 2100, "C");
    const res = sale(pid, 8, 2100, "D");
    const item = db
      .prepare("SELECT cogs_minor, purchase_price_minor FROM sale_items WHERE sale_id = ?")
      .get(res.saleId) as { cogs_minor: number; purchase_price_minor: number };
    expect(item.cogs_minor).toBe(3 * 2000 + 5 * 2500);
    expect(item.purchase_price_minor).toBe(2313);

    const lines = belowCostLines(db, res.saleId) as {
      productId: number;
      name: string;
      final: number;
      purchase: number;
    }[];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      productId: pid,
      name: "FIFO Prod",
      final: 2100,
      purchase: 2313,
    });

    // Le prix de référence du produit reste le dernier prix d'achat (ADR-021).
    const product = db
      .prepare("SELECT purchase_price_minor FROM products WHERE id = ?")
      .get(pid) as { purchase_price_minor: number };
    expect(product.purchase_price_minor).toBe(2500);
  });
});
