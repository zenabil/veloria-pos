// Veloria — 0041 : tables rôles internes + gardes (dernier gérant conservé).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("0041 staff_roles", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-staff-"));
    db = new DatabaseSync(path.join(tmp, "staff.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("tables + index acteur présents", () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('staff_users','staff_user_permissions','staff_recovery')",
      )
      .all() as { name: string }[];
    expect(tables).toHaveLength(3);
    const cols = db
      .prepare("PRAGMA table_info(audit_log)")
      .all()
      .map((c) => (c as { name: string }).name);
    expect(cols).toContain("actor_user_id");
  });

  it("permission hors union refusée + doublon username refusé", () => {
    const now = "2026-10-13T10:00:00.000Z";
    db.prepare(
      "INSERT INTO staff_users (uuid, username, display_name, role, code_hash, code_salt, code_algo, created_at, updated_at) VALUES ('u1','karim','Karim','user','h','s','pbkdf2-sha256-100k','2026-01-01','2026-01-01')",
    ).run();
    const id = (
      db.prepare("SELECT id FROM staff_users WHERE username='karim'").get() as { id: number }
    ).id;
    expect(() =>
      db
        .prepare(
          "INSERT INTO staff_user_permissions (user_id, permission_key, granted_at) VALUES (?, 'root', ?)",
        )
        .run(id, now),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          "INSERT INTO staff_users (uuid, username, display_name, role, code_hash, code_salt, code_algo, created_at, updated_at) VALUES ('u2','KARIM','Autre','user','h','s','pbkdf2-sha256-100k','2026-01-01','2026-01-01')",
        )
        .run(),
    ).toThrow();
  });

  it("dernier gérant actif conservé (FR)", () => {
    db.prepare(
      "INSERT INTO staff_users (uuid, username, display_name, role, code_hash, code_salt, code_algo, created_at, updated_at) VALUES ('m1','admin','Gérant','manager','h','s','legacy-admin','2026-01-01','2026-01-01')",
    ).run();
    const id = (
      db.prepare("SELECT id FROM staff_users WHERE username='admin'").get() as { id: number }
    ).id;
    let msg = "";
    try {
      db.prepare("DELETE FROM staff_users WHERE id = ?").run(id);
    } catch (e) {
      msg = String((e as Error).message);
    }
    expect(msg).toMatch(/au moins un gérant actif/);
    // Rétrogradation du dernier gérant refusée aussi (rollback, ligne intacte).
    expect(() => db.prepare("UPDATE staff_users SET role = 'user' WHERE id = ?").run(id)).toThrow(
      /au moins un gérant actif/,
    );
    expect(
      (db.prepare("SELECT role FROM staff_users WHERE id = ?").get(id) as { role: string }).role,
    ).toBe("manager");
    // Deuxième gérant : la suppression du premier passe.
    db.prepare(
      "INSERT INTO staff_users (uuid, username, display_name, role, code_hash, code_salt, code_algo, created_at, updated_at) VALUES ('m2','sara','Sara','manager','h','s','pbkdf2-sha256-100k','2026-01-01','2026-01-01')",
    ).run();
    db.prepare("DELETE FROM staff_users WHERE id = ?").run(id);
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM staff_users").get() as { c: number },
    ).toMatchObject({ c: 1 });
  });

  it("idempotence : même operationId rejoué = conflit (le repo relit l'existant)", () => {
    const op = "33333333-3333-4333-8333-333333333333";
    db.prepare(
      "INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, 'staff.create', '{}', '2026-01-01')",
    ).run(op);
    expect(() =>
      db
        .prepare(
          "INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, 'staff.create', '{}', '2026-01-01')",
        )
        .run(op),
    ).toThrow();
  });

  it("rollback : échec au milieu = aucune ligne partielle", () => {
    const before = (db.prepare("SELECT COUNT(*) AS c FROM staff_users").get() as { c: number }).c;
    const op = "44444444-4444-4444-8444-444444444444";
    db.exec("BEGIN;");
    try {
      db.prepare(
        "INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, 'staff.create', '{}', '2026-01-01')",
      ).run(op);
      db.prepare(
        "INSERT INTO staff_users (uuid, username, display_name, role, code_hash, code_salt, code_algo, operation_id, created_at, updated_at) VALUES ('r1','rollback1','Rb','user','h','s','pbkdf2-sha256-100k',?, '2026-01-01','2026-01-01')",
      ).run(op);
      // Permission hors union : CHECK 0041 — toute la transaction est annulée.
      db.prepare(
        "INSERT INTO staff_user_permissions (user_id, permission_key, granted_at) VALUES (99999, 'root', '2026-01-01')",
      ).run();
      db.exec("COMMIT;");
    } catch {
      db.exec("ROLLBACK;");
    }
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM staff_users").get() as { c: number },
    ).toMatchObject({ c: before });
    // Le claim est annulé aussi : le retry peut réclamer le même operationId.
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM idempotency_keys WHERE operation_id = ?").get(op) as {
        c: number;
      },
    ).toMatchObject({ c: 0 });
  });
});
