// Veloria PoS — E-28 (P1) : unicité du téléphone client (migration 0049).
// La comparaison se fait sur les CHIFFRES (miroir de `PHONE_DIGITS_EXPR`) :
// « 0550 12 34 56 » et « 0550123456 » sont le même numéro.
// Les clients ARCHIVÉS sont hors périmètre, les téléphones vides sont tolérés.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "phone-unique.sqlite"));
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

function insertCustomer(db: DatabaseSync, uuid: string, phone: string | null): void {
  db.prepare(
    `INSERT INTO customers (uuid, first_name, last_name, search_name, phone, created_at, updated_at) VALUES (?, 'Amine', 'Benali', 'amine benali', ?, '2026-01-01', '2026-01-01')`,
  ).run(uuid, phone);
}

function captureError(fn: () => void): string {
  try {
    fn();
    return "";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe("E-28 : le téléphone client est unique (migration 0049)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-phone-uniq-"));
    db = openMigrated(tmp);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("les 2 triggers de unicité sont installés", () => {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name IN ('trg_customers_phone_unique_ins','trg_customers_phone_unique_upd')`,
      )
      .get() as { c: number };
    expect(row.c).toBe(2);
  });

  it("refuse un doublon de téléphone (séparateurs ignorés) avec message FR", () => {
    insertCustomer(db, "p1", "0550 12 34 56");
    const error = captureError(() => insertCustomer(db, "p2", "0550123456"));
    expect(error).toMatch(/téléphone/i);
    const count = db.prepare(`SELECT COUNT(*) AS c FROM customers`).get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("tolère plusieurs clients sans téléphone", () => {
    insertCustomer(db, "p3", null);
    insertCustomer(db, "p4", null);
    insertCustomer(db, "p5", "   ");
    const count = db.prepare(`SELECT COUNT(*) AS c FROM customers`).get() as { c: number };
    expect(count.c).toBe(3);
  });

  it("un numéro porté par un client ARCHIVÉ ne bloque pas un nouveau client", () => {
    insertCustomer(db, "p6", "0550112233");
    db.prepare(`UPDATE customers SET deleted_at = '2026-02-01' WHERE uuid = 'p6'`).run();
    insertCustomer(db, "p7", "0550112233");
    const count = db.prepare(`SELECT COUNT(*) AS c FROM customers`).get() as { c: number };
    expect(count.c).toBe(2);
  });

  it("refuse la modification d'un téléphone vers un numéro déjà pris", () => {
    insertCustomer(db, "p8", "0550445566");
    insertCustomer(db, "p9", "0550778899");
    const error = captureError(() =>
      db.prepare(`UPDATE customers SET phone = '0550445566' WHERE uuid = 'p9'`).run(),
    );
    expect(error).toMatch(/téléphone/i);
    const row = db.prepare(`SELECT phone FROM customers WHERE uuid = 'p9'`).get() as {
      phone: string;
    };
    expect(row.phone).toBe("0550778899");
  });

  it("un client peut garder son propre téléphone (mise à jour sans conflit)", () => {
    insertCustomer(db, "p10", "0550123456");
    db.prepare(`UPDATE customers SET phone = '0550 12 34 56' WHERE uuid = 'p10'`).run();
    const row = db.prepare(`SELECT phone FROM customers WHERE uuid = 'p10'`).get() as {
      phone: string;
    };
    expect(row.phone).toBe("0550 12 34 56");
  });
});
