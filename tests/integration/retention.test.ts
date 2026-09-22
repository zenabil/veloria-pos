// Veloria PoS — Tests P3-d : rétention tables techniques (miroir).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("P3-d : retention (miroir)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-ret-"));
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

  it("purge > 90 j idempotence et > 365 j audit, garde le récent", () => {
    const db = new DatabaseSync(path.join(tmp, "r.sqlite"));
    try {
      db.exec(`CREATE TABLE idempotency_keys (operation_id TEXT PRIMARY KEY, op_type TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE audit_log (id INTEGER PRIMARY KEY, event_id TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);`);
      const oldIdem = new Date(Date.now() - 100 * 86_400_000).toISOString();
      const newIdem = new Date().toISOString();
      const oldAudit = new Date(Date.now() - 400 * 86_400_000).toISOString();
      db.prepare("INSERT INTO idempotency_keys VALUES (?, 't', '{}', ?)").run("old", oldIdem);
      db.prepare("INSERT INTO idempotency_keys VALUES (?, 't', '{}', ?)").run("new", newIdem);
      db.prepare("INSERT INTO audit_log (event_id, created_at) VALUES (?, ?)").run(
        "a-old",
        oldAudit,
      );
      db.prepare("INSERT INTO audit_log (event_id, created_at) VALUES (?, ?)").run(
        "a-new",
        newIdem,
      );
      const idemCutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const auditCutoff = new Date(Date.now() - 365 * 86_400_000).toISOString();
      const r1 = db.prepare("DELETE FROM idempotency_keys WHERE created_at < ?").run(idemCutoff);
      const r2 = db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(auditCutoff);
      expect(Number(r1.changes)).toBe(1);
      expect(Number(r2.changes)).toBe(1);
      const left = db.prepare("SELECT operation_id AS o FROM idempotency_keys").all() as {
        o: string;
      }[];
      expect(left.map((x) => x.o)).toEqual(["new"]);
    } finally {
      db.close();
    }
  });
});
