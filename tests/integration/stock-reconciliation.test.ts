// Veloria PoS — STK-01 : DIAGNOSTIC de réconciliation du stock.
//
// L'audit a constaté que le diagnostic exigé par la compétence
// `veloria-stock` (règle FIFO 7 : « Reconcile aggregate layer quantity to
// product quantity and report any unexplained difference ») N'EXISTAIT PAS.
//
// Ce test prouve que le diagnostic existe ET qu'il DÉTECTE une dérive
// réelle — un rapport qui renvoie toujours « tout va bien » ne prouverait
// rien. Les trois sources rapprochées sont indépendantes :
//   1. `products.quantity` (l'agrégat affiché au caissier) ;
//   2. `SUM(inventory_layers.remaining_quantity)` (les couches FIFO) ;
//   3. le grand livre des mouvements (ouverture reconstituée + Σ deltas).
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

import { reconcileStock } from "../../electron/ipc/handlers/inventory.repo";

describe("STK-01 : diagnostic de réconciliation du stock", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-reconcile-"));
    db = new DatabaseSync(path.join(tmp, "reconcile.sqlite"));
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

  function seedProduct(name: string, quantity: number): number {
    db.prepare(
      `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at)
       VALUES (?, ?, 'PIECE', 100, 200, ?, 0, 'in_stock', '2026-09-01', '2026-09-01')`,
    ).run(crypto.randomUUID(), name, quantity);
    return Number(
      (db.prepare("SELECT id FROM products WHERE name = ?").get(name) as { id: number }).id,
    );
  }

  function seedLayer(productId: number, remaining: number, original = remaining): void {
    db.prepare(
      `INSERT INTO inventory_layers (uuid, product_id, original_quantity, remaining_quantity, unit_cost_minor, reason, created_at)
       VALUES (?, ?, ?, ?, 100, 'intake', '2026-09-02')`,
    ).run(crypto.randomUUID(), productId, original, remaining);
  }

  function seedMovement(productId: number, delta: number, after: number): void {
    db.prepare(
      `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, reason, created_at)
       VALUES (?, ?, 'intake_in', ?, ?, 'Test', '2026-09-02')`,
    ).run(crypto.randomUUID(), productId, delta, after);
  }

  it("une fiche cohérente n'est PAS signalée (pas de faux positif)", () => {
    const pid = seedProduct("Farine", 10);
    seedLayer(pid, 10);
    seedMovement(pid, 10, 10);

    const report = reconcileStock();
    expect(report.summary.products).toBe(1);
    expect(report.summary.ok).toBe(1);
    expect(report.summary.drifted).toBe(0);
    expect(report.rows).toHaveLength(0);
  });

  it("une dérive entre la quantité produit et les couches FIFO est DÉTECTÉE", () => {
    const pid = seedProduct("Sucre", 10);
    seedLayer(pid, 8); // 2 unités manquantes dans les couches
    seedMovement(pid, 10, 10);

    const report = reconcileStock();
    expect(report.summary.drifted).toBe(1);
    expect(report.summary.layerDrifted).toBe(1);
    const row = report.rows[0];
    expect(row?.status).toBe("layer-drift");
    expect(row?.productQuantity).toBe(10);
    expect(row?.layerQuantity).toBe(8);
    expect(row?.layerDrift).toBe(2);
  });

  it("une dérive entre la quantité produit et le grand livre est DÉTECTÉE", () => {
    const pid = seedProduct("Huile", 12);
    seedLayer(pid, 12);
    seedMovement(pid, 10, 10); // le journal s'arrête à 10

    const report = reconcileStock();
    expect(report.summary.drifted).toBe(1);
    expect(report.summary.ledgerDrifted).toBe(1);
    const row = report.rows[0];
    expect(row?.status).toBe("ledger-drift");
    expect(row?.ledgerQuantity).toBe(10);
    expect(row?.ledgerDrift).toBe(2);
  });

  it("la quantité d'ouverture est RECONSTITUITE, pas supposée", () => {
    // Produit créé avec 5, puis vente de 2 ⇒ mouvement : delta −2, after 3.
    // L'ouverture se lit : after − delta = 3 − (−2) = 5. Dérivé = 5 − 2 = 3.
    const pid = seedProduct("Riz", 3);
    seedLayer(pid, 3);
    seedMovement(pid, 5, 5);
    seedMovement(pid, -2, 3);

    const report = reconcileStock();
    expect(report.summary.drifted).toBe(0);
    expect(report.summary.ok).toBe(1);
  });

  it("le diagnostic est en LECTURE SEULE (aucune écriture)", () => {
    const pid = seedProduct("Sucre", 10);
    seedLayer(pid, 8);
    seedMovement(pid, 10, 10);
    const before = {
      products: db.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number },
      layers: db.prepare("SELECT COUNT(*) AS c FROM inventory_layers").get() as { c: number },
      movements: db.prepare("SELECT COUNT(*) AS c FROM stock_movements").get() as { c: number },
      qty: db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as {
        quantity: number;
      },
    };

    reconcileStock();

    const after = {
      products: db.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number },
      layers: db.prepare("SELECT COUNT(*) AS c FROM inventory_layers").get() as { c: number },
      movements: db.prepare("SELECT COUNT(*) AS c FROM stock_movements").get() as { c: number },
      qty: db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as {
        quantity: number;
      },
    };
    expect(after).toEqual(before);
  });

  it("le rapport distingue les deux types de dérive", () => {
    const ok = seedProduct("A", 10);
    seedLayer(ok, 10);
    seedMovement(ok, 10, 10);

    const layerBad = seedProduct("B", 10);
    seedLayer(layerBad, 5);
    seedMovement(layerBad, 10, 10);

    const ledgerBad = seedProduct("C", 10);
    seedLayer(ledgerBad, 10);
    seedMovement(ledgerBad, 10, 8);

    const report = reconcileStock();
    expect(report.summary.products).toBe(3);
    expect(report.summary.ok).toBe(1);
    expect(report.summary.layerDrifted).toBe(1);
    expect(report.summary.ledgerDrifted).toBe(1);
    expect(report.rows.map((r) => r.status).sort()).toEqual(["layer-drift", "ledger-drift"]);
  });
});
