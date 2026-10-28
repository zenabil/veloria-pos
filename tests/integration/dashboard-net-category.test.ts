// Veloria PoS — Dashboard NET : retours, remboursements, catégories, portée.
// Base migrée réelle (node:sqlite) : reproduit les agrégats de production.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const db = repoDb.current as {
      prepare: (sql: string) => {
        all: (...params: unknown[]) => unknown;
        get: (...params: unknown[]) => unknown;
        run: (...params: unknown[]) => { changes: number | bigint };
      };
      exec: (sql: string) => void;
    } | null;
    if (!db) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => db.prepare(sql),
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          db.exec("BEGIN;");
          try {
            const out = fn();
            db.exec("COMMIT;");
            return out;
          } catch (err) {
            try {
              db.exec("ROLLBACK;");
            } catch {
              /* best effort */
            }
            throw err;
          }
        },
    };
  },
  integrityCheck: () => ({ integrity: "ok", foreignKeys: [] }),
  getLastIntegrityResult: () => ({ integrity: "ok", at: new Date().toISOString() }),
}));

vi.mock("../../electron/backup/backup.service", () => ({
  backupStatus: () => ({ count: 0, lastAt: null, lastFile: null, auto: null }),
}));

vi.mock("../../electron/services/logger", () => ({
  log: () => {},
  initLogger: () => "",
  getLogFile: () => "",
}));

import { getDashboardSummary } from "../../electron/ipc/handlers/dashboard.repo";

interface Dash {
  kpis: {
    salesMinor: number;
    salesCount: number;
    returnsMinor: number;
    returnsCount: number;
    purchasesMinor: number;
    expensesMinor: number;
    profitMinor: number;
    cashMinor: number;
  };
  daily: { d: string; t: number; n: number }[];
  byMethod: { method: string; n: number; t: number }[];
  byCategory: {
    id: number | null;
    name: string;
    salesMinor: number;
    profitMinor: number;
    returnsMinor: number;
  }[];
  fastMoving: { name: string; qty: number; total: number }[];
  overdue: unknown[];
  overdueCount: number;
  upcomingCount: number;
  recent: { returns: unknown[]; purchases: unknown[] };
}

describe("Dashboard net des retours et catégories", () => {
  let tmp: string;
  let db: DatabaseSync;
  const from = "2026-01-10";
  const to = "2026-01-11";
  const stamp = "2026-01-10T10:00:00.000Z";
  const stamp2 = "2026-01-11T10:00:00.000Z";

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-dash-net-"));
    db = new DatabaseSync(path.join(tmp, "dash.sqlite"));
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys=ON;");
    repoDb.current = db;

    const staff = db.prepare(
      `INSERT INTO staff_users (id, uuid, username, display_name, role, code_hash,
        code_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'user', 'hash', 'salt', ?, ?)`,
    );
    staff.run(1, "st-1", "staff1", "Staff 1", stamp, stamp);
    staff.run(2, "st-2", "staff2", "Staff 2", stamp, stamp);

    db.prepare(
      `INSERT INTO customers (id, uuid, first_name, last_name, search_name,
        credit_allowed, created_at, updated_at)
       VALUES (1, 'cust-1', 'Ali', 'Client', 'Ali Client', 1, ?, ?)`,
    ).run(stamp, stamp);

    db.prepare(
      `INSERT INTO categories (id, uuid, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(1, "cat-1", "Boissons", stamp, stamp);
    db.prepare(
      `INSERT INTO categories (id, uuid, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(2, "cat-2", "Snacks", stamp, stamp);
    db.prepare(
      `INSERT INTO categories (id, uuid, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(3, "cat-3", "Vide", stamp, stamp);

    const product = db.prepare(
      `INSERT INTO products (id, uuid, name, category_id, quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    product.run(1, "p-1", "Eau", 1, 100, stamp, stamp);
    product.run(2, "p-2", "Chips", 2, 100, stamp, stamp);
    product.run(3, "p-3", "Vide", 3, 100, stamp, stamp);

    const sale = db.prepare(
      `INSERT INTO sales (id, uuid, invoice_number, subtotal_minor, total_minor,
        amount_paid_minor, remaining_balance_minor, payment_status, is_cancelled,
        payment_method, due_date, staff_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    sale.run(1, "s-1", "FAC-1", 10000, 10000, 10000, 0, "paid", 0, "cash", null, 1, stamp, stamp);
    sale.run(2, "s-2", "FAC-2", 5000, 5000, 5000, 0, "paid", 0, "cash", null, 2, stamp2, stamp2);
    sale.run(3, "s-3", "FAC-3", 999, 999, 999, 0, "paid", 1, "cash", null, 1, stamp, stamp);

    const item = db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_code,
        unit_price_minor, purchase_price_minor, quantity, line_total_minor, cogs_minor,
        category_id)
       VALUES (?, ?, ?, 'PIECE', ?, ?, ?, ?, ?, ?)`,
    );
    item.run(1, 1, "Eau", 1000, 600, 10, 10000, 6000, 1);
    item.run(2, 2, "Chips", 1000, 600, 5, 5000, 3000, 2);
    item.run(3, 1, "Eau", 999, 600, 1, 999, 600, 1);

    const pay = db.prepare(
      `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method,
        payment_date, staff_user_id, created_at)
       VALUES (?, ?, NULL, ?, 'cash', ?, ?, ?)`,
    );
    pay.run("pay-1", 1, 10000, to, 1, stamp);
    pay.run("pay-2", 2, 5000, to, 2, stamp2);
    pay.run("pay-standalone", null, 700, to, 1, stamp);

    db.prepare(
      `INSERT INTO suppliers (id, uuid, code, name, created_at, updated_at)
       VALUES (1, 'sup-1', 'SUP-1', 'Fournisseur', ?, ?)`,
    ).run(stamp, stamp);
    db.prepare(
      `INSERT INTO supplier_payments (uuid, supplier_id, amount_minor, method,
        payment_date, staff_user_id, created_at)
       VALUES ('sp-1', 1, 1000, 'cash', ?, 1, ?)`,
    ).run(to, stamp);

    db.prepare(
      `INSERT INTO expenses (uuid, description, category, amount_minor, expense_date,
        status, staff_user_id, created_at, updated_at)
       VALUES ('e-1', 'Carburant', 'Transport', 500, ?, 'paid', 1, ?, ?)`,
    ).run(to, stamp, stamp);
    db.prepare(
      `INSERT INTO expenses (uuid, description, category, amount_minor, expense_date,
        status, staff_user_id, created_at, updated_at)
       VALUES ('e-2', 'En attente', 'Divers', 800, ?, 'pending', 1, ?, ?)`,
    ).run(to, stamp, stamp);

    const intake = db.prepare(
      `INSERT INTO stock_intakes (id, uuid, subtotal_minor, total_minor, status,
        staff_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    );
    intake.run(1, "in-1", 3000, 3000, "committed", stamp, stamp);
    intake.run(2, "in-2", 9999, 9999, "cancelled", stamp2, stamp2);

    db.prepare(
      `INSERT INTO returns (id, uuid, return_number, original_sale_id,
        original_invoice_number, customer_id, total_return_value_minor,
        amount_refunded_minor, credit_to_customer_minor, refund_method, status,
        staff_user_id, created_at, updated_at)
       VALUES (1, 'r-1', 'RET-1', 1, 'FAC-1', NULL, 2000, 2000, 0, 'cash',
        'refunded', 1, ?, ?)`,
    ).run(stamp, stamp);
    db.prepare(
      `INSERT INTO returns (id, uuid, return_number, original_sale_id,
        original_invoice_number, customer_id, total_return_value_minor,
        amount_refunded_minor, credit_to_customer_minor, refund_method, status,
        staff_user_id, created_at, updated_at)
       VALUES (2, 'r-2', 'RET-2', 1, 'FAC-1', NULL, 1000, 1000, 0, 'cash',
        'cancelled', 1, ?, ?)`,
    ).run(stamp2, stamp2);
    const retItem = db.prepare(
      `INSERT INTO return_items (return_id, product_id, product_name_snapshot,
        quantity, unit_price_minor, purchase_price_minor, restocked, line_total_minor,
        category_id, cogs_minor)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    );
    retItem.run(1, 1, "Eau", 2, 1000, 600, 2000, 1, 1200);
    retItem.run(2, 1, "Eau", 1, 1000, 600, 1000, 1, 600);

    db.prepare(
      `INSERT INTO supplier_returns (id, uuid, return_number, stock_intake_id,
        intake_invoice_number, supplier_id, total_return_value_minor,
        amount_recovered_minor, recovery_method, status, staff_user_id, created_at, updated_at)
       VALUES (1, 'sr-1', 'SRET-1', 1, 'IN-1', 1, 500, 0, NULL,
        'validated', 1, ?, ?)`,
    ).run(stamp, stamp);
    db.prepare(
      `INSERT INTO supplier_returns (id, uuid, return_number, stock_intake_id,
        intake_invoice_number, supplier_id, total_return_value_minor,
        amount_recovered_minor, recovery_method, status, staff_user_id, created_at, updated_at)
       VALUES (2, 'sr-2', 'SRET-2', 1, 'IN-1', 1, 700, 0, NULL,
        'cancelled', 1, ?, ?)`,
    ).run(stamp2, stamp2);

    const overdue = db.prepare(
      `INSERT INTO sales (id, uuid, invoice_number, customer_id, subtotal_minor,
        total_minor, amount_paid_minor, remaining_balance_minor, payment_status,
        is_cancelled, payment_method, due_date, staff_user_id, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1000, 1000, 0, 1000, 'unpaid', 0, 'cash', '2000-01-01',
        1, '2025-01-01T10:00:00.000Z', '2025-01-01T10:00:00.000Z')`,
    );
    for (let i = 0; i < 6; i += 1) overdue.run(10 + i, `o-${i}`, `OV-${i}`);

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO sales (id, uuid, invoice_number, customer_id, subtotal_minor,
        total_minor, amount_paid_minor, remaining_balance_minor, payment_status,
        is_cancelled, payment_method, due_date, staff_user_id, created_at, updated_at)
       VALUES (20, 'soon', 'SOON-1', 1, 500, 500, 0, 500, 'unpaid', 0, 'cash', ?,
        1, '2025-01-01T10:00:00.000Z', '2025-01-01T10:00:00.000Z')`,
    ).run(tomorrow);
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

  it("calcule le net des retours, le cash et les catégories (gérant)", () => {
    const dash = getDashboardSummary(from, to) as unknown as Dash;
    expect(dash.kpis.salesMinor).toBe(13000);
    expect(dash.kpis.returnsMinor).toBe(2000);
    expect(dash.kpis.returnsCount).toBe(1);
    expect(dash.kpis.profitMinor).toBe(5200);
    expect(dash.kpis.purchasesMinor).toBe(3000);
    expect(dash.kpis.expensesMinor).toBe(500);
    expect(dash.kpis.cashMinor).toBe(12200);
    expect(dash.byMethod).toEqual([{ method: "cash", n: 4, t: 13700 }]);
    expect(dash.daily.map((d) => [d.d, d.t])).toEqual([
      ["2026-01-10", 8000],
      ["2026-01-11", 5000],
    ]);
    expect(dash.fastMoving[0]).toMatchObject({ name: "Eau", qty: 8, total: 8000 });

    const cat1 = dash.byCategory.find((c) => c.id === 1);
    const cat2 = dash.byCategory.find((c) => c.id === 2);
    const cat3 = dash.byCategory.find((c) => c.id === 3);
    expect(cat1).toMatchObject({ salesMinor: 8000, returnsMinor: 2000, profitMinor: 3200 });
    expect(cat2).toMatchObject({ salesMinor: 5000, returnsMinor: 0, profitMinor: 2000 });
    expect(cat3).toMatchObject({ salesMinor: 0, profitMinor: 0 });

    expect(dash.overdueCount).toBe(6);
    expect(dash.overdue).toHaveLength(5);
    expect(dash.upcomingCount).toBe(1);
    expect(dash.recent.returns).toHaveLength(2);
    expect(dash.recent.purchases).toHaveLength(1);
  });

  it("applique le périmètre auteur aux ventes, retours, paiements et catégories", () => {
    const dash = getDashboardSummary(from, to, 1) as unknown as Dash;
    expect(dash.kpis.salesMinor).toBe(8000);
    expect(dash.kpis.profitMinor).toBe(3200);
    expect(dash.kpis.cashMinor).toBe(7200);
    expect(dash.byMethod[0]).toMatchObject({ method: "cash", t: 8700 });
    expect(dash.daily[1]?.t).toBe(0);
    expect(dash.byCategory.find((c) => c.id === 1)).toMatchObject({
      salesMinor: 8000,
      profitMinor: 3200,
    });
    expect(dash.byCategory.find((c) => c.id === 2)).toMatchObject({
      salesMinor: 0,
      profitMinor: 0,
    });
    expect(dash.overdueCount).toBe(6);

    const staff2 = getDashboardSummary(from, to, 2) as unknown as Dash;
    expect(staff2.kpis.salesMinor).toBe(5000);
    expect(staff2.kpis.profitMinor).toBe(2000);
    expect(staff2.kpis.cashMinor).toBe(5000);
    expect(staff2.byCategory.find((c) => c.id === 1)?.salesMinor).toBe(0);
    expect(staff2.byCategory.find((c) => c.id === 2)?.salesMinor).toBe(5000);
  });
});
