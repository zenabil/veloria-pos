// Veloria PoS — Reçu d'un paiement client (grand-livre).
//
// I-03 (W4, audit 2026-10-19) : ce test reimplementait dans le fichier la
// logique de `getCustomerPaymentReceipt` (« miroir ») — il restait VERT même
// si la fonction de production était supprimée ou inversée. Le test appelle
// désormais la FONCTION DE PRODUCTION sur une base migrée réelle.
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

import { getCustomerPaymentReceipt } from "../../electron/ipc/handlers/customers.repo";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "payment-receipt.sqlite"));
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

describe("Reçu d'un paiement client (fonction de production)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-receipt-"));
    db = openMigrated(tmp);
    (repoDb as { current: unknown; depth: number }).current = db;
    (repoDb as { current: unknown; depth: number }).depth = 0;
    db.prepare(
      `INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, initial_balance_minor, outstanding_balance_minor, created_at, updated_at)
       VALUES ('c-receipt','Amine','Benali','amine benali',1,0,0,'2026-01-01','2026-01-01')`,
    ).run();
    db.prepare(
      `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at)
       VALUES ('s-receipt','FAC-RECEIPT-1',1,20000,20000,0,20000,'unpaid','2026-01-01T10:00:00.000Z','2026-01-01T10:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at)
       VALUES ('pay-receipt-1', NULL, 1, 5000, 'cash', '2026-01-02', '2026-01-02T10:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at)
       VALUES ('pay-receipt-2', NULL, 1, 7000, 'cash', '2026-01-03', '2026-01-03T10:00:00.000Z')`,
    ).run();
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

  it("reconstitue les soldes AVANT et APRÈS le paiement visé", () => {
    const receipt = getCustomerPaymentReceipt(2);
    expect(receipt.prevBalanceMinor).toBe(15000);
    expect(receipt.newBalanceMinor).toBe(8000);
    expect(receipt.payment["id"]).toBe(2);
    expect(receipt.customer["id"]).toBe(1);
  });

  it("un paiement inconnu est refusé (jamais de reçu inventé)", () => {
    expect(() => getCustomerPaymentReceipt(999)).toThrow(/introuvable/i);
  });

  it("une vente annulée ne gonfle pas le solde : reçu incohérent REFUSÉ", () => {
    db.prepare(`UPDATE sales SET is_cancelled = 1 WHERE id = 1`).run();
    // Sans la vente, le solde de départ devient négatif (un encaissement
    // sans dette) : la production REFUSE le reçu (« soldes incohérents »)
    // au lieu d'inventer un montant. Comportement réel, pas un miroir.
    expect(() => getCustomerPaymentReceipt(1)).toThrow(/incohérents/);
  });
});
