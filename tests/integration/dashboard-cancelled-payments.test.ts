// Veloria PoS — Tests L1 : encaissements des KPIs ≠ paiements de ventes annulées.
// Repo RÉEL testé sur base migrée temporaire (node:sqlite) : `cancelSaleAtomic`
// SUPPRIME désormais les lignes `sale_payments` de la vente annulée (E-25 :
// l'encaissement n'a jamais eu lieu) — mais tout KPI qui somme `sale_payments`
// DOIT quand même filtrer `sales.is_cancelled` : (a) défense en profondeur,
// (b) lignes historiques créées avant le correctif.
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
        all: (...params: unknown[]) => unknown;
        get: (...params: unknown[]) => unknown;
        run: (...params: unknown[]) => { changes: number | bigint };
      };
      exec: (sql: string) => void;
    } | null;
    if (!db) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => db.prepare(sql),
      // RADICAL-FIX: sémantique transactionnelle réelle (BEGIN/COMMIT/ROLLBACK)
      // comme client-access-sync.test — jamais de no-op silencieux.
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
              /* rollback best-effort */
            }
            throw err;
          }
        },
    };
  },
  integrityCheck: () => ({ integrity: "ok", foreignKeys: [] }),
}));

vi.mock("../../electron/services/logger", () => ({
  log: () => {},
  initLogger: () => "",
  getLogFile: () => "",
}));

// finance.repo n'utilise que `backupStatus` (diagnostic « dernière sauvegarde »).
vi.mock("../../electron/backup/backup.service", () => ({
  backupStatus: () => ({ count: 0, lastAt: null, lastFile: null, auto: null }),
}));

import { getDashboardSummary, getReportsSummary } from "../../electron/ipc/handlers/finance.repo";
import { getCustomerStats } from "../../electron/ipc/handlers/customers.repo";

const DAY_MS = 86_400_000;

describe("L1 : encaissements alignés sur les ventes non annulées", () => {
  let tmp: string;
  let db: DatabaseSync;
  let from: string;
  let to: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-l1-"));
    db = new DatabaseSync(path.join(tmp, "l1.sqlite"));
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    repoDb.current = db;

    const now = Date.now();
    const iso = (offsetDays: number): string =>
      new Date(now - offsetDays * DAY_MS).toISOString().slice(0, 10);
    to = iso(1);
    from = iso(4);
    const stamp = `${to}T10:00:00.000Z`;

    const sale = db.prepare(
      `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor,
        amount_paid_minor, remaining_balance_minor, payment_status, is_cancelled,
        payment_method, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, 0, 'paid', ?, 'cash', ?, ?)`,
    );
    sale.run("s-ok", "FAC-L1-00001", 10000, 10000, 10000, 0, stamp, stamp); // valide
    sale.run("s-ko", "FAC-L1-00002", 5000, 5000, 5000, 1, stamp, stamp); // annulée

    const pay = db.prepare(
      `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at)
       VALUES (?, ?, NULL, ?, 'cash', ?, ?)`,
    );
    pay.run("p-ok", 1, 10000, to, stamp); // encaissé sur vente valide
    pay.run("p-ko", 2, 5000, to, stamp); // encaissé sur vente ANNULÉE
    pay.run("p-standalone", null, 700, to, stamp); // encaissement autonome
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

  it("dashboard : cashMinor et encaissements récents excluent la vente annulée", () => {
    const dash = getDashboardSummary(from, to) as {
      kpis: { salesMinor: number; cashMinor: number };
      recent: { payments: { dir: string; amount_minor: number }[] };
    };
    expect(dash.kpis.salesMinor).toBe(10000);
    // encaissé 10700 (10000 + 700 autonome) − décaissé 0 − dépenses 0.
    expect(dash.kpis.cashMinor).toBe(10700);
    const inflow = dash.recent.payments
      .filter((p) => p.dir === "in")
      .reduce((sum, p) => sum + p.amount_minor, 0);
    expect(inflow).toBe(10700);
  });

  it("rapports : payments.inMinor exclut la vente annulée", () => {
    const rep = getReportsSummary({
      from,
      to,
      customerId: null,
      supplierId: null,
      categoryId: null,
    }) as { payments: { inMinor: number } };
    expect(rep.payments.inMinor).toBe(10700);
  });

  it("écran Clients : encaissements 7 jours exclusifs des ventes annulées", () => {
    const stats = getCustomerStats();
    expect(stats.recentPaymentsMinor).toBe(10700);
  });
});
