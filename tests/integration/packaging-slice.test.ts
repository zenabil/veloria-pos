// Veloria PoS — Slice conditionnement : vente carton/pièce, stock en unités de
// base, FIFO exact, retours dans l'unité vendue et achat en carton.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as unknown, depth: 0 }));

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

import { createSaleAtomic, type SaleLineInput } from "../../electron/ipc/handlers/sales.repo";
import { receiveStockAtomic } from "../../electron/ipc/handlers/inventory.repo";
import {
  createReturnAtomic,
  getReturnableIntakeItems,
  getReturnableSaleItems,
} from "../../electron/ipc/handlers/returns.repo";

const NOW = "2026-10-25T10:00:00.000Z";
const OP_SALE = "11111111-1111-4111-8111-111111111111";
const OP_SALE_COPY = "11111111-1111-4111-8111-111111111112";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "packaging.sqlite"));
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

function seedProduct(
  db: DatabaseSync,
  id: number,
  name: string,
  qty: number,
  selling: number,
  purchase: number,
): void {
  db.prepare(
    `INSERT INTO products (id, uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at)
     VALUES (?, ?, ?, 'PIECE', ?, ?, ?, 0, ?, ?, ?)`,
  ).run(
    id,
    `uuid-p${id}`,
    name,
    purchase,
    selling,
    qty,
    qty > 0 ? "in_stock" : "out_of_stock",
    NOW,
    NOW,
  );
  if (qty > 0) {
    db.prepare(
      `INSERT INTO inventory_layers (uuid, product_id, original_quantity, remaining_quantity, unit_cost_minor, purchase_date, reason, created_at)
       VALUES (?, ?, ?, ?, ?, '2026-10-01', 'opening', ?)`,
    ).run(`layer-p${id}`, id, qty, qty, purchase, NOW);
    db.prepare(
      `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, reason, created_at)
       VALUES (?, ?, 'intake_in', ?, ?, ?, 'product_create', 'Stock initial test', ?)`,
    ).run(`mov-p${id}`, id, qty, qty, purchase, NOW);
  }
}

function seedPackaging(
  db: DatabaseSync,
  productId: number,
  factor: number,
  cartonSelling: number,
  cartonPurchase: number,
  active = 1,
): number {
  const r = db
    .prepare(
      `INSERT INTO product_packagings (product_id, label_fr, factor, selling_price_minor, purchase_price_minor, auto_carton_pricing, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(productId, `Carton de ${factor}`, factor, cartonSelling, cartonPurchase, active, NOW, NOW);
  return Number(r.lastInsertRowid);
}

function saleLines(packagingId: number): SaleLineInput[] {
  return [
    {
      productId: 1,
      productName: "Coca 1L",
      unitCode: "Carton de 12",
      originalUnitPriceMinor: 24000,
      unitPriceMinor: 22000,
      purchasePriceMinor: 18000,
      quantity: 1,
      billedTotalMinor: null,
      packagingId,
      unitFactor: 12,
    },
    {
      productId: 1,
      productName: "Coca 1L",
      unitCode: "PIÈCE",
      originalUnitPriceMinor: 2000,
      unitPriceMinor: 2000,
      purchasePriceMinor: 1500,
      quantity: 3,
      billedTotalMinor: null,
      packagingId: null,
      unitFactor: 1,
    },
  ];
}

function saleInput(over: Record<string, unknown> = {}): Parameters<typeof createSaleAtomic>[0] {
  return {
    operationId: OP_SALE,
    uuid: "sale-uuid",
    invoiceNumber: "FAC-2026-00001",
    customerId: null,
    subtotalMinor: 30000,
    discountType: "none",
    discountValueMinor: 0,
    discountAmountMinor: 2000,
    deliveryFeeMinor: 0,
    totalMinor: 28000,
    amountPaidMinor: 28000,
    remainingMinor: 0,
    paymentStatus: "paid",
    paymentMethod: "cash",
    dueDate: null,
    lines: saleLines(1),
    lineTotals: [22000, 6000],
    now: NOW,
    allowNegativeStock: false,
    ...over,
  };
}

describe("Packaging slice (production repos)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-packaging-"));
    db = openMigrated(tmp);
    (repoDb as { current: unknown; depth: number }).current = db;
    (repoDb as { current: unknown; depth: number }).depth = 0;
    seedProduct(db, 1, "Coca 1L", 100, 2000, 1500);
    seedPackaging(db, 1, 12, 22000, 18000);
  });

  afterEach(() => {
    (repoDb as { current: unknown; depth: number }).current = null;
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("vend 1 carton + 3 pièces, déduit 15 unités de base et fige le COGS FIFO", () => {
    const res = createSaleAtomic(saleInput());
    expect(res.saleId).toBeGreaterThan(0);

    const product = db.prepare("SELECT quantity FROM products WHERE id = 1").get() as {
      quantity: number;
    };
    expect(Number(product.quantity)).toBe(85);

    const items = db
      .prepare(
        "SELECT quantity, unit_factor, packaging_id, unit_price_minor, purchase_price_minor, cogs_minor FROM sale_items ORDER BY id",
      )
      .all() as {
      quantity: number;
      unit_factor: number;
      packaging_id: number | null;
      unit_price_minor: number;
      purchase_price_minor: number;
      cogs_minor: number;
    }[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      quantity: 1,
      unit_factor: 12,
      packaging_id: 1,
      unit_price_minor: 22000,
      purchase_price_minor: 18000,
    });
    expect(items[1]).toMatchObject({
      quantity: 3,
      unit_factor: 1,
      packaging_id: null,
      unit_price_minor: 2000,
      purchase_price_minor: 1500,
    });
    expect(items.reduce((a, i) => a + i.quantity * i.unit_factor, 0)).toBe(15);
    expect(items.reduce((a, i) => a + i.cogs_minor, 0)).toBe(15 * 1500);

    const movement = db
      .prepare(
        "SELECT COALESCE(SUM(quantity_delta),0) AS q FROM stock_movements WHERE related_entity_type = 'sale'",
      )
      .get() as { q: number };
    expect(Number(movement.q)).toBe(-15);
    const layer = db
      .prepare("SELECT remaining_quantity FROM inventory_layers WHERE product_id = 1")
      .get() as { remaining_quantity: number };
    expect(Number(layer.remaining_quantity)).toBe(85);
    const consumed = db
      .prepare("SELECT COALESCE(SUM(quantity),0) AS q FROM sale_fifo_consumption")
      .get() as { q: number };
    expect(Number(consumed.q)).toBe(15);
    const sale = db.prepare("SELECT total_minor FROM sales WHERE id = ?").get(res.saleId) as {
      total_minor: number;
    };
    expect(sale.total_minor).toBe(28000);
  });

  it("double-submit même operationId = une seule vente, stock déduit une fois", () => {
    const first = createSaleAtomic(saleInput());
    const second = createSaleAtomic(saleInput({ uuid: "sale-uuid-2" }));
    expect(second.saleId).toBe(first.saleId);
    expect(second.invoiceNumber).toBe(first.invoiceNumber);
    const product = db.prepare("SELECT quantity FROM products WHERE id = 1").get() as {
      quantity: number;
    };
    expect(Number(product.quantity)).toBe(85);
    const sales = db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number };
    expect(sales.c).toBe(1);
  });

  it("refuse un facteur ou un prix carton forgé par le renderer", () => {
    expect(() =>
      createSaleAtomic(
        saleInput({
          operationId: OP_SALE_COPY,
          lines: saleLines(1).map((l) => (l.packagingId != null ? { ...l, unitFactor: 6 } : l)),
        }),
      ),
    ).toThrow(/Taille du carton/);
    expect(() =>
      createSaleAtomic(
        saleInput({
          operationId: "11111111-1111-4111-8111-111111111113",
          lines: saleLines(1).map((l) =>
            l.packagingId != null ? { ...l, unitPriceMinor: 21000 } : l,
          ),
        }),
      ),
    ).toThrow(/Tarif carton/);
    const count = db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number };
    expect(count.c).toBe(0);

    db.prepare("UPDATE product_packagings SET is_active = 0 WHERE id = 1").run();
    expect(() =>
      createSaleAtomic(saleInput({ operationId: "11111111-1111-4111-8111-111111111114" })),
    ).toThrow(/Conditionnement indisponible/);
  });

  it("rollback intégral si le stock d'un carton est insuffisant", () => {
    db.prepare("UPDATE products SET quantity = 5 WHERE id = 1").run();
    db.prepare("UPDATE inventory_layers SET remaining_quantity = 5 WHERE product_id = 1").run();
    expect(() => createSaleAtomic(saleInput())).toThrow(/Stock insuffisant/);
    const sales = db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number };
    expect(sales.c).toBe(0);
    const items = db.prepare("SELECT COUNT(*) AS c FROM sale_items").get() as { c: number };
    expect(items.c).toBe(0);
    const product = db.prepare("SELECT quantity FROM products WHERE id = 1").get() as {
      quantity: number;
    };
    expect(Number(product.quantity)).toBe(5);
    const layers = db
      .prepare("SELECT remaining_quantity FROM inventory_layers WHERE product_id = 1")
      .get() as { remaining_quantity: number };
    expect(Number(layers.remaining_quantity)).toBe(5);
  });

  it("retourne un carton complet puis les pièces, en unités de base", () => {
    const sale = createSaleAtomic(saleInput());
    let eligible = getReturnableSaleItems(sale.saleId).items as {
      unit_factor: number;
      eligible: number;
      id: number;
    }[];
    expect(eligible.find((i) => i.unit_factor === 12)?.eligible).toBe(1);
    expect(eligible.find((i) => i.unit_factor === 1)?.eligible).toBe(3);

    const returned = createReturnAtomic({
      operationId: "22222222-2222-4222-8222-222222222221",
      originalSaleId: sale.saleId,
      items: [{ productId: 1, quantity: 1, restocked: true, condition: "good", unitFactor: 12 }],
      refundMinor: 22000,
      creditMinor: 0,
      refundMethod: "cash",
      reason: "Test carton",
      notes: null,
      createdAt: NOW,
      now: NOW,
    });
    expect(returned.totalReturnMinor).toBe(22000);
    let stock = db.prepare("SELECT quantity FROM products WHERE id = 1").get() as {
      quantity: number;
    };
    expect(Number(stock.quantity)).toBe(97);
    const retItem = db
      .prepare(
        "SELECT quantity, unit_factor, line_total_minor FROM return_items WHERE return_id = ?",
      )
      .get(returned.id) as { quantity: number; unit_factor: number; line_total_minor: number };
    expect(retItem).toEqual({ quantity: 1, unit_factor: 12, line_total_minor: 22000 });
    const move = db
      .prepare(
        "SELECT quantity_delta FROM stock_movements WHERE related_entity_type = 'return' ORDER BY id DESC LIMIT 1",
      )
      .get() as { quantity_delta: number };
    expect(Number(move.quantity_delta)).toBe(12);

    // Retour partiel d'un carton refusé.
    expect(() =>
      createReturnAtomic({
        operationId: "22222222-2222-4222-8222-222222222222",
        originalSaleId: sale.saleId,
        items: [
          { productId: 1, quantity: 0.5, restocked: true, condition: "good", unitFactor: 12 },
        ],
        refundMinor: 0,
        creditMinor: 0,
        refundMethod: null,
        reason: "Test",
        notes: null,
        createdAt: NOW,
        now: NOW,
      }),
    ).toThrow(/cartons complets/);

    const pieces = createReturnAtomic({
      operationId: "22222222-2222-4222-8222-222222222223",
      originalSaleId: sale.saleId,
      items: [{ productId: 1, quantity: 3, restocked: true, condition: "good", unitFactor: 1 }],
      refundMinor: 6000,
      creditMinor: 0,
      refundMethod: "cash",
      reason: "Test pièces",
      notes: null,
      createdAt: NOW,
      now: NOW,
    });
    expect(pieces.totalReturnMinor).toBe(6000);
    stock = db.prepare("SELECT quantity FROM products WHERE id = 1").get() as {
      quantity: number;
    };
    expect(Number(stock.quantity)).toBe(100);
    eligible = getReturnableSaleItems(sale.saleId).items as {
      unit_factor: number;
      eligible: number;
      id: number;
    }[];
    expect(eligible.every((i) => i.eligible === 0)).toBe(true);
  });

  it("achète 3 cartons (2 pièces abîmées) : 34 unités de base, couches exactes", () => {
    seedProduct(db, 3, "Eau 5L", 0, 2500, 1200);
    const packagingId = seedPackaging(db, 3, 12, 26000, 22000);
    const res = receiveStockAtomic({
      supplierId: null,
      invoiceNumber: "F-1",
      invoiceDate: "2026-10-25",
      shippingMinor: 1000,
      notes: null,
      lines: [
        {
          productId: 3,
          productName: "Eau 5L",
          quantityReceived: 3,
          quantityDamaged: 2,
          purchasePriceMinor: 22000,
          sellingPriceMinor: null,
          packagingId,
          unitFactor: 12,
        },
      ],
      operationId: "33333333-3333-4333-8333-333333333331",
      now: NOW,
    });
    expect(res.totalMinor).toBe(67000);
    const product = db
      .prepare(
        "SELECT quantity, purchase_price_minor, selling_price_minor FROM products WHERE id = 3",
      )
      .get() as { quantity: number; purchase_price_minor: number; selling_price_minor: number };
    expect(Number(product.quantity)).toBe(34);
    // Coût rendu : (3 × 22 000 + 1 000 de livraison) / 34 unités nettes = 1 971.
    expect(product.purchase_price_minor).toBe(1971);
    expect(product.selling_price_minor).toBe(2500);

    const item = db
      .prepare(
        "SELECT quantity_received, quantity_damaged, unit_factor, packaging_id, line_total_minor FROM stock_intake_items WHERE stock_intake_id = ?",
      )
      .get(res.intakeId) as {
      quantity_received: number;
      quantity_damaged: number;
      unit_factor: number;
      packaging_id: number | null;
      line_total_minor: number;
    };
    expect(item).toEqual({
      quantity_received: 3,
      quantity_damaged: 2,
      unit_factor: 12,
      packaging_id: packagingId,
      line_total_minor: 67000,
    });
    const layers = db
      .prepare(
        "SELECT COALESCE(SUM(remaining_quantity * unit_cost_minor),0) AS v, COALESCE(SUM(remaining_quantity),0) AS q FROM inventory_layers WHERE product_id = 3",
      )
      .get() as { v: number; q: number };
    expect(Number(layers.q)).toBe(34);
    expect(Math.round(Number(layers.v))).toBe(67000);
    const move = db
      .prepare(
        "SELECT quantity_delta FROM stock_movements WHERE related_entity_type = 'intake' ORDER BY id DESC LIMIT 1",
      )
      .get() as { quantity_delta: number };
    expect(Number(move.quantity_delta)).toBe(34);

    // Retour fournisseur : l'éligible est en unités de base (36 reçues, dont
    // 2 abîmées — retournables au fournisseur), pas en cartons. Le stock
    // disponible (34) reste la borne de la déduction.
    const intakeItems = getReturnableIntakeItems(res.intakeId).items as { eligible: number }[];
    expect(intakeItems[0]?.eligible).toBe(36);

    // Facteur forgé : refusé (relu en DB, le conditionnement actif reste le 12).
    expect(() =>
      receiveStockAtomic({
        supplierId: null,
        invoiceNumber: "F-2",
        invoiceDate: "2026-10-25",
        shippingMinor: 0,
        notes: null,
        lines: [
          {
            productId: 3,
            productName: "Eau 5L",
            quantityReceived: 1,
            quantityDamaged: 0,
            purchasePriceMinor: 22000,
            sellingPriceMinor: null,
            packagingId,
            unitFactor: 6,
          },
        ],
        operationId: "33333333-3333-4333-8333-333333333332",
        now: NOW,
      }),
    ).toThrow(/Taille du carton/);
  });
});
