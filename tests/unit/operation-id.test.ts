// Veloria PoS — Tests P1-6 : couche centrale operationId + rejouabilité.
// 1) schemaRequiresOperationId : true pour les schémas à UUID REQUIS
//    (ZodString nu), false pour optionnels/compat et schémas sans champ.
// 2) Miroir double-clic : même operationId rejoué = UN seul effet (zakat.save).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

describe("P1-6 : double-clic zakat.save = UNE seule ligne (miroir)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-opid-"));
  });
  afterEach(() => {
    for (let i = 0; i < 5; i += 1) {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
        return;
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("même operationId rejoué → 2e appel no-op", () => {
    const db = new DatabaseSync(path.join(tmp, "z.sqlite"));
    try {
      db.exec(`CREATE TABLE zakat_calculations (id INTEGER PRIMARY KEY, v INTEGER NOT NULL);
        CREATE TABLE idempotency_keys (operation_id TEXT PRIMARY KEY, op_type TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL);`);
      const op = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
      const run = (): { id: number } => {
        const hit = db
          .prepare("SELECT result_json FROM idempotency_keys WHERE operation_id = ?")
          .get(op) as { result_json: string } | undefined;
        if (hit && hit.result_json !== "{}") return JSON.parse(hit.result_json) as { id: number };
        db.exec("BEGIN;");
        try {
          db.prepare(
            "INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, 'zakat.save', '{}', ?)",
          ).run(op, "2026-09-20T00:00:00.000Z");
          const r = db.prepare("INSERT INTO zakat_calculations (v) VALUES (8250)").run();
          const out = { id: Number(r.lastInsertRowid) };
          db.prepare("UPDATE idempotency_keys SET result_json = ? WHERE operation_id = ?").run(
            JSON.stringify(out),
            op,
          );
          db.exec("COMMIT;");
          return out;
        } catch {
          db.exec("ROLLBACK;");
          throw new Error("Échec simulé.");
        }
      };
      const first = run();
      const second = run();
      expect(second).toEqual(first);
      const n = db.prepare("SELECT COUNT(*) AS n FROM zakat_calculations").get() as { n: number };
      expect(n.n).toBe(1);
    } finally {
      db.close();
    }
  });
});
