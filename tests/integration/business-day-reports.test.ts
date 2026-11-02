// Veloria PoS — E-35 : la journée métier (Africa/Algiers) est la même partout.
// Preuve d'intégration sur base migrée réelle (node:sqlite) : une vente saisie
// à 00:30 heure du magasin (= 23:30Z la veille) appartient au jour J, pas à
// J−1, dans le tableau de bord, les rapports, la clôture Z et l'historique.
// Sans la correction, ces quatre agrégats divergeaient d'une heure — et le
// rapport Z signé la veille devenait silencieusement faux.
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
  getLastIntegrityResult: () => ({ integrity: "ok", at: "2026-09-02T08:00:00.000Z" }),
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
import {
  createDailyClosingAtomic,
  getReportsSummary,
} from "../../electron/ipc/handlers/finance.repo";
import { listHistory } from "../../electron/ipc/handlers/history.repo";
import { businessDayOf } from "@/domain/common/business-day.ts";

const DAY = "2026-09-02";
const PREVIOUS = "2026-09-01";
/** 23:30Z du 1er septembre = 00:30 du 2 à Alger → journée métier `DAY`. */
const EDGE_IN = "2026-09-01T23:30:00.000Z";
/** 22:30Z du 1er = 23:30 algérien → toujours journée `PREVIOUS`. */
const EDGE_OUT = "2026-09-01T22:30:00.000Z";

interface Kpis {
  salesMinor: number;
  salesCount: number;
  cashMinor: number;
}

function insertSale(db: DatabaseSync, uuid: string, createdAt: string, totalMinor: number): void {
  db.prepare(
    `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor,
       amount_paid_minor, remaining_balance_minor, payment_status, payment_method, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, 0, 'paid', 'cash', ?, ?)`,
  ).run(uuid, `FAC-${uuid}`, totalMinor, totalMinor, totalMinor, createdAt, createdAt);
  // Encaissement RATTACHÉ à la vente (sale_id NOT NULL : jamais compté deux
  // fois au Z) et daté du JOUR MÉTIER de l'activité — colonne date-seule.
  const saleId = (db.prepare(`SELECT id FROM sales WHERE uuid = ?`).get(uuid) as { id: number }).id;
  db.prepare(
    `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at)
     VALUES (?, ?, NULL, ?, 'cash', ?, ?)`,
  ).run(`pay-${uuid}`, saleId, totalMinor, businessDayOf(createdAt), createdAt);
}

describe("E-35 : une vente de 00:30 (Algiers) compte dans sa journée", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-bizday-"));
    db = new DatabaseSync(path.join(tmp, "bizday.sqlite"));
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys=ON;");
    repoDb.current = db;
    insertSale(db, "edge-in", EDGE_IN, 700);
    insertSale(db, "edge-out", EDGE_OUT, 300);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    repoDb.current = null;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("tableau de bord : la journée `DAY` contient la vente de 00:30", () => {
    const summary = getDashboardSummary(DAY, DAY) as {
      kpis: Kpis;
      daily: { d: string; t: number; n: number }[];
    };
    expect(summary.kpis.salesMinor).toBe(700);
    expect(summary.kpis.salesCount).toBe(1);
    expect(summary.kpis.cashMinor).toBe(700);
    expect(summary.daily).toEqual([{ d: DAY, t: 700, n: 1 }]);
  });

  it("tableau de bord : la journée précédente contient la vente de 23:30 algérien", () => {
    const summary = getDashboardSummary(PREVIOUS, PREVIOUS) as {
      kpis: Kpis;
      daily: { d: string; t: number; n: number }[];
    };
    expect(summary.kpis.salesMinor).toBe(300);
    expect(summary.daily).toEqual([{ d: PREVIOUS, t: 300, n: 1 }]);
  });

  it("rapports : mêmes bornes métier que le tableau de bord", () => {
    const report = getReportsSummary({
      from: DAY,
      to: DAY,
      customerId: null,
      supplierId: null,
      categoryId: null,
    }) as {
      kpis: Kpis;
      buckets: { date: string; sales: number }[];
    };
    expect(report.kpis.salesMinor).toBe(700);
    expect(report.kpis.salesCount).toBe(1);
    expect(report.buckets).toEqual([
      { date: DAY, sales: 700, purchases: 0, expenses: 0, profit: 700 },
    ]);
  });

  it("clôture Z : le tiroir du jour `DAY` = la vente de 00:30 uniquement", () => {
    const closing = createDailyClosingAtomic({
      businessDate: DAY,
      openingMinor: 0,
      operationId: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
      now: "2026-09-02T22:00:00.000Z",
    }) as { cashSalesMinor: number; closingMinor: number };
    expect(closing.cashSalesMinor).toBe(700);
    expect(closing.closingMinor).toBe(700);
  });

  it("historique : la fenêtre du jour `DAY` exclut la vente de 23:30 algérien", () => {
    const { rows, total } = listHistory({
      op: "all",
      from: DAY,
      to: DAY,
      query: "",
      sort: "date_desc",
      page: 1,
      pageSize: 50,
    });
    const refs = rows.map((r) => String((r as { ref: string }).ref));
    // La vente de 00:30 (Algiers) ET son encaissement du même jour : 2 lignes.
    expect(refs).toContain("FAC-edge-in");
    expect(refs).not.toContain("FAC-edge-out");
    expect(total).toBe(2);

    const prev = listHistory({
      op: "all",
      from: PREVIOUS,
      to: PREVIOUS,
      query: "",
      sort: "date_desc",
      page: 1,
      pageSize: 50,
    });
    const prevRefs = prev.rows.map((r) => String((r as { ref: string }).ref));
    expect(prevRefs).toContain("FAC-edge-out");
    expect(prevRefs).not.toContain("FAC-edge-in");
    expect(prev.total).toBe(2);
  });

  it("une journée clôturée refuse la vente de 00:30 de ce jour (trigger 0058)", () => {
    db.prepare(
      `INSERT INTO daily_closings (uuid, business_date, cash_sales_minor, cash_payments_minor,
         customer_collections_minor, expenses_minor, refunds_minor, closing_balance_minor, closed_at)
       VALUES ('cl-bz', ?, 700, 0, 0, 0, 0, 700, ?)`,
    ).run(DAY, "2026-09-02T22:00:00.000Z");
    // 2026-09-01T23:15Z = 00:15 du 2 septembre à Alger → journée CLOSE → refus.
    expect(() => insertSale(db, "blocked", "2026-09-01T23:15:00.000Z", 50)).toThrow(/clôturée/);
    // 2026-09-02T23:15Z = 00:15 du 3 septembre → journée OUVERTE → acceptée.
    insertSale(db, "next-day", "2026-09-02T23:15:00.000Z", 50);
    const count = db
      .prepare(`SELECT COUNT(*) AS c FROM sales WHERE uuid IN ('blocked','next-day')`)
      .get() as { c: number };
    expect(count.c).toBe(1);
  });
});
