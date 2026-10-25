// Veloria PoS — E-23 / E-24 / E-25 : avoirs, dette du client et annulation de
// vente (exécutés sur le repo RÉEL, base migrée temporaire).
//
// E-23 : un avoir supérieur au solde du client ne doit PLUS provoquer un
//        ABORT technique (trigger 0023) : le solde est plafonné et l'excédent
//        est reporté (crédit client en cours).
// E-24 : un avoir réduit AUSSI le reste à payer du sien de vente ⇒ le compte
//        client et le document ne peuvent plus diverger.
// E-25 : l'annulation d'une vente encaisée annule ENCORE l'encaissement
//        (la promesse UI « l'encaissement annulé »).
// E-26 : une correction de quantité depuis la fiche produit journalise un
//        mouvement de stock.
// E-27 : les frais de livraison sont capitalisés dans le coût des couches.
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

import { createReturnAtomic } from "../../electron/ipc/handlers/returns.repo";
import { cancelSaleAtomic } from "../../electron/ipc/handlers/sales.repo";
import { updateProduct } from "../../electron/ipc/handlers/products.repo";
import { receiveStockAtomic } from "../../electron/ipc/handlers/inventory.repo";

const NOW = "2026-10-19T09:00:00.000Z";

describe("E-23/E-24/E-25/E-26/E-27 — avoirs, dette, annulation, journal, fret", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-w1-"));
    db = new DatabaseSync(path.join(tmp, "w1.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
    (repoDb as { current: unknown; depth: number }).current = db;
    (repoDb as { current: unknown; depth: number }).depth = 0;
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

  function seedCustomer(outstanding: number, creditAllowed = 1): number {
    const r = db
      .prepare(
        `INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, credit_limit_minor, outstanding_balance_minor, debt_status, is_over_limit, created_at, updated_at)
         VALUES (?, 'Test', 'Client', 'test client', ?, 1000000, ?, 'due', 0, ?, ?)`,
      )
      .run(crypto.randomUUID(), creditAllowed, outstanding, NOW, NOW);
    return Number(r.lastInsertRowid);
  }

  function seedSale(opts: { customerId: number | null; total: number; paid: number }): number {
    const r = db
      .prepare(
        `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, discount_type, discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, payment_method, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'none', 0, 0, 0, ?, ?, ?, ?, 'cash', ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        `FAC-W1-${crypto.randomUUID().slice(0, 8)}`,
        opts.customerId,
        opts.total,
        opts.total,
        opts.paid,
        opts.total - opts.paid,
        opts.paid >= opts.total ? "paid" : "partial",
        NOW,
        NOW,
      );
    const saleId = Number(r.lastInsertRowid);
    // Ligne de vente : un retour doit s'adosser à une ligne VENDUE.
    const p = db
      .prepare(
        `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at)
         VALUES (?, 'Article', 'PIECE', 100, 100, 10, 0, 'in_stock', ?, ?)`,
      )
      .run(crypto.randomUUID(), NOW, NOW);
    const productId = Number(p.lastInsertRowid);
    db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_code, original_unit_price_minor, unit_price_minor, purchase_price_minor, quantity, line_total_minor, discount_minor)
       VALUES (?, ?, 'Article', 'PIECE', ?, ?, 100, 2, ?, 0)`,
    ).run(saleId, productId, opts.total, opts.total, opts.total);
    return saleId;
  }

  function productOf(saleId: number): number {
    const row = db.prepare("SELECT product_id FROM sale_items WHERE sale_id = ?").get(saleId) as {
      product_id: number;
    };
    return row.product_id;
  }

  it("E-23 : avoir > solde du client ⇒ solde plafonné, excédent reporté (pas d'ABORT)", () => {
    const customerId = seedCustomer(1000);
    const saleId = seedSale({ customerId, total: 5000, paid: 0 });
    const res = createReturnAtomic({
      operationId: crypto.randomUUID(),
      originalSaleId: saleId,
      items: [{ productId: productOf(saleId), quantity: 1, restocked: false, condition: "good" }],
      refundMinor: 0,
      // Avoir SUPÉRIEUR au solde (1000) : le cas « vente payée + avoir ».
      creditMinor: 2500,
      refundMethod: null,
      reason: "Test avoir",
      notes: null,
      createdAt: NOW,
      now: NOW,
    });
    expect(res.creditExcessMinor).toBe(1500);
    const cust = db
      .prepare("SELECT outstanding_balance_minor FROM customers WHERE id = ?")
      .get(customerId) as { outstanding_balance_minor: number };
    // Solde ramené à 0 (jamais négatif ⇒ jamais d'ABORT du trigger 0023).
    expect(cust.outstanding_balance_minor).toBe(0);
  });

  it("E-24 : l'avoir réduit le reste du sien de vente (source de vérité unique)", () => {
    const customerId = seedCustomer(5000);
    const saleId = seedSale({ customerId, total: 5000, paid: 0 });
    createReturnAtomic({
      operationId: crypto.randomUUID(),
      originalSaleId: saleId,
      items: [{ productId: productOf(saleId), quantity: 1, restocked: false, condition: "good" }],
      refundMinor: 0,
      creditMinor: 2000,
      refundMethod: null,
      reason: "Test avoir",
      notes: null,
      createdAt: NOW,
      now: NOW,
    });
    const sale = db
      .prepare(
        "SELECT total_minor, amount_paid_minor, remaining_balance_minor FROM sales WHERE id = ?",
      )
      .get(saleId) as {
      total_minor: number;
      amount_paid_minor: number;
      remaining_balance_minor: number;
    };
    // 5000 − 2000 (avoir) = 3000 à payer, et le CHECK reste respecté.
    expect(sale.remaining_balance_minor).toBe(3000);
    expect(sale.amount_paid_minor).toBe(2000);
    expect(sale.remaining_balance_minor).toBe(sale.total_minor - sale.amount_paid_minor);
    const cust = db
      .prepare("SELECT outstanding_balance_minor FROM customers WHERE id = ?")
      .get(customerId) as { outstanding_balance_minor: number };
    // Compte client ET document : la même valeur (plus de divergence).
    expect(cust.outstanding_balance_minor).toBe(3000);
  });

  it("garde : annulation refusée tant qu'un retour non annulé existe", () => {
    const customerId = seedCustomer(0);
    const saleId = seedSale({ customerId, total: 5000, paid: 0 });
    createReturnAtomic({
      operationId: crypto.randomUUID(),
      originalSaleId: saleId,
      items: [{ productId: productOf(saleId), quantity: 1, restocked: true, condition: "good" }],
      refundMinor: 0,
      creditMinor: 0,
      refundMethod: null,
      reason: "Garde",
      notes: null,
      createdAt: NOW,
      now: NOW,
    });
    expect(() => cancelSaleAtomic(saleId, NOW, crypto.randomUUID())).toThrow(/retours/);
    const sale = db.prepare("SELECT is_cancelled FROM sales WHERE id = ?").get(saleId) as {
      is_cancelled: number;
    };
    expect(sale.is_cancelled).toBe(0);
  });

  it("garde : retour refusé sur une vente annulée (contrôle main, pas UI)", () => {
    const customerId = seedCustomer(0);
    const saleId = seedSale({ customerId, total: 5000, paid: 5000 });
    cancelSaleAtomic(saleId, NOW, crypto.randomUUID());
    expect(() =>
      createReturnAtomic({
        operationId: crypto.randomUUID(),
        originalSaleId: saleId,
        items: [{ productId: productOf(saleId), quantity: 1, restocked: false, condition: "good" }],
        refundMinor: 0,
        creditMinor: 0,
        refundMethod: null,
        reason: "Garde",
        notes: null,
        createdAt: NOW,
        now: NOW,
      }),
    ).toThrow(/annulée/);
  });

  it("E-25 : annuler une vente encaisée supprime l'encaissement et remet le solde", () => {
    // Flux réel : la vente (10000, encaissé 4000) porte le solde client à
    // `remaining` = 6000 (un encaissement ne touche jamais le solde).
    const customerId = seedCustomer(6000);
    const saleId = seedSale({ customerId, total: 10000, paid: 4000 });
    db.prepare(
      `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at)
       VALUES (?, ?, ?, 4000, 'cash', ?, ?)`,
    ).run(crypto.randomUUID(), saleId, customerId, NOW, NOW);

    cancelSaleAtomic(saleId, NOW, crypto.randomUUID());

    const payments = Number(
      (
        db.prepare("SELECT COUNT(*) AS c FROM sale_payments WHERE sale_id = ?").get(saleId) as {
          c: number;
        }
      ).c,
    );
    expect(payments).toBe(0);
    const sale = db
      .prepare(
        "SELECT is_cancelled, amount_paid_minor, remaining_balance_minor, payment_status FROM sales WHERE id = ?",
      )
      .get(saleId) as {
      is_cancelled: number;
      amount_paid_minor: number;
      remaining_balance_minor: number;
      payment_status: string;
    };
    expect(sale.is_cancelled).toBe(1);
    expect(sale.amount_paid_minor).toBe(0);
    expect(sale.remaining_balance_minor).toBe(10000);
    expect(sale.payment_status).toBe("unpaid");
    // Le solde du client est rendu (6000 non encaissés restitués).
    const cust = db
      .prepare("SELECT outstanding_balance_minor FROM customers WHERE id = ?")
      .get(customerId) as { outstanding_balance_minor: number };
    expect(cust.outstanding_balance_minor).toBe(0);
  });

  it("E-26 : correction de quantité ⇒ mouvement de stock journalisé", () => {
    const p = db
      .prepare(
        `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at)
         VALUES (?, 'Article', 'PIECE', 100, 200, 10, 0, 'in_stock', ?, ?)`,
      )
      .run(crypto.randomUUID(), NOW, NOW);
    const productId = Number(p.lastInsertRowid);
    updateProduct({
      id: productId,
      name: "Article",
      categoryId: null,
      unitCode: "PIECE",
      purchasePriceMinor: 100,
      sellingPriceMinor: 200,
      quantity: 14,
      minStockLevel: 0,
      maxStockLevel: 0,
      expirationDate: null,
      supplierId: null,
      barcodes: [],
      now: NOW,
    });
    const moves = db
      .prepare(
        "SELECT movement_type, quantity_delta, reason FROM stock_movements WHERE product_id = ?",
      )
      .all(productId) as { movement_type: string; quantity_delta: number; reason: string }[];
    expect(moves).toHaveLength(1);
    expect(moves[0]?.movement_type).toBe("adjust_in");
    expect(moves[0]?.quantity_delta).toBe(4);
    expect(moves[0]?.reason).toBe("Correction manuelle quantité");
  });

  it("E-27 : les frais de livraison sont capitalisés dans le coût des couches", () => {
    const p = db
      .prepare(
        `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at)
         VALUES (?, 'Article', 'PIECE', 1000, 2000, 0, 0, 'out_of_stock', ?, ?)`,
      )
      .run(crypto.randomUUID(), NOW, NOW);
    const productId = Number(p.lastInsertRowid);
    receiveStockAtomic({
      supplierId: null,
      invoiceNumber: "FR-1",
      invoiceDate: "2026-10-19",
      // 500 de fret sur une ligne de 2000 (1000 × 2) ⇒ coût rendu 1250/unité.
      shippingMinor: 500,
      notes: null,
      lines: [
        {
          productId,
          productName: "Article",
          quantityReceived: 2,
          quantityDamaged: 0,
          purchasePriceMinor: 1000,
          sellingPriceMinor: 2000,
        },
      ],
      operationId: crypto.randomUUID(),
      now: NOW,
    });
    const layer = db
      .prepare(
        "SELECT unit_cost_minor, remaining_quantity FROM inventory_layers WHERE product_id = ?",
      )
      .get(productId) as { unit_cost_minor: number; remaining_quantity: number };
    expect(layer.unit_cost_minor).toBe(1250);
    const item = db
      .prepare("SELECT landing_cost_minor FROM stock_intake_items WHERE product_id = ?")
      .get(productId) as { landing_cost_minor: number };
    expect(item.landing_cost_minor).toBe(1250);
  });
});
