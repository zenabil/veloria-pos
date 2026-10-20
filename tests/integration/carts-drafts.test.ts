// Veloria PoS — Brouillons paniers (P4-a).
//
// I-03 (W4, audit 2026-10-19) : ce test reimplementait le filtre de lignes
// dans le fichier (« miroir ») — il restait vert même si le chargeur de
// production changeait. Il appelle désormais les fonctions de PRODUCTION
// (`saveCartDraftsAtomic` / `loadCartDrafts` / `clearCartDraftsAtomic`) sur
// une base migrée.
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

import {
  saveCartDraftsAtomic,
  loadCartDrafts,
  clearCartDraftsAtomic,
  type CartDraftTab,
} from "../../electron/ipc/handlers/carts.repo";

const NOW = "2026-09-20T00:00:00.000Z";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "carts.sqlite"));
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

function tab(over: Partial<CartDraftTab> = {}): CartDraftTab {
  return {
    tabId: 1,
    name: "Panier 1",
    lines: [
      {
        key: "l1",
        productId: 7,
        productName: "Huile",
        unitCode: "PIECE",
        originalUnitPriceMinor: 10000,
        unitPriceMinor: 9000,
        purchasePriceMinor: 8000,
        quantity: 2,
      },
    ],
    customerId: null,
    customerLabel: "Client de passage",
    amountPaidMinor: 0,
    paymentMethod: "cash",
    deliveryFeeMinor: 0,
    ...over,
  };
}

describe("P4-a : brouillons paniers (fonctions de production)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-carts-"));
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

  it("save remplace en bloc, load restitue, clear vide", () => {
    const saved = saveCartDraftsAtomic([tab()], NOW);
    expect(saved.saved).toBe(1);
    const rows = db.prepare("SELECT * FROM cart_drafts ORDER BY tab_id").all() as {
      tab_id: number;
      lines_json: string;
    }[];
    expect(rows).toHaveLength(1);
    const back = JSON.parse(rows[0]?.lines_json ?? "[]") as { key: string }[];
    expect(back).toHaveLength(1);
    expect(back[0]?.key).toBe("l1");

    const loaded = loadCartDrafts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.tabId).toBe(1);
    expect(loaded[0]?.lines[0]?.key).toBe("l1");

    clearCartDraftsAtomic();
    expect((db.prepare("SELECT COUNT(*) AS n FROM cart_drafts").get() as { n: number }).n).toBe(0);
    expect(loadCartDrafts()).toHaveLength(0);
  });

  it("ligne corrompue ignorée (jamais de crash au chargement)", () => {
    // Une ligne sans clé / quantité négative : le chargeur de production la
    // rejette, l'onglet vide est sauté ⇒ aucun brouillon invalide exposé.
    db.prepare(
      "INSERT INTO cart_drafts (tab_id, name, lines_json, updated_at) VALUES (1, 'P1', ?, ?)",
    ).run(JSON.stringify([{ key: "", productName: "", quantity: -5 }]), "2026-09-20T00:00:00.000Z");
    expect(loadCartDrafts()).toHaveLength(0);
  });
});
