import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Tranche client APK : sémantique SQL simulée sur node:sqlite (sans Electron),
// comme atomic-slices — les repos main (better-sqlite3) partagent la grammaire.
// Cas : remplacement d'accès (un seul actif), révocation idempotente,
// file UNIQUE par operationId, annonces bornées.
function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "client-slice.sqlite"));
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

describe("Client access + sync outbox (SQL semantics)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-client-slice-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("activation remplace l'ancienne (un seul actif, compteur remis à zéro)", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('cs1','Karim','Ziani','karim ziani','2026-01-01','2026-01-01')",
    ).run();
    const activate = (pinHash: string): void => {
      db.exec("BEGIN;");
      try {
        db.prepare(`DELETE FROM customer_access WHERE customer_id = 1`).run();
        db.prepare(
          `INSERT INTO customer_access (customer_id, phone_hash, pin_hash, qr_secret_hash, revoked_at, failed_attempts, locked_until, created_at, updated_at)
           VALUES (1, 'ph', ?, 'qr', NULL, 0, NULL, '2026-01-01', '2026-01-01')`,
        ).run(pinHash);
        db.exec("COMMIT;");
      } catch (e) {
        db.exec("ROLLBACK;");
        throw e;
      }
    };
    activate("pin-v1");
    db.prepare(`UPDATE customer_access SET failed_attempts = 4 WHERE customer_id = 1`).run();
    activate("pin-v2");
    const rows = db
      .prepare(
        `SELECT pin_hash, failed_attempts, revoked_at FROM customer_access WHERE customer_id = 1`,
      )
      .all() as {
      pin_hash: string;
      failed_attempts: number;
      revoked_at: string | null;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pin_hash).toBe("pin-v2");
    expect(rows[0]?.failed_attempts).toBe(0);
    expect(rows[0]?.revoked_at).toBeNull();
    db.close();
  });

  it("révocation idempotente + file UNIQUE + annonce bornée", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('cs2','Sara','Merah','sara merah','2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, created_at, updated_at) VALUES (1, 'ph', 'pin', '2026-01-01', '2026-01-01')",
    ).run();
    // Révocation rejouée deux fois = no-op, pas d'erreur.
    db.prepare(
      `UPDATE customer_access SET revoked_at = ?, updated_at = ? WHERE customer_id = ?`,
    ).run("2026-09-01", "2026-09-01", 1);
    db.prepare(
      `UPDATE customer_access SET revoked_at = ?, updated_at = ? WHERE customer_id = ?`,
    ).run("2026-09-01", "2026-09-01", 1);
    const st = db.prepare(`SELECT revoked_at FROM customer_access WHERE customer_id = 1`).get() as {
      revoked_at: string;
    };
    expect(st.revoked_at).toBe("2026-09-01");
    // File : même operationId deux fois = conflit UNIQUE (le repo retrouve la file).
    db.prepare(
      "INSERT INTO sync_outbox (operation_id, kind, payload_json, created_at) VALUES ('op-s1', 'customer_snapshot', '{}', '2026-09-01')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO sync_outbox (operation_id, kind, payload_json, created_at) VALUES ('op-s1', 'customer_snapshot', '{}', '2026-09-01')",
        )
        .run(),
    ).toThrow();
    // Annonce > 120 refusée au niveau DB.
    expect(() =>
      db
        .prepare("INSERT INTO announcements (text, created_at) VALUES (?, '2026-09-01')")
        .run("y".repeat(121)),
    ).toThrow();
    const ic = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    expect(ic.integrity_check).toBe("ok");
    db.close();
  });

  it("file attribuée au client (0033) : customer_id persisté + requêtable", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('cs3','Nadia','Bouzid','nadia bouzid','2026-01-01','2026-01-01')",
    ).run();
    // INSERT miroir du repo (enqueueSnapshotAtomic) : sans customer_id la
    // poussée miroir levait `no such column` (P0 boucle POS→miroir coupée).
    db.prepare(
      "INSERT INTO sync_outbox (operation_id, customer_id, kind, payload_json, created_at) VALUES ('op-c1', 1, 'invoice_list', '{\"sales\":[]}', '2026-09-01')",
    ).run();
    const row = db
      .prepare(`SELECT operation_id, customer_id, kind FROM sync_outbox WHERE status = 'pending'`)
      .get() as { operation_id: string; customer_id: number; kind: string };
    expect(row.customer_id).toBe(1);
    expect(row.kind).toBe("invoice_list");
    // Requête push (sync.service) : ne doit plus lever.
    const push = db
      .prepare(
        `SELECT operation_id, customer_id, kind, payload_json, created_at FROM sync_outbox WHERE status = 'pending' ORDER BY id ASC LIMIT 200`,
      )
      .all() as { customer_id: number }[];
    expect(push).toHaveLength(1);
    expect(push[0]?.customer_id).toBe(1);
    db.close();
  });
});
