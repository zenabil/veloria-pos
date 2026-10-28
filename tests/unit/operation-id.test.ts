// Veloria PoS — Tests P1-6 : couche centrale operationId + rejouabilité.
// 1) schemaRequiresOperationId : true pour les schémas à UUID REQUIS
//    (ZodString nu), false pour optionnels/compat et schémas sans champ.
// 2) Double-clic : même operationId rejoué = UN seul effet (zakat.save) —
//    I-03 (W4) : testé sur la FONCTION DE PRODUCTION, plus sur un miroir.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  schemaRequiresOperationId,
  saleCreateSchema,
  zakatCalculationSchema,
  idempotentIdSchema,
  idSchema,
  expenseDeleteSchema,
  paginationSchema,
  productUpdateSchema,
} from "../../electron/ipc/validators.ts";

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

vi.mock("../../electron/backup/backup.service", () => ({
  backupStatus: () => ({ lastBackupAt: null }),
}));

import { saveZakatCalculation } from "../../electron/ipc/handlers/finance.repo";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "operation-id.sqlite"));
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

describe("P1-6 : couche centrale operationId", () => {
  it("exige un UUID pour les mutations idempotentes", () => {
    expect(schemaRequiresOperationId(saleCreateSchema)).toBe(true);
    expect(schemaRequiresOperationId(zakatCalculationSchema)).toBe(true);
    expect(schemaRequiresOperationId(idempotentIdSchema)).toBe(true);
  });
  it("laisse passer lectures, compat optionnelle et updates par valeur", () => {
    expect(schemaRequiresOperationId(idSchema)).toBe(false);
    expect(schemaRequiresOperationId(paginationSchema)).toBe(false);
    expect(schemaRequiresOperationId(productUpdateSchema)).toBe(false);
    expect(schemaRequiresOperationId(null)).toBe(false);
    expect(schemaRequiresOperationId({})).toBe(false);
  });
  // A-10 (P1) : la suppression d'une DÉPENSE est désormais idempotente
  // (operationId EXIGÉ) — la suppression financière n'est plus « au
  // hasard » (UUID aléatoire pour l'audit). Contrat modifié = gel modifié.
  it("A-10 : la suppression d'une dépense exige un operationId", () => {
    expect(schemaRequiresOperationId(expenseDeleteSchema)).toBe(true);
    expect(() => expenseDeleteSchema.parse({ id: 1 })).toThrow();
    expect(
      expenseDeleteSchema.parse({ id: 1, operationId: "11111111-1111-4111-8111-111111111111" }).id,
    ).toBe(1);
  });
  it("zakat.save refuse sans operationId (Zod, avant même le repo)", () => {
    expect(() =>
      zakatCalculationSchema.parse({ hijriYear: "1447", calcDate: "2026-09-20" }),
    ).toThrow();
  });
});

// I-03 (W4, audit 2026-10-19) : ce test REIMPLÉMENTAIT l'algorithme
// d'idempotence dans le fichier (« miroir ») — il restait vert même si la
// production perdait la propriété « exactement-une-fois ». Il appelle
// désormais la fonction de PRODUCTION (`saveZakatCalculation`) sur une base
// migrée, avec le même `operationId` rejoué.
describe("P1-6 : double-clic zakat.save = UNE seule ligne (PRODUCTION)", () => {
  let tmp: string;
  let db: DatabaseSync;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-opid-"));
    db = openMigrated(tmp);
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

  it("même operationId rejoué → un seul enregistrement", () => {
    const op = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
    const args = {
      hijriYear: "1447",
      calcDate: "2026-09-20",
      cashMinor: 100000,
      bankMinor: 200000,
      stockMinor: 50000,
      receivablesMinor: 0,
      otherMinor: 0,
      liabilitiesMinor: 20000,
      nisabMinor: 100000,
      ratePercent: 2.5,
      notes: null,
      operationId: op,
      now: "2026-09-20T00:00:00.000Z",
    };
    const first = saveZakatCalculation(args);
    const second = saveZakatCalculation(args);
    expect(second).toEqual(first);
    const n = db.prepare("SELECT COUNT(*) AS n FROM zakat_calculations").get() as { n: number };
    expect(n.n).toBe(1);
    // Le montant est celui du DOMAINE (2,5 % de 330 000 = 8 250 centimes).
    const row = db
      .prepare("SELECT zakat_minor AS z, net_minor AS n FROM zakat_calculations")
      .get() as { z: number; n: number };
    expect(row.z).toBe(8250);
    expect(row.n).toBe(330000);
  });
});
