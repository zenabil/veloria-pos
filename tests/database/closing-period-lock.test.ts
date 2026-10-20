// Veloria PoS — E-21 (P1) : verrou de PÉRIODE CLÔTURÉE (migration 0048).
// Une journée close doit être IMMUABLE : plus aucune vente, aucun
// encaissement, aucune dépense, aucun retour, aucune modification de montant
// sur cette date. La réouverture (suppression de la ligne de clôture par le
// gérant) rouvre la journée.
//
// Test SQL pur (node:sqlite) : la garantie est celle de la BASE, pas du code.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DAY = "2026-03-01";
const NEXT_DAY = "2026-03-02";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "closing-lock.sqlite"));
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

function insertSale(db: DatabaseSync, id: string, createdAt: string): void {
  db.prepare(
    `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at)
     VALUES (?, ?, NULL, 1000, 1000, 1000, 0, 'paid', ?, ?)`,
  ).run(id, `FAC-${id}`, createdAt, createdAt);
}

/** Message d'erreur de la dernière opération refusée ("" si elle a réussi). */
function captureError(fn: () => void): string {
  try {
    fn();
    return "";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe("E-21 : une journée clôturée est verrouillée (migration 0048)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-closing-lock-"));
    db = openMigrated(tmp);
    db.prepare(
      `INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('c-lock','Amine','Benali','amine benali','2026-01-01','2026-01-01')`,
    ).run();
    insertSale(db, "before-lock", `${DAY}T08:00:00.000Z`);
    db.prepare(
      `INSERT INTO daily_closings (uuid, business_date, cash_sales_minor, cash_payments_minor, customer_collections_minor, expenses_minor, refunds_minor, closing_balance_minor, closed_at)
       VALUES ('cl-1', ?, 1000, 0, 0, 0, 0, 1000, ?)`,
    ).run(DAY, `${DAY}T23:59:00.000Z`);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("les 15 triggers de verrou sont installés", () => {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND instr(name, 'closed_day') > 0`,
      )
      .get() as { c: number };
    expect(row.c).toBe(15);
  });

  it("refuse une vente datée de la journée close (message FR)", () => {
    const error = captureError(() => insertSale(db, "after-lock", `${DAY}T10:00:00.000Z`));
    expect(error).toMatch(/clôturée/i);
    const count = db
      .prepare(`SELECT COUNT(*) AS c FROM sales WHERE created_at LIKE ?`)
      .get(`${DAY}%`) as { c: number };
    expect(count.c).toBe(1);
  });

  it("refuse une dépense, un encaissement et un retour sur la journée close", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO expenses (uuid, description, category, amount_minor, expense_date, created_at, updated_at) VALUES ('e-lock','Achat','divers',500,?,?,?)`,
        )
        .run(DAY, `${DAY}T10:00:00.000Z`, `${DAY}T10:00:00.000Z`),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at) VALUES ('pay-lock', NULL, 1, 500, 'cash', ?, ?)`,
        )
        .run(DAY, `${DAY}T10:00:00.000Z`),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          `INSERT INTO returns (uuid, original_sale_id, original_invoice_number, customer_id, total_return_value_minor, amount_refunded_minor, credit_to_customer_minor, created_at, updated_at)
           VALUES ('r-lock', 1, 'FAC-before-lock', 1, 1000, 1000, 1000, ?, ?)`,
        )
        .run(`${DAY}T10:00:00.000Z`, `${DAY}T10:00:00.000Z`),
    ).toThrow();
  });

  it("refuse la modification d'un montant sur la journée close", () => {
    const error = captureError(() =>
      db
        .prepare(
          `UPDATE sales SET amount_paid_minor = 0, remaining_balance_minor = 1000 WHERE uuid = 'before-lock'`,
        )
        .run(),
    );
    expect(error).toMatch(/clôturée/i);
  });

  it("laisse passer les écritures des autres journées", () => {
    insertSale(db, "other-day", `${NEXT_DAY}T09:00:00.000Z`);
    const count = db
      .prepare(`SELECT COUNT(*) AS c FROM sales WHERE created_at LIKE ?`)
      .get(`${NEXT_DAY}%`) as { c: number };
    expect(count.c).toBe(1);
  });

  it("la réouverture (suppression de la clôture) rouvre la journée", () => {
    db.prepare(`DELETE FROM daily_closings WHERE business_date = ?`).run(DAY);
    insertSale(db, "after-reopen", `${DAY}T11:00:00.000Z`);
    const count = db
      .prepare(`SELECT COUNT(*) AS c FROM sales WHERE created_at LIKE ?`)
      .get(`${DAY}%`) as { c: number };
    expect(count.c).toBe(2);
  });
});
