// Veloria PoS — P1 : double-submit LWW (client + échéance) même operationId = effet unique.
// Repos RÉELS sur base migrée temporaire (node:sqlite) : rejouer le même UUID
// ne ré-applique pas (pas de 2e audit, pas de 2e écriture).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const db = repoDb.current as {
      prepare: (sql: string) => {
        all: (...p: unknown[]) => unknown[];
        get: (...p: unknown[]) => unknown;
        run: (...p: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
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
              /* best-effort */
            }
            throw err;
          }
        },
    };
  },
}));

import { updateCustomer } from "../../electron/ipc/handlers/customers.repo";
import { updateSaleDueDate } from "../../electron/ipc/handlers/sales.repo";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "lww.sqlite"));
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  return db;
}

describe("P1 : LWW idempotents par operationId (client + échéance)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-lww-"));
    db = openMigrated(tmp);
    repoDb.current = db;
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

  it("customers.update rejoué même operationId = un seul audit, une seule écriture", () => {
    const now = "2026-10-14T00:00:00.000Z";
    const op = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('c-lww','Karim','Ziani','karim ziani',0,'2026-01-01','2026-01-01')",
    ).run();
    const id = (db.prepare("SELECT id FROM customers WHERE uuid = 'c-lww'").get() as { id: number })
      .id;
    const args = {
      id,
      firstName: "Karim",
      lastName: "Ziani",
      phone: "0550000000",
      address: null as string | null,
      creditLimitMinor: 0,
      creditAllowed: false,
      settlementDay: null as number | null,
      notes: null as string | null,
      now,
      operationId: op,
    };
    updateCustomer(args);
    updateCustomer(args);
    const audits = db
      .prepare(
        "SELECT COUNT(*) AS n FROM audit_log WHERE entity_type = 'customer' AND entity_id = ? AND operation_id = ?",
      )
      .get(String(id), op) as { n: number };
    expect(audits.n).toBe(1);
    const row = db.prepare("SELECT phone FROM customers WHERE id = ?").get(id) as {
      phone: string;
    };
    expect(row.phone).toBe("0550000000");
  });

  it("sales.setDueDate rejoué même operationId = une seule écriture, vente intacte", () => {
    const now = "2026-10-14T00:00:00.000Z";
    const op = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('c-due','Lina','Haddad','lina haddad',1,'2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('u-due','FAC-2026-00999',1,1000,1000,500,500,'partial','2026-01-01','2026-01-01')",
    ).run();
    const saleId = (
      db.prepare("SELECT id FROM sales WHERE invoice_number = 'FAC-2026-00999'").get() as {
        id: number;
      }
    ).id;
    updateSaleDueDate(saleId, "2026-12-31", now, op);
    updateSaleDueDate(saleId, "2026-12-31", now, op);
    const sale = db.prepare("SELECT due_date FROM sales WHERE id = ?").get(saleId) as {
      due_date: string;
    };
    expect(sale.due_date).toBe("2026-12-31");
    const audits = db
      .prepare(
        "SELECT COUNT(*) AS n FROM audit_log WHERE entity_type = 'sale' AND entity_id = ? AND operation_id = ?",
      )
      .get(String(saleId), op) as { n: number };
    expect(audits.n).toBe(1);
  });

  it("rollback : échéance sur vente annulée = rien d'écrit, erreur FR", () => {
    const now = "2026-10-14T00:00:00.000Z";
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('c-rb','Sara','Merbah','sara merbah',1,'2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, is_cancelled, created_at, updated_at) VALUES ('u-rb','FAC-2026-00998',1,1000,1000,500,500,'partial',1,'2026-01-01','2026-01-01')",
    ).run();
    const saleId = (
      db.prepare("SELECT id FROM sales WHERE invoice_number = 'FAC-2026-00998'").get() as {
        id: number;
      }
    ).id;
    expect(() =>
      updateSaleDueDate(saleId, "2026-12-31", now, "cccccccc-cccc-4ccc-cccc-cccccccccccc"),
    ).toThrow();
    const sale = db.prepare("SELECT due_date FROM sales WHERE id = ?").get(saleId) as {
      due_date: string | null;
    };
    expect(sale.due_date).toBe(null);
  });
});
