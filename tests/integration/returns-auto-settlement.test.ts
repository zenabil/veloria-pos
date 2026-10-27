// Veloria PoS — Politique de retour 0055 : la dette d'abord, les espèces
// seulement pour l'excédent. Base migrée temporaire, repo RÉEL.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as unknown, depth: 0 }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getLastIntegrityResult: () => null,
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

import {
  createReturnAtomic,
  getReturnableSaleItems,
} from "../../electron/ipc/handlers/returns.repo";
import { createDailyClosingAtomic } from "../../electron/ipc/handlers/finance.repo";

const DAY = "2026-10-19T09:00:00.000Z";
const DAY2 = "2026-10-20T09:00:00.000Z";
const DATE = "2026-10-19";

describe("Retours 0055 — dette d'abord", () => {
  let tmp: string;
  let db: DatabaseSync;
  let productId: number;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-return-settlement-"));
    db = new DatabaseSync(path.join(tmp, "returns.sqlite"));
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
    productId = seedProduct();
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

  function seedProduct(): number {
    const r = db
      .prepare(
        `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at)
         VALUES (?, 'Article', 'PIECE', 3000, 5000, 1000, 0, 'in_stock', ?, ?)`,
      )
      .run(crypto.randomUUID(), DAY, DAY);
    return Number(r.lastInsertRowid);
  }

  function seedCustomer(outstanding: number): number {
    const r = db
      .prepare(
        `INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, credit_limit_minor, outstanding_balance_minor, debt_status, is_over_limit, created_at, updated_at)
         VALUES (?, 'Test', 'Client', 'test client', 1, 100000000, ?, 'due', 0, ?, ?)`,
      )
      .run(crypto.randomUUID(), outstanding, DAY, DAY);
    return Number(r.lastInsertRowid);
  }

  function seedSale(opts: {
    customerId: number | null;
    lines: { productId: number | null; quantity: number; unitPrice: number; lineTotal: number }[];
    paid: number;
    createdAt?: string;
    invoice?: string;
  }): number {
    const total = opts.lines.reduce((a, l) => a + l.lineTotal, 0);
    const created = opts.createdAt ?? DAY;
    const r = db
      .prepare(
        `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, discount_type, discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, payment_method, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'none', 0, 0, 0, ?, ?, ?, ?, 'cash', ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        opts.invoice ?? `FAC-${crypto.randomUUID().slice(0, 8)}`,
        opts.customerId,
        total,
        total,
        opts.paid,
        total - opts.paid,
        opts.paid >= total ? "paid" : opts.paid > 0 ? "partial" : "unpaid",
        created,
        created,
      );
    const saleId = Number(r.lastInsertRowid);
    for (const line of opts.lines) {
      db.prepare(
        `INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_code, original_unit_price_minor, unit_price_minor, purchase_price_minor, quantity, line_total_minor, discount_minor, unit_factor)
         VALUES (?, ?, 'Article', 'PIECE', ?, ?, 3000, ?, ?, 0, 1)`,
      ).run(saleId, line.productId, line.unitPrice, line.unitPrice, line.quantity, line.lineTotal);
    }
    return saleId;
  }

  function balance(customerId: number): number {
    const row = db
      .prepare("SELECT outstanding_balance_minor AS b FROM customers WHERE id = ?")
      .get(customerId) as { b: number };
    return Number(row.b);
  }

  function saleRow(saleId: number): {
    remaining: number;
    paid: number;
    credit: number;
  } {
    const row = db
      .prepare(
        "SELECT remaining_balance_minor AS r, amount_paid_minor AS p, credit_applied_minor AS c FROM sales WHERE id = ?",
      )
      .get(saleId) as { r: number; p: number; c: number };
    return { remaining: Number(row.r), paid: Number(row.p), credit: Number(row.c) };
  }

  function createReturn(args: {
    operationId?: string;
    saleId: number;
    items: {
      saleItemId?: number;
      productId: number | null;
      quantity: number;
      restocked?: boolean;
    }[];
    refundMinor: number;
    method?: string | null;
    createdAt?: string;
  }): ReturnType<typeof createReturnAtomic> {
    return createReturnAtomic({
      operationId: args.operationId ?? crypto.randomUUID(),
      originalSaleId: args.saleId,
      items: args.items.map((i) => ({
        saleItemId: i.saleItemId ?? null,
        productId: i.productId,
        quantity: i.quantity,
        restocked: i.restocked ?? true,
        condition: "good",
        unitFactor: 1,
      })),
      refundMinor: args.refundMinor,
      refundMethod: args.refundMinor > 0 ? (args.method ?? "cash") : null,
      reason: "Test 0055",
      notes: null,
      createdAt: args.createdAt ?? DAY,
      now: args.createdAt ?? DAY,
    });
  }

  function lineId(saleId: number, index = 0): number {
    const rows = db
      .prepare("SELECT id FROM sale_items WHERE sale_id = ? ORDER BY id")
      .all(saleId) as { id: number }[];
    return Number(rows[index]?.id);
  }

  it("refuse le cash sur la part encore due, puis impute la dette", () => {
    const customerId = seedCustomer(6000);
    const saleId = seedSale({
      customerId,
      lines: [{ productId, quantity: 2, unitPrice: 5000, lineTotal: 10000 }],
      paid: 4000,
    });
    const itemId = lineId(saleId);
    const beforeStock = (
      db.prepare("SELECT quantity FROM products WHERE id = ?").get(productId) as {
        quantity: number;
      }
    ).quantity;

    expect(() =>
      createReturn({
        saleId,
        items: [{ saleItemId: itemId, productId, quantity: 1 }],
        refundMinor: 5000,
      }),
    ).toThrow(/non imputé/);
    expect(
      (
        db.prepare("SELECT quantity FROM products WHERE id = ?").get(productId) as {
          quantity: number;
        }
      ).quantity,
    ).toBe(Number(beforeStock));
    expect(balance(customerId)).toBe(6000);

    const res = createReturn({
      saleId,
      items: [{ saleItemId: itemId, productId, quantity: 1 }],
      refundMinor: 0,
    });
    expect(res.totalReturnMinor).toBe(5000);
    expect(res.creditAppliedMinor).toBe(5000);
    expect(res.cashRefundMinor).toBe(0);
    expect(res.customerOutstandingAfterMinor).toBe(1000);
    expect(balance(customerId)).toBe(1000);
    expect(saleRow(saleId)).toEqual({ remaining: 1000, paid: 9000, credit: 5000 });
  });

  it("impute d'abord la vente d'origine, puis les autres ventes ouvertes", () => {
    const customerId = seedCustomer(4000);
    const paidSale = seedSale({
      customerId,
      lines: [{ productId, quantity: 2, unitPrice: 5000, lineTotal: 10000 }],
      paid: 10000,
      invoice: "FAC-PAID",
    });
    const openSale = seedSale({
      customerId,
      lines: [{ productId, quantity: 1, unitPrice: 4000, lineTotal: 4000 }],
      paid: 0,
      createdAt: "2026-10-19T10:00:00.000Z",
      invoice: "FAC-OPEN",
    });
    const res = createReturn({
      saleId: paidSale,
      items: [{ saleItemId: lineId(paidSale), productId, quantity: 1 }],
      refundMinor: 0,
    });
    expect(res.creditAppliedMinor).toBe(4000);
    expect(res.unallocatedCreditMinor).toBe(0);
    expect(balance(customerId)).toBe(0);
    expect(saleRow(paidSale)).toEqual({ remaining: 0, paid: 10000, credit: 0 });
    expect(saleRow(openSale)).toEqual({ remaining: 0, paid: 4000, credit: 4000 });
    const alloc = db
      .prepare("SELECT sale_id, amount_minor FROM customer_credit_allocations WHERE return_id = ?")
      .all(res.id) as { sale_id: number; amount_minor: number }[];
    expect(alloc).toEqual([{ sale_id: openSale, amount_minor: 4000 }]);
  });

  it("journée close : le retour impute sans toucher la vente verrouillée", () => {
    const customerId = seedCustomer(5000);
    const saleId = seedSale({
      customerId,
      lines: [{ productId, quantity: 1, unitPrice: 5000, lineTotal: 5000 }],
      paid: 0,
    });
    createDailyClosingAtomic({
      businessDate: DATE,
      openingMinor: 0,
      operationId: crypto.randomUUID(),
      now: "2026-10-19T20:00:00.000Z",
    });
    const res = createReturn({
      saleId,
      items: [{ saleItemId: lineId(saleId), productId, quantity: 1 }],
      refundMinor: 0,
      createdAt: DAY2,
    });
    // La vente du jour clos reste intacte ; le crédit est non affecté mais le
    // compte client est corrigé (aucun ABORT 0048).
    expect(saleRow(saleId)).toEqual({ remaining: 5000, paid: 0, credit: 0 });
    expect(res.creditAppliedMinor).toBe(5000);
    expect(res.unallocatedCreditMinor).toBe(5000);
    expect(balance(customerId)).toBe(0);
    const hint = db
      .prepare(
        "SELECT stored_balance_minor, note_ledger_hint_minor FROM v_customer_balance_check WHERE customer_id = ?",
      )
      .get(customerId) as { stored_balance_minor: number; note_ledger_hint_minor: number };
    expect(hint.stored_balance_minor).toBe(hint.note_ledger_hint_minor);
  });

  it("l'avoir imputé ne gonfle pas les espèces du Z", () => {
    const customerId = seedCustomer(3000);
    const saleId = seedSale({
      customerId,
      lines: [{ productId, quantity: 1, unitPrice: 5000, lineTotal: 5000 }],
      paid: 0,
    });
    const res = createReturn({
      saleId,
      items: [{ saleItemId: lineId(saleId), productId, quantity: 1 }],
      refundMinor: 0,
    });
    expect(res.creditAppliedMinor).toBe(3000);
    expect(saleRow(saleId)).toEqual({ remaining: 2000, paid: 3000, credit: 3000 });
    const closing = createDailyClosingAtomic({
      businessDate: DATE,
      openingMinor: 0,
      operationId: crypto.randomUUID(),
      now: "2026-10-19T20:00:00.000Z",
    }) as { cashSalesMinor: number; refundsMinor: number; closingMinor: number };
    expect(closing.cashSalesMinor).toBe(0);
    expect(closing.refundsMinor).toBe(0);
    expect(closing.closingMinor).toBe(0);
  });

  it("utilise la valeur NETTE de la ligne après remise", () => {
    const saleId = seedSale({
      customerId: null,
      lines: [{ productId, quantity: 2, unitPrice: 5000, lineTotal: 9000 }],
      paid: 9000,
    });
    const res = createReturn({
      saleId,
      items: [{ saleItemId: lineId(saleId), productId, quantity: 1 }],
      refundMinor: 4500,
    });
    expect(res.totalReturnMinor).toBe(4500);
    expect(res.creditAppliedMinor).toBe(0);
    expect(res.cashRefundMinor).toBe(4500);
    const item = db
      .prepare("SELECT line_total_minor, sale_item_id FROM return_items WHERE return_id = ?")
      .get(res.id) as { line_total_minor: number; sale_item_id: number };
    expect(item).toEqual({ line_total_minor: 4500, sale_item_id: lineId(saleId) });
  });

  it("deux lignes du même produit : chaque ligne a son propre éligible", () => {
    const saleId = seedSale({
      customerId: null,
      lines: [
        { productId, quantity: 1, unitPrice: 5000, lineTotal: 5000 },
        { productId, quantity: 1, unitPrice: 3000, lineTotal: 3000 },
      ],
      paid: 8000,
    });
    const [lineA, lineB] = [lineId(saleId, 0), lineId(saleId, 1)] as [number, number];
    const first = createReturn({
      saleId,
      items: [{ saleItemId: lineA, productId, quantity: 1 }],
      refundMinor: 5000,
    });
    expect(first.totalReturnMinor).toBe(5000);
    expect(() =>
      createReturn({
        saleId,
        items: [{ saleItemId: lineA, productId, quantity: 1 }],
        refundMinor: 5000,
      }),
    ).toThrow(/éligible de la ligne/);
    const second = createReturn({
      saleId,
      items: [{ saleItemId: lineB, productId, quantity: 1 }],
      refundMinor: 3000,
    });
    expect(second.totalReturnMinor).toBe(3000);
    const eligible = getReturnableSaleItems(saleId).items as {
      id: number;
      eligible: number;
    }[];
    expect(eligible.find((i) => i.id === lineA)?.eligible).toBe(0);
    expect(eligible.find((i) => i.id === lineB)?.eligible).toBe(0);
  });

  it("rejoue le même operationId sans double imputation", () => {
    const customerId = seedCustomer(3000);
    const saleId = seedSale({
      customerId,
      lines: [{ productId, quantity: 1, unitPrice: 5000, lineTotal: 5000 }],
      paid: 0,
    });
    const op = crypto.randomUUID();
    const first = createReturn({
      operationId: op,
      saleId,
      items: [{ saleItemId: lineId(saleId), productId, quantity: 1 }],
      refundMinor: 0,
    });
    const second = createReturn({
      operationId: op,
      saleId,
      items: [{ saleItemId: lineId(saleId), productId, quantity: 1 }],
      refundMinor: 0,
    });
    expect(second).toEqual(first);
    expect(balance(customerId)).toBe(0);
    expect(saleRow(saleId)).toEqual({ remaining: 2000, paid: 3000, credit: 3000 });
    const returns = db.prepare("SELECT COUNT(*) AS c FROM returns").get() as { c: number };
    expect(returns.c).toBe(1);
    const alloc = db.prepare("SELECT COUNT(*) AS c FROM customer_credit_allocations").get() as {
      c: number;
    };
    expect(alloc.c).toBe(1);
  });

  // A17 (audit 2026-10-27) — le contrat rend `saleItemId` optionnel. Sur ce
  // chemin, le dépôt prenait la PREMIÈRE ligne du produit comme référence de
  // valeur : avec deux lignes du même produit dont une remisée, deux retours
  // couvrant chacun leur quantité créditaient 2 × la valeur de la ligne 1, soit
  // plus que le net réellement vendu (10 000 + 6 000 attendus, 20 000 donnés).
  it("A17 : chemin sans ligne exacte plafonné à la valeur nette agrégée du produit", () => {
    const customerId = seedCustomer(0);
    const saleId = seedSale({
      customerId,
      paid: 0,
      lines: [
        { productId, quantity: 2, unitPrice: 5000, lineTotal: 10000 },
        { productId, quantity: 2, unitPrice: 5000, lineTotal: 6000 },
      ],
    });
    const res = createReturn({
      saleId,
      items: [
        { productId, quantity: 2, restocked: false },
        { productId, quantity: 2, restocked: false },
      ],
      refundMinor: 0,
    });
    expect(res.totalReturnMinor).toBe(16000);
    const stored = db
      .prepare("SELECT total_return_value_minor AS t FROM returns WHERE id = ?")
      .get(res.id) as { t: number };
    expect(Number(stored.t)).toBe(16000);
    // Le net vendu par produit est le plafond : jamais plus que ce qui a été
    // facturé au client pour ce produit sur cette vente.
    const items = db
      .prepare("SELECT line_total_minor AS v FROM return_items WHERE return_id = ? ORDER BY id")
      .all(res.id) as { v: number }[];
    expect(items.map((i) => Number(i.v))).toEqual([10000, 6000]);
  });
});
