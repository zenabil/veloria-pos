// Veloria PoS — Réception : la livraison est répartie sur chaque produit et
// le coût enregistré dans la fiche devient le coût rendu (fret inclus).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted((): { current: DatabaseSync | null } => ({ current: null }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const db = repoDb.current;
    if (!db) throw new Error("Base de test non ouverte.");
    return db;
  },
}));

vi.mock("../../electron/services/logger", () => ({
  log: () => {},
  initLogger: () => "",
  getLogFile: () => "",
}));

import { receiveStockAtomic } from "../../electron/ipc/handlers/inventory.repo";

const NOW = "2026-10-26T10:00:00.000Z";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "intake-landed.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  return db;
}

/** node:sqlite n'a pas l'API `transaction` de better-sqlite3 : adaptateur test. */
function withTransactions(api: DatabaseSync): DatabaseSync {
  let depth = 0;
  return {
    prepare: (sql: string) => api.prepare(sql),
    exec: (sql: string) => {
      api.exec(sql);
    },
    get inTransaction(): boolean {
      return depth > 0;
    },
    transaction: (fn: () => unknown) => () => {
      const nested = depth > 0;
      if (nested) api.exec("SAVEPOINT nested;");
      else api.exec("BEGIN;");
      depth += 1;
      try {
        const out = fn();
        if (nested) api.exec("RELEASE nested;");
        else api.exec("COMMIT;");
        return out;
      } catch (e) {
        try {
          if (nested) {
            api.exec("ROLLBACK TO nested;");
            api.exec("RELEASE nested;");
          } else {
            api.exec("ROLLBACK;");
          }
        } catch {
          /* best-effort */
        }
        throw e;
      } finally {
        depth -= 1;
      }
    },
  } as unknown as DatabaseSync;
}

function seedProduct(db: DatabaseSync, name: string, cost: number): number {
  const ins = db
    .prepare(
      `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at)
       VALUES (?, ?, 'PIECE', ?, 2000, 0, 0, 'out_of_stock', 1, ?, ?)`,
    )
    .run(`${name}-uuid`, name, cost, NOW, NOW);
  return Number(ins.lastInsertRowid);
}

describe("réception : coût rendu par produit", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-landed-"));
    db = openMigrated(tmp);
    repoDb.current = withTransactions(db);
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

  it("répartit 600 DZD sur trois produits et stocke le coût rendu", () => {
    const p1 = seedProduct(db, "P1", 1000);
    const p2 = seedProduct(db, "P2", 3000);
    const res = receiveStockAtomic({
      supplierId: null,
      invoiceNumber: "F-LANDED",
      invoiceDate: "2026-10-26",
      shippingMinor: 600,
      notes: null,
      lines: [
        {
          productId: p1,
          productName: "P1",
          quantityReceived: 2,
          quantityDamaged: 0,
          purchasePriceMinor: 1000,
          sellingPriceMinor: null,
        },
        {
          productId: p2,
          productName: "P2",
          quantityReceived: 1,
          quantityDamaged: 0,
          purchasePriceMinor: 3000,
          sellingPriceMinor: null,
        },
        {
          productId: null,
          productName: "Nouveau produit",
          quantityReceived: 2,
          quantityDamaged: 0,
          purchasePriceMinor: 500,
          sellingPriceMinor: 900,
        },
      ],
      operationId: "22222222-2222-4222-8222-222222222222",
      now: NOW,
    });

    expect(res.totalMinor).toBe(6600);
    const costs = db
      .prepare("SELECT id, name, purchase_price_minor FROM products ORDER BY id")
      .all() as { id: number; name: string; purchase_price_minor: number }[];
    const byName = new Map(costs.map((r) => [r.name, Number(r.purchase_price_minor)]));
    // Parts : 200 / 300 / 100 (prorata 2 000 / 3 000 / 1 000).
    expect(byName.get("P1")).toBe(1100);
    expect(byName.get("P2")).toBe(3300);
    expect(byName.get("Nouveau produit")).toBe(550);

    const shares = db
      .prepare("SELECT product_name_snapshot, line_total_minor FROM stock_intake_items ORDER BY id")
      .all() as { product_name_snapshot: string; line_total_minor: number }[];
    expect(shares.map((r) => [r.product_name_snapshot, Number(r.line_total_minor)])).toEqual([
      ["P1", 2200],
      ["P2", 3300],
      ["Nouveau produit", 1100],
    ]);
    const sums = db
      .prepare(
        "SELECT COALESCE(SUM(remaining_quantity * unit_cost_minor),0) AS v FROM inventory_layers WHERE stock_intake_id = ?",
      )
      .get(res.intakeId) as { v: number };
    expect(Math.round(Number(sums.v))).toBe(6600);
  });
});
