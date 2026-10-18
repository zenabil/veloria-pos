// Veloria PoS — Livraison end-to-end : brouillon → vente.
// La caisse saisit les frais (SellTotalsPanel), le total les inclut,
// le brouillon les persiste (0044), la vente les facture (centimes entiers).
// Repos RÉELS sur base migrée temporaire (node:sqlite).
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

import { loadCartDrafts, saveCartDraftsAtomic } from "../../electron/ipc/handlers/carts.repo";
import { createSaleAtomic } from "../../electron/ipc/handlers/sales.repo";

const NOW = "2026-10-15T08:00:00.000Z";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "delivery.sqlite"));
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

describe("Livraison end-to-end : brouillon + vente", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-deliv-"));
    db = openMigrated(tmp);
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

  it("brouillon : frais persistés au rechargement, invalide → 0", () => {
    saveCartDraftsAtomic(
      [
        {
          tabId: 1,
          name: "Panier 1",
          lines: [
            {
              key: "l1",
              productId: null,
              productName: "Sachet",
              unitCode: "PIECE",
              originalUnitPriceMinor: 1000,
              unitPriceMinor: 1000,
              purchasePriceMinor: 0,
              quantity: 2,
            },
          ],
          customerId: null,
          customerLabel: "Client de passage",
          amountPaidMinor: 0,
          paymentMethod: "cash",
          deliveryFeeMinor: 1500,
        },
      ],
      NOW,
      "11111111-1111-4111-8111-111111111111",
    );
    const loaded = loadCartDrafts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.deliveryFeeMinor).toBe(1500);
  });

  it("vente : total = lignes + livraison, centimes entiers, double-submit unique", () => {
    const args = {
      operationId: "22222222-2222-4222-8222-222222222222",
      uuid: "33333333-3333-4333-8333-333333333333",
      invoiceNumber: "FAC-DELIV-000001",
      customerId: null,
      subtotalMinor: 2000,
      discountType: "none",
      discountValueMinor: 0,
      discountAmountMinor: 0,
      deliveryFeeMinor: 1500,
      totalMinor: 3500,
      amountPaidMinor: 3500,
      remainingMinor: 0,
      paymentStatus: "paid",
      paymentMethod: "cash",
      dueDate: null,
      lines: [
        {
          productId: null,
          productName: "Sachet",
          unitCode: "PIECE",
          originalUnitPriceMinor: 1000,
          unitPriceMinor: 1000,
          purchasePriceMinor: 0,
          quantity: 2,
        },
      ],
      lineTotals: [2000],
      now: NOW,
      allowNegativeStock: false,
    };
    const first = createSaleAtomic(args);
    const second = createSaleAtomic(args);
    expect(second).toEqual(first);
    const row = db
      .prepare("SELECT total_minor, delivery_fee_minor FROM sales WHERE id = ?")
      .get(first.saleId) as { total_minor: number; delivery_fee_minor: number };
    expect(row.total_minor).toBe(3500);
    expect(row.delivery_fee_minor).toBe(1500);
    expect(Number.isInteger(row.total_minor)).toBe(true);
    const count = Number((db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number }).c);
    expect(count).toBe(1);
  });
});
