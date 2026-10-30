// Veloria PoS — Encaissement standalone ventilé FIFO (plus ancienne facture
// d'abord). Repos RÉELS sur base migrée temporaire (node:sqlite) : la
// ventilation doit garder le reste dû PAR FACTURE aligné sur le solde client,
// sinon la liste des dettes (alimentée par `sales`) diverge du grand-livre.
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

import { recordCustomerPaymentAtomic } from "../../electron/ipc/handlers/customers.repo";
import { createSaleAtomic, type CreateSaleInput } from "../../electron/ipc/handlers/sales.repo";
import { listDebtsUnified } from "../../electron/ipc/handlers/finance.repo";

const NOW = "2026-01-04T08:00:00.000Z";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "payment-fifo.sqlite"));
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

function seedCustomer(db: DatabaseSync, initialMinor = 0): number {
  const r = db
    .prepare(
      `INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, credit_limit_minor, initial_balance_minor, outstanding_balance_minor, debt_status, is_over_limit, created_at, updated_at)
       VALUES (?, 'Nadia', 'Haddad', 'nadia haddad', 1, 0, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      initialMinor,
      initialMinor,
      initialMinor > 0 ? "due" : "none",
      NOW,
      NOW,
    );
  return Number(r.lastInsertRowid);
}

function saleArgs(
  customerId: number,
  totalMinor: number,
  createdAt: string,
  over: Record<string, unknown> = {},
): CreateSaleInput {
  return {
    operationId: crypto.randomUUID(),
    uuid: crypto.randomUUID(),
    invoiceNumber: `FAC-${crypto.randomUUID().slice(0, 8)}`,
    customerId,
    subtotalMinor: totalMinor,
    discountType: "none",
    discountValueMinor: 0,
    discountAmountMinor: 0,
    deliveryFeeMinor: 0,
    totalMinor,
    amountPaidMinor: 0,
    remainingMinor: totalMinor,
    paymentStatus: "unpaid",
    paymentMethod: null,
    dueDate: null,
    lines: [],
    lineTotals: [],
    now: createdAt,
    allowNegativeStock: true,
    ...over,
  };
}

type PaymentRow = {
  id: number;
  sale_id: number | null;
  customer_id: number | null;
  amount_minor: number;
  operation_id: string | null;
};

function payments(db: DatabaseSync): PaymentRow[] {
  return db
    .prepare(
      `SELECT id, sale_id, customer_id, amount_minor, operation_id FROM sale_payments ORDER BY id ASC`,
    )
    .all() as PaymentRow[];
}

function customerRow(db: DatabaseSync, id: number): { b: number; s: string } {
  const row = db
    .prepare(`SELECT outstanding_balance_minor AS b, debt_status AS s FROM customers WHERE id = ?`)
    .get(id) as { b: number; s: string };
  return row;
}

describe("Encaissement standalone ventilé FIFO", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-pay-fifo-"));
    db = openMigrated(tmp);
    repoDb.current = db;
    repoDb.depth = 0;
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

  it("ventile la plus ancienne facture d'abord et garde dettes/solde alignés", () => {
    const customerId = seedCustomer(db);
    const oldSale = createSaleAtomic(
      saleArgs(customerId, 10000, "2026-01-05T10:00:00.000Z", { dueDate: "2026-01-08" }),
    ).saleId;
    const newSale = createSaleAtomic(saleArgs(customerId, 8000, "2026-01-06T10:00:00.000Z")).saleId;
    const operationId = crypto.randomUUID();

    recordCustomerPaymentAtomic({
      operationId,
      customerId,
      saleId: null,
      amountMinor: 12000,
      method: "cash",
      reference: null,
      notes: null,
      paymentDate: "2026-01-10",
      now: "2026-01-10T09:00:00.000Z",
    });

    const rows = payments(db);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sale_id: oldSale,
      amount_minor: 10000,
      operation_id: `${operationId}:${oldSale}`,
    });
    expect(rows[1]).toMatchObject({
      sale_id: newSale,
      amount_minor: 2000,
      operation_id: `${operationId}:${newSale}`,
    });

    const sales = db
      .prepare(
        `SELECT id, remaining_balance_minor AS r, payment_status AS p FROM sales ORDER BY id ASC`,
      )
      .all() as { id: number; r: number; p: string }[];
    const byId = new Map(sales.map((s) => [s.id, s]));
    expect(byId.get(oldSale)).toMatchObject({ r: 0, p: "paid" });
    expect(byId.get(newSale)).toMatchObject({ r: 6000, p: "partial" });

    // La vente échue est soldée : le client n'est plus « en retard ».
    expect(customerRow(db, customerId)).toMatchObject({ b: 6000, s: "due" });

    // La liste des dettes (alimentée par `sales`) ne montre plus que le solde
    // réel : plus de facture fantôme après un encaissement standalone.
    const debts = listDebtsUnified("", 1, 50).rows as {
      entity_id: number;
      remaining_minor: number;
    }[];
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({ entity_id: newSale, remaining_minor: 6000 });
  });

  it("reste sans facture ouverte = ligne résiduelle à l'operationId exact", () => {
    // Solde initial 3 000 + vente 5 000 = 8 000 ; la vente ne couvre que 5 000.
    const customerId = seedCustomer(db, 3000);
    const saleId = createSaleAtomic(saleArgs(customerId, 5000, "2026-01-05T10:00:00.000Z")).saleId;
    const operationId = crypto.randomUUID();

    recordCustomerPaymentAtomic({
      operationId,
      customerId,
      saleId: null,
      amountMinor: 8000,
      method: "cash",
      reference: null,
      notes: null,
      paymentDate: "2026-01-10",
      now: "2026-01-10T09:00:00.000Z",
    });

    const rows = payments(db);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sale_id: saleId,
      amount_minor: 5000,
      operation_id: `${operationId}:${saleId}`,
    });
    expect(rows[1]).toMatchObject({
      sale_id: null,
      amount_minor: 3000,
      operation_id: operationId,
    });
    expect(customerRow(db, customerId)).toMatchObject({ b: 0, s: "none" });
  });

  it("rejouer le même operationId ne double ni les lignes ni la ventilation", () => {
    const customerId = seedCustomer(db);
    const saleId = createSaleAtomic(saleArgs(customerId, 9000, "2026-01-05T10:00:00.000Z")).saleId;
    const operationId = crypto.randomUUID();
    const args = {
      operationId,
      customerId,
      saleId: null,
      amountMinor: 4000,
      method: "cash",
      reference: null,
      notes: null,
      paymentDate: "2026-01-10",
      now: "2026-01-10T09:00:00.000Z",
    };

    const first = recordCustomerPaymentAtomic(args);
    const second = recordCustomerPaymentAtomic(args);

    expect(second.paymentId).toBe(first.paymentId);
    expect(payments(db)).toHaveLength(1);
    expect(customerRow(db, customerId).b).toBe(5000);
    const sale = db
      .prepare(`SELECT remaining_balance_minor AS r FROM sales WHERE id = ?`)
      .get(saleId) as { r: number };
    expect(sale.r).toBe(5000);
  });

  it("refuse un montant supérieur au solde (aucune ligne, rollback complet)", () => {
    const customerId = seedCustomer(db);
    createSaleAtomic(saleArgs(customerId, 5000, "2026-01-05T10:00:00.000Z"));

    expect(() =>
      recordCustomerPaymentAtomic({
        operationId: crypto.randomUUID(),
        customerId,
        saleId: null,
        amountMinor: 6000,
        method: "cash",
        reference: null,
        notes: null,
        paymentDate: "2026-01-10",
        now: "2026-01-10T09:00:00.000Z",
      }),
    ).toThrow(/dépasse le solde/);
    expect(payments(db)).toHaveLength(0);
    expect(customerRow(db, customerId).b).toBe(5000);
  });

  it("ignore les ventes annulées lors de la ventilation", () => {
    const customerId = seedCustomer(db);
    const cancelled = createSaleAtomic(
      saleArgs(customerId, 7000, "2026-01-05T10:00:00.000Z"),
    ).saleId;
    const open = createSaleAtomic(saleArgs(customerId, 7000, "2026-01-06T10:00:00.000Z")).saleId;
    // Annulation simulée : la vente ne doit plus être une cible de ventilation.
    db.prepare(`UPDATE sales SET is_cancelled = 1 WHERE id = ?`).run(cancelled);
    db.prepare(`UPDATE customers SET outstanding_balance_minor = 7000 WHERE id = ?`).run(
      customerId,
    );

    recordCustomerPaymentAtomic({
      operationId: crypto.randomUUID(),
      customerId,
      saleId: null,
      amountMinor: 7000,
      method: "cash",
      reference: null,
      notes: null,
      paymentDate: "2026-01-10",
      now: "2026-01-10T09:00:00.000Z",
    });

    const rows = payments(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sale_id: open, amount_minor: 7000 });
  });
});
