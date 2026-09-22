// Veloria PoS — P0-1 : atomicité pain (miroirs node:sqlite du pattern repo).
// Prouve : échec en cours de tx = rollback TOTAL (commande + audit) et
// rejouabilité operationId (2e appel même UUID = replay, zéro doublon).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function openSeeded(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "bread.sqlite"));
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE bread_orders (id INTEGER PRIMARY KEY, order_status TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE audit_log (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE idempotency_keys (operation_id TEXT PRIMARY KEY, op_type TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO bread_orders (id, order_status, updated_at) VALUES (1, 'new', '2026-01-01T00:00:00.000Z');`);
  return db;
}

describe("P0-1 : update/status en UNE transaction", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-bread-"));
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

  it("échec audit en cours de tx → commande INCHANGÉE (rollback total)", () => {
    const db = openSeeded(tmp);
    try {
      // node:sqlite n'a pas .transaction() : BEGIN/COMMIT explicites (miroir
      // fidèle de better-sqlite3 db.transaction() du repo).
      db.exec("BEGIN;");
      try {
        db.prepare("UPDATE bread_orders SET order_status = ?, updated_at = ? WHERE id = ?").run(
          "confirmed",
          "2026-02-01T00:00:00.000Z",
          1,
        );
        // Audit en échec (colonne inexistante) APRÈS l'UPDATE.
        db.prepare("INSERT INTO audit_log (nope) VALUES (1)").run();
        db.exec("COMMIT;");
      } catch {
        db.exec("ROLLBACK;");
        throw new Error("Échec simulé en cours de transaction.");
      }
      expect.unreachable("la transaction aurait dû échouer");
    } catch (err) {
      expect((err as Error).message).toBe("Échec simulé en cours de transaction.");
    }
    const row = db.prepare("SELECT order_status FROM bread_orders WHERE id = 1").get() as {
      order_status: string;
    };
    expect(row.order_status).toBe("new");
    const audits = db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number };
    expect(audits.n).toBe(0);
    db.close();
  });

  it("même operationId rejoué → 2e appel no-op, UNE seule ligne audit", () => {
    const db = openSeeded(tmp);
    try {
      const op = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
      const run = (): { updated: boolean } => {
        const hit = db
          .prepare("SELECT result_json FROM idempotency_keys WHERE operation_id = ?")
          .get(op) as { result_json: string } | undefined;
        if (hit && hit.result_json !== "{}")
          return JSON.parse(hit.result_json) as { updated: boolean };
        db.exec("BEGIN;");
        try {
          db.prepare(
            "INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, 'bread.update', '{}', ?)",
          ).run(op, "2026-02-01T00:00:00.000Z");
          db.prepare("UPDATE bread_orders SET order_status = ?, updated_at = ? WHERE id = ?").run(
            "confirmed",
            "2026-02-01T00:00:00.000Z",
            1,
          );
          db.prepare(
            "INSERT INTO audit_log (event_id, event_type, entity_id, operation_id, created_at) VALUES (?, 'bread.updated', '1', ?, ?)",
          ).run("evt-1", op, "2026-02-01T00:00:00.000Z");
          db.prepare("UPDATE idempotency_keys SET result_json = ? WHERE operation_id = ?").run(
            JSON.stringify({ updated: true }),
            op,
          );
          db.exec("COMMIT;");
        } catch {
          db.exec("ROLLBACK;");
          throw new Error("Échec simulé.");
        }
        return { updated: true };
      };
      expect(run()).toEqual({ updated: true });
      expect(run()).toEqual({ updated: true });
      const audits = db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number };
      expect(audits.n).toBe(1);
      const row = db.prepare("SELECT order_status FROM bread_orders WHERE id = 1").get() as {
        order_status: string;
      };
      expect(row.order_status).toBe("confirmed");
    } finally {
      db.close();
    }
  });
});
