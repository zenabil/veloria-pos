// Veloria PoS — ADR-139 : « Modifier une vente » = annulation + panier de
// réédition. La facture d'origine reste tracée ; stock/couches/paiements sont
// restaurés par l'annulation existante.
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

import { createSaleAtomic, reopenSaleAtomic } from "../../electron/ipc/handlers/sales.repo";
import { expandSaleLine } from "../../src/application/sales/packaging-lines";

const NOW = "2026-10-26T10:00:00.000Z";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "sale-reopen.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  return db;
}

function seedProduct(db: DatabaseSync): number {
  db.prepare(
    `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at)
     VALUES ('p-reopen', 'Farine 5kg', 'PIECE', 8000, 10000, 10, 0, 'in_stock', 1, ?, ?)`,
  ).run(NOW, NOW);
  const pid = Number(
    (db.prepare("SELECT id FROM products WHERE uuid = 'p-reopen'").get() as { id: number }).id,
  );
  db.prepare(
    `INSERT INTO inventory_layers (uuid, product_id, original_quantity, remaining_quantity, unit_cost_minor, purchase_date, reason, created_at)
     VALUES ('layer-reopen', ?, 10, 10, 8000, '2026-10-01', 'opening', ?)`,
  ).run(pid, NOW);
  return pid;
}

function sale(pid: number, op: string, amountPaid = 20000): { saleId: number } {
  return createSaleAtomic({
    operationId: `op-${op}`,
    uuid: `uuid-${op}`,
    invoiceNumber: `FAC-${op}`,
    customerId: null,
    subtotalMinor: 20000,
    discountType: "none",
    discountValueMinor: 0,
    discountAmountMinor: 0,
    deliveryFeeMinor: 0,
    totalMinor: 20000,
    amountPaidMinor: amountPaid,
    remainingMinor: 20000 - amountPaid,
    paymentStatus: amountPaid === 20000 ? "paid" : "unpaid",
    paymentMethod: "cash",
    dueDate: null,
    lines: [
      {
        productId: pid,
        productName: "Farine 5kg",
        unitCode: "PIECE",
        originalUnitPriceMinor: 10000,
        unitPriceMinor: 10000,
        purchasePriceMinor: 8000,
        quantity: 2,
        billedTotalMinor: null,
        packagingId: null,
        unitFactor: 1,
      },
    ],
    lineTotals: [20000],
    now: NOW,
    allowNegativeStock: false,
  });
}

describe("Réédition d'une vente (ADR-139)", () => {
  let tmp: string;
  let db: DatabaseSync;
  let pid: number;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-reopen-"));
    db = openMigrated(tmp);
    (repoDb as { current: unknown; depth: number }).current = db;
    (repoDb as { current: unknown; depth: number }).depth = 0;
    pid = seedProduct(db);
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

  it("annule, restaure stock/couche/paiement et renvoie les lignes à rééditer", () => {
    const { saleId } = sale(pid, "reopen-1");
    expect(
      (db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as { quantity: number })
        .quantity,
    ).toBe(8);

    const draft = reopenSaleAtomic(saleId, NOW, "reopen-op-1");

    expect(draft.invoiceNumber).toBe("FAC-reopen-1");
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]).toMatchObject({
      productId: pid,
      productName: "Farine 5kg",
      quantity: 2,
      unitPriceMinor: 10000,
      billedTotalMinor: null,
      // Stock APRÈS l'annulation (10), pas le stock courant (8).
      stockQty: 10,
    });
    const saleRow = db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId) as {
      is_cancelled: number;
      amount_paid_minor: number;
    };
    expect(saleRow.is_cancelled).toBe(1);
    // Vente sans client : soldée (le miroir « reste = total » exigerait un
    // client crédit autorisé — garde 0051) ; l'encaissement est bien supprimé.
    expect(saleRow.amount_paid_minor).toBe(20000);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM sale_payments WHERE sale_id = ?").get(saleId),
    ).toEqual({ n: 0 });
    expect(
      (db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as { quantity: number })
        .quantity,
    ).toBe(10);
    expect(
      (
        db.prepare("SELECT remaining_quantity FROM inventory_layers WHERE id = 1").get() as {
          remaining_quantity: number;
        }
      ).remaining_quantity,
    ).toBe(10);
    const audit = db
      .prepare(
        "SELECT COUNT(*) AS n FROM audit_log WHERE event_type = 'sale.reopened' AND entity_id = ?",
      )
      .get(String(saleId)) as { n: number };
    expect(audit.n).toBe(1);
  });

  it("rejouer le même operationId renvoie le même panier sans re-annuler", () => {
    const { saleId } = sale(pid, "reopen-idem");
    const a = reopenSaleAtomic(saleId, NOW, "reopen-op-idem");
    const b = reopenSaleAtomic(saleId, NOW, "reopen-op-idem");
    expect(b).toEqual(a);
    expect(
      (db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as { quantity: number })
        .quantity,
    ).toBe(10);
  });

  it("refuse (sans annuler) une vente déjà retournée", () => {
    const { saleId } = sale(pid, "reopen-return");
    db.prepare(
      `INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at)
       VALUES ('ret-1', 'RET-1', ?, 'FAC-reopen-return', 10000, 'validated', ?, ?)`,
    ).run(saleId, NOW, NOW);
    expect(() => reopenSaleAtomic(saleId, NOW, "reopen-op-return")).toThrow(/retours/i);
    const row = db.prepare("SELECT is_cancelled FROM sales WHERE id = ?").get(saleId) as {
      is_cancelled: number;
    };
    expect(row.is_cancelled).toBe(0);
  });

  it("refuse (sans annuler) un produit archivé", () => {
    const { saleId } = sale(pid, "reopen-archive");
    db.prepare("UPDATE products SET is_active = 0 WHERE id = ?").run(pid);
    expect(() => reopenSaleAtomic(saleId, NOW, "reopen-op-archive")).toThrow(/archivé/i);
    const row = db.prepare("SELECT is_cancelled FROM sales WHERE id = ?").get(saleId) as {
      is_cancelled: number;
    };
    expect(row.is_cancelled).toBe(0);
  });

  it("reconstruit une ligne carton en unités de base sans changer le total", () => {
    db.prepare("UPDATE products SET quantity = 50, selling_price_minor = 1000 WHERE id = ?").run(
      pid,
    );
    db.prepare(
      `INSERT INTO inventory_layers (uuid, product_id, original_quantity, remaining_quantity, unit_cost_minor, purchase_date, reason, created_at)
       VALUES ('layer-carton', ?, 40, 40, 900, '2026-10-02', 'opening', ?)`,
    ).run(pid, NOW);
    db.prepare(
      `INSERT INTO product_packagings (product_id, label_fr, factor, selling_price_minor, purchase_price_minor, auto_carton_pricing, is_active, created_at, updated_at)
       VALUES (?, 'Carton 12', 12, 12000, 9600, 1, 1, ?, ?)`,
    ).run(pid, NOW, NOW);
    const packId = Number(
      (
        db.prepare("SELECT id FROM product_packagings WHERE product_id = ?").get(pid) as {
          id: number;
        }
      ).id,
    );
    const { saleId } = createSaleAtomic({
      operationId: "op-reopen-carton",
      uuid: "uuid-reopen-carton",
      invoiceNumber: "FAC-reopen-carton",
      customerId: null,
      subtotalMinor: 24000,
      discountType: "none",
      discountValueMinor: 0,
      discountAmountMinor: 0,
      deliveryFeeMinor: 0,
      totalMinor: 24000,
      amountPaidMinor: 24000,
      remainingMinor: 0,
      paymentStatus: "paid",
      paymentMethod: "cash",
      dueDate: null,
      lines: [
        {
          productId: pid,
          productName: "Farine 5kg",
          unitCode: "Carton 12",
          originalUnitPriceMinor: 12000,
          unitPriceMinor: 12000,
          purchasePriceMinor: 9600,
          quantity: 2,
          billedTotalMinor: null,
          packagingId: packId,
          unitFactor: 12,
        },
      ],
      lineTotals: [24000],
      now: NOW,
      allowNegativeStock: false,
    });

    const draft = reopenSaleAtomic(saleId, NOW, "reopen-op-carton");
    const line = draft.lines[0];
    expect(line).toMatchObject({
      quantity: 24,
      packagingId: packId,
      packagingFactor: 12,
      packagingSellingPriceMinor: 12000,
      packagingAutoCartonPricing: true,
      billedTotalMinor: null,
      stockQty: 50,
    });
    // Le panier ré-éclate en 2 cartons au tarif d'origine (total inchangé).
    const expanded = line == null ? [] : expandSaleLine(line);
    expect(expanded).toHaveLength(1);
    expect(expanded[0]).toMatchObject({ quantity: 2, unitFactor: 12, unitPriceMinor: 12000 });
  });

  it("reconstruit une ligne au montant saisi (verrouillée) à l'identique", () => {
    const { saleId } = createSaleAtomic({
      operationId: "op-reopen-amount",
      uuid: "uuid-reopen-amount",
      invoiceNumber: "FAC-reopen-amount",
      customerId: null,
      subtotalMinor: 3000,
      discountType: "none",
      discountValueMinor: 0,
      discountAmountMinor: 1,
      deliveryFeeMinor: 0,
      totalMinor: 2999,
      amountPaidMinor: 2999,
      remainingMinor: 0,
      paymentStatus: "paid",
      paymentMethod: "cash",
      dueDate: null,
      lines: [
        {
          productId: pid,
          productName: "Farine 5kg",
          unitCode: "PIECE",
          originalUnitPriceMinor: 1000,
          unitPriceMinor: 1000,
          purchasePriceMinor: 800,
          quantity: 3,
          billedTotalMinor: 2999,
          packagingId: null,
          unitFactor: 1,
        },
      ],
      lineTotals: [2999],
      now: NOW,
      allowNegativeStock: false,
    });
    const draft = reopenSaleAtomic(saleId, NOW, "reopen-op-amount");
    expect(draft.lines[0]).toMatchObject({ quantity: 3, billedTotalMinor: 2999 });
  });
});
