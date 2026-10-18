// Veloria — 0043 : garde pin_algo (liste blanche) + double-submit / rollback.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("0043 pin_algo guard", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-pin43-"));
    db = new DatabaseSync(path.join(tmp, "pin43.sqlite"));
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

  it("triggers présents (2/2)", () => {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='trigger' AND name IN ('trg_customer_access_pin_algo_ins','trg_customer_access_pin_algo_upd')",
      )
      .get() as { c: number };
    expect(row.c).toBe(2);
  });

  it("valeurs canoniques acceptées, md5 refusé en FR", () => {
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('p43a','A','A','a a','2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('p43b','B','B','b b','2026-01-01','2026-01-01')",
    ).run();
    const a = (db.prepare("SELECT id FROM customers WHERE uuid='p43a'").get() as { id: number }).id;
    const b = (db.prepare("SELECT id FROM customers WHERE uuid='p43b'").get() as { id: number }).id;
    db.prepare(
      "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, pin_algo, created_at, updated_at) VALUES (?, 'h1', 'p1', 'sha256', '2026-01-01', '2026-01-01')",
    ).run(a);
    db.prepare(
      "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, pin_salt, pin_algo, created_at, updated_at) VALUES (?, 'h2', 'p2', 'ab', 'pbkdf2-sha256-100k', '2026-01-01', '2026-01-01')",
    ).run(b);
    expect(() =>
      db.prepare("UPDATE customer_access SET pin_algo = 'md5' WHERE customer_id = ?").run(a),
    ).toThrow(/algorithme non pris en charge/);
    expect(
      (
        db.prepare("SELECT pin_algo AS v FROM customer_access WHERE customer_id = ?").get(a) as {
          v: string;
        }
      ).v,
    ).toBe("sha256");
  });

  it("double-submit même operationId = effet unique + rollback", () => {
    const op = "55555555-5555-4555-8555-555555555555";
    db.prepare(
      "INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, 'customers.accessActivate', '{}', '2026-01-01')",
    ).run(op);
    expect(() =>
      db
        .prepare(
          "INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, 'customers.accessActivate', '{}', '2026-01-01')",
        )
        .run(op),
    ).toThrow();
    const before = (db.prepare("SELECT COUNT(*) AS c FROM customer_access").get() as { c: number })
      .c;
    db.exec("BEGIN;");
    try {
      db.prepare(
        "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('p43r','R','R','r r','2026-01-01','2026-01-01')",
      ).run();
      const id = (db.prepare("SELECT id FROM customers WHERE uuid='p43r'").get() as { id: number })
        .id;
      db.prepare(
        "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, pin_algo, created_at, updated_at) VALUES (?, 'hr', 'pr', 'md5', '2026-01-01', '2026-01-01')",
      ).run(id);
      db.exec("COMMIT;");
    } catch {
      db.exec("ROLLBACK;");
    }
    expect((db.prepare("SELECT COUNT(*) AS c FROM customer_access").get() as { c: number }).c).toBe(
      before,
    );
  });
});
