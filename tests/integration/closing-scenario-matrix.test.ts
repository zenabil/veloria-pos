// Veloria PoS — CLOS-05 : MATRICE DES SCÉNARIOS DE CLÔTURE.
//
// La compétence `veloria-closing` liste neuf « required scenarios » dans
// `references/z-report-and-cash-reconciliation.md`. Ils étaient couverts
// par-ci par-là (closing-z-formula, closing-period-lock, closing-reopen,
// closing-cash-attribution) — aucun endroit unique ne prouvait que les
// NEUF étaient couverts.
//
// Ce fichier les consolide : UN test par scénario, sur une base RÉELLE
// migrée (base temporaire, jamais la base du magasin), via le vrai dépôt
// `createDailyClosingAtomic` / `reopenDailyClosingAtomic`.
//
// Règle du document source : « Closing cash = Opening float + Cash inflows
// − Cash outflows » et « Do not count the same movement once as a sale
// payment and again as a collection ».
//
// Les neuf scénarios (source : skill veloria-closing) :
//   1. Vente payée entièrement en espèces.
//   2. Vente payée partie en espèces, partie en crédit.
//   3. Créance ancienne encaissée aujourd'hui.
//   4. Dépense créée aujourd'hui mais payée demain.
//   5. Retour créé aujourd'hui mais remboursé demain.
//   6. Paiement non espèces.
//   7. Répétition (sync/retry) d'un mouvement.
//   8. Événement proche de minuit dans le fuseau métier.
//   9. Journée rouverte puis refermée.
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

vi.mock("../../electron/backup/backup.service", () => ({
  backupStatus: () => ({ count: 0, lastAt: null, lastFile: null, auto: null }),
}));

import {
  createDailyClosingAtomic,
  reopenDailyClosingAtomic,
} from "../../electron/ipc/handlers/finance.repo";

const DAY = "2026-03-10";
const PREV_DAY = "2026-03-09";
const NEXT_DAY = "2026-03-11";
const STAMP = `${DAY}T10:00:00.000Z`;

interface ClosingResult {
  cashSalesMinor: number;
  collectionsMinor: number;
  expensesMinor: number;
  refundsMinor: number;
  closingMinor: number;
}

describe("CLOS-05 : matrice des scénarios de clôture (veloria-closing)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-closing-matrix-"));
    db = new DatabaseSync(path.join(tmp, "matrix.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
    repoDb.current = db;
    repoDb.depth = 0;
    db.prepare(
      `INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at)
       VALUES ('c-mtx', 'Amine', 'Benali', 'amine benali', 1, '2026-01-01', '2026-01-01')`,
    ).run();
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

  // ---------------------------------------------------------------- helpers
  function seedManager(): number {
    db.prepare(
      `INSERT INTO staff_users (uuid, username, display_name, role, code_hash, code_salt, must_change_code, is_active, failed_attempts, created_at, updated_at)
       VALUES ('u-mgr', 'gerant', 'Gérant', 'manager', 'h', 's', 0, 1, 0, ?, ?)`,
    ).run(STAMP, STAMP);
    return (db.prepare(`SELECT id FROM staff_users WHERE uuid = 'u-mgr'`).get() as { id: number })
      .id;
  }

  function seedSale(args: {
    invoice: string;
    total: number;
    paid?: number;
    method?: string | null;
    createdAt?: string;
    customerId?: number | null;
  }): number {
    const paid = args.paid ?? args.total;
    const createdAt = args.createdAt ?? STAMP;
    const r = db
      .prepare(
        `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, discount_type, discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, payment_method, is_cancelled, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'none', 0, 0, 0, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        args.invoice,
        args.customerId ?? null,
        args.total,
        args.total,
        paid,
        args.total - paid,
        paid >= args.total ? "paid" : "partial",
        args.method ?? null,
        createdAt,
        createdAt,
      );
    return Number(r.lastInsertRowid);
  }

  function seedPayment(args: {
    saleId?: number | null;
    customerId?: number | null;
    amount: number;
    method?: string;
    paymentDate: string;
    createdAt?: string;
    operationId?: string | null;
  }): void {
    db.prepare(
      `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at, operation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      args.saleId ?? null,
      args.customerId ?? null,
      args.amount,
      args.method ?? "cash",
      args.paymentDate,
      args.createdAt ?? `${args.paymentDate}T09:00:00.000Z`,
      args.operationId ?? null,
    );
  }

  function seedExpense(args: {
    amount: number;
    expenseDate: string;
    status?: string;
    createdAt?: string;
  }): void {
    db.prepare(
      `INSERT INTO expenses (uuid, description, category, amount_minor, expense_date, status, created_at, updated_at)
       VALUES (?, 'Frais', 'Divers', ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      args.amount,
      args.expenseDate,
      args.status ?? "paid",
      args.createdAt ?? `${args.expenseDate}T09:00:00.000Z`,
      args.createdAt ?? `${args.expenseDate}T09:00:00.000Z`,
    );
  }

  function seedReturn(args: {
    saleId: number;
    invoice: string;
    refunded: number;
    createdAt: string;
    updatedAt?: string;
    status?: string;
  }): number {
    const r = db
      .prepare(
        `INSERT INTO returns (uuid, original_sale_id, original_invoice_number, customer_id, total_return_value_minor, amount_refunded_minor, credit_to_customer_minor, return_number, status, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        args.saleId,
        args.invoice,
        args.refunded,
        args.refunded,
        `RET-${args.invoice}`,
        args.status ?? "validated",
        args.createdAt,
        args.updatedAt ?? args.createdAt,
      );
    return Number(r.lastInsertRowid);
  }

  function seedRefundMovement(args: {
    returnId: number;
    amount: number;
    createdAt: string;
    method?: string;
  }): void {
    db.prepare(
      `INSERT INTO return_refund_movements (uuid, return_id, amount_minor, method, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), args.returnId, args.amount, args.method ?? "cash", args.createdAt);
  }

  function close(day: string, openingMinor = 0, operationId?: string): ClosingResult {
    return createDailyClosingAtomic({
      businessDate: day,
      openingMinor,
      operationId: operationId ?? crypto.randomUUID(),
      now: `${day}T23:00:00.000Z`,
    }) as unknown as ClosingResult;
  }

  function closingRows(day: string): Array<Record<string, unknown>> {
    return db.prepare(`SELECT * FROM daily_closings WHERE business_date = ?`).all(day);
  }

  // ------------------------------------------------------------------ S1
  it("S1 — vente payée entièrement en espèces : elle entre dans le tiroir", () => {
    const saleId = seedSale({ invoice: "FAC-M-001", total: 10000, method: "cash" });
    seedPayment({ saleId, amount: 10000, paymentDate: DAY });

    const res = close(DAY);
    expect(res.cashSalesMinor).toBe(10000);
    expect(res.collectionsMinor).toBe(0);
    expect(res.closingMinor).toBe(10000);
  });

  // ------------------------------------------------------------------ S2
  it("S2 — vente payée partie espèces, partie crédit : seule la part espèces entre", () => {
    const saleId = seedSale({
      invoice: "FAC-M-002",
      total: 10000,
      paid: 4000,
      method: "cash",
      customerId: 1,
    });
    seedPayment({ saleId, amount: 4000, paymentDate: DAY });

    const res = close(DAY);
    // 4 000 en espèces ; les 6 000 de crédit ne sont pas de la caisse.
    expect(res.cashSalesMinor).toBe(4000);
    expect(res.collectionsMinor).toBe(0);
    expect(res.closingMinor).toBe(4000);
    // Le crédit n'est pas re-compté comme une collection (pas de double compte).
    expect(
      (
        db
          .prepare(`SELECT COALESCE(SUM(amount_minor),0) AS c FROM sale_payments WHERE sale_id = ?`)
          .get(saleId) as { c: number }
      ).c,
    ).toBe(4000);
  });

  // ------------------------------------------------------------------ S3
  it("S3 — créance ancienne encaissée aujourd'hui : collection, pas vente espèces", () => {
    // Vente d'hier, impayée.
    seedSale({
      invoice: "FAC-M-OLD",
      total: 10000,
      paid: 0,
      method: null,
      createdAt: `${PREV_DAY}T10:00:00.000Z`,
      customerId: 1,
    });
    // Encaissement du jour sur CETTE créance (sale_id NULL = encaissement isolé).
    seedPayment({
      saleId: null,
      customerId: 1,
      amount: 10000,
      paymentDate: DAY,
      createdAt: `${DAY}T11:00:00.000Z`,
    });

    const res = close(DAY);
    // La vente n'est pas une vente espèces DU JOUR : c'est une COLLECTION.
    expect(res.cashSalesMinor).toBe(0);
    expect(res.collectionsMinor).toBe(10000);
    expect(res.closingMinor).toBe(10000);
  });

  // ------------------------------------------------------------------ S4
  it("S4 — dépense créée aujourd'hui mais payée demain : la caisse sort demain", () => {
    // Dépense créée aujourd'hui, date de décaissement = demain.
    seedExpense({
      amount: 2500,
      expenseDate: NEXT_DAY,
      status: "paid",
      createdAt: `${DAY}T12:00:00.000Z`,
    });
    // Dépense du jour non décaissée (pending) : elle ne sort pas d'argent.
    seedExpense({
      amount: 700,
      expenseDate: DAY,
      status: "pending",
      createdAt: `${DAY}T12:30:00.000Z`,
    });

    const resDay = close(DAY);
    expect(resDay.expensesMinor).toBe(0);
    expect(resDay.closingMinor).toBe(0);

    const resNext = close(NEXT_DAY);
    expect(resNext.expensesMinor).toBe(2500);
    expect(resNext.closingMinor).toBe(-2500);
  });

  // ------------------------------------------------------------------ S5
  it("S5 — retour créé aujourd'hui mais remboursé demain : le remboursement sort demain", () => {
    // La vente d'origine est de la veille : elle ne pollue pas le tiroir du jour.
    const saleId = seedSale({
      invoice: "FAC-M-RET",
      total: 20000,
      method: "cash",
      createdAt: `${PREV_DAY}T10:00:00.000Z`,
    });
    const returnId = seedReturn({
      saleId,
      invoice: "FAC-M-RET",
      refunded: 0,
      createdAt: `${DAY}T12:00:00.000Z`,
    });
    // L'argent sort le lendemain : le mouvement de remboursement est daté demain.
    seedRefundMovement({
      returnId,
      amount: 5000,
      createdAt: `${NEXT_DAY}T10:00:00.000Z`,
    });

    const resDay = close(DAY);
    expect(resDay.refundsMinor).toBe(0);
    expect(resDay.closingMinor).toBe(0);

    const resNext = close(NEXT_DAY);
    expect(resNext.refundsMinor).toBe(5000);
    expect(resNext.closingMinor).toBe(-5000);
  });

  // ------------------------------------------------------------------ S6
  it("S6 — paiement non espèces : le tiroir ne bouge pas", () => {
    const saleId = seedSale({ invoice: "FAC-M-CHQ", total: 7000, method: "cheque" });
    seedPayment({ saleId, amount: 7000, method: "cheque", paymentDate: DAY });

    const res = close(DAY);
    expect(res.cashSalesMinor).toBe(0);
    expect(res.collectionsMinor).toBe(0);
    expect(res.closingMinor).toBe(0);
  });

  // ------------------------------------------------------------------ S7
  it("S7 — répétition (sync/retry) d'un mouvement : compté UNE seule fois", () => {
    const saleId = seedSale({ invoice: "FAC-M-RTRY", total: 9000, method: "cash" });
    const operationId = "op-sync-1";
    seedPayment({ saleId, amount: 9000, paymentDate: DAY, operationId });

    // Rejeu du MÊME mouvement (même operation_id) : refusé par la base
    // (index UNIQUE) ⇒ il ne peut pas compter deux fois.
    expect(() => seedPayment({ saleId, amount: 9000, paymentDate: DAY, operationId })).toThrow();

    const res = close(DAY, 0, "op-closing-1");
    expect(res.cashSalesMinor).toBe(9000);
    expect(res.closingMinor).toBe(9000);

    // Rejeu de l'OPÉRATION DE CLÔTURE (même operationId) : résultat identique,
    // une seule ligne de clôture (idempotence).
    const replay = close(DAY, 0, "op-closing-1");
    expect(replay.closingMinor).toBe(9000);
    expect(closingRows(DAY)).toHaveLength(1);
  });

  // ------------------------------------------------------------------ S8
  it("S8 — événement proche de minuit : il appartient au JOUR MÉTIER (Africa/Algiers)", () => {
    // 2026-03-09T23:30Z = 2026-03-10 00:30 heure d'Alger ⇒ jour métier 2026-03-10.
    const saleId = seedSale({
      invoice: "FAC-M-MIDNIGHT",
      total: 3000,
      method: "cash",
      createdAt: "2026-03-09T23:30:00.000Z",
    });
    seedPayment({
      saleId,
      amount: 3000,
      paymentDate: DAY,
      createdAt: "2026-03-09T23:30:00.000Z",
    });

    const resPrev = close(PREV_DAY);
    expect(resPrev.cashSalesMinor).toBe(0);

    const resDay = close(DAY);
    expect(resDay.cashSalesMinor).toBe(3000);
    expect(resDay.closingMinor).toBe(3000);
  });

  // ------------------------------------------------------------------ S9
  it("S9 — journée rouverte puis refermée : la clôture est recalculée", () => {
    const managerId = seedManager();
    const saleId = seedSale({ invoice: "FAC-M-RCL", total: 5000, method: "cash" });
    seedPayment({ saleId, amount: 5000, paymentDate: DAY });

    const first = close(DAY);
    expect(first.closingMinor).toBe(5000);
    expect(closingRows(DAY)).toHaveLength(1);

    // La journée close est verrouillée : plus aucune écriture dessus.
    expect(() => seedSale({ invoice: "FAC-M-LATE", total: 100, method: "cash" })).toThrow(
      /clôturée/i,
    );

    // Réouverture : réservé au gérant.
    expect(() =>
      reopenDailyClosingAtomic({
        businessDate: DAY,
        operationId: "op-reopen-1",
        now: `${DAY}T23:30:00.000Z`,
        actorUserId: null,
      }),
    ).toThrow(/Session requise/i);

    reopenDailyClosingAtomic({
      businessDate: DAY,
      operationId: "op-reopen-1",
      now: `${DAY}T23:30:00.000Z`,
      actorUserId: managerId,
    });
    expect(closingRows(DAY)).toHaveLength(0);

    // La journée est redevenue modifiable, puis refermée sur les NOUVEAUX chiffres.
    seedSale({ invoice: "FAC-M-AFTER", total: 1500, method: "cash" });
    const saleId2 = (
      db.prepare(`SELECT id FROM sales WHERE invoice_number = 'FAC-M-AFTER'`).get() as {
        id: number;
      }
    ).id;
    seedPayment({ saleId: saleId2, amount: 1500, paymentDate: DAY });

    const second = close(DAY);
    expect(second.cashSalesMinor).toBe(6500);
    expect(second.closingMinor).toBe(6500);
    expect(closingRows(DAY)).toHaveLength(1);
    // La réouverture est tracée.
    const audit = db
      .prepare(
        `SELECT COUNT(*) AS c FROM audit_log WHERE event_type IN ('closing.created','closing.reopened')`,
      )
      .get() as { c: number };
    expect(audit.c).toBe(3);
  });

  // ------------------------------------------------------------------ S0
  it("S0 — le solde de clôture = ouverture + entrées espèces − sorties", () => {
    const saleId = seedSale({ invoice: "FAC-M-BAL", total: 8000, method: "cash" });
    seedPayment({ saleId, amount: 8000, paymentDate: DAY });
    seedExpense({ amount: 1000, expenseDate: DAY, status: "paid" });

    const res = close(DAY, 2000);
    expect(res.closingMinor).toBe(2000 + 8000 - 1000);
  });
});
