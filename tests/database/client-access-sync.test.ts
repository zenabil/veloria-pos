import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { pbkdf2Sync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  activateClientAccessAtomic,
  sha256Hex,
} from "../../electron/ipc/handlers/client-access.repo";

// Repo RÉEL testé sur base temporaire : `getDb` est redirigé vers la base du
// test (node:sqlite). Le helper `transaction()` est re-créé ici (better-sqlite3
// n'existe pas dans ce contexte) avec la MÊME sémantique BEGIN/COMMIT/ROLLBACK
// que better-sqlite3 : un throw dans la transaction doit annuler tout ce
// qu'elle a écrit, dont la DELETE d'activation.
const repoDb = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const db = repoDb.current as {
      prepare: (sql: string) => {
        get: (...params: unknown[]) => unknown;
        all: (...params: unknown[]) => unknown;
        run: (...params: unknown[]) => unknown;
      };
      exec: (sql: string) => void;
    } | null;
    if (!db) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => db.prepare(sql),
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          db.exec("BEGIN");
          try {
            const out = fn();
            db.exec("COMMIT");
            return out;
          } catch (err) {
            db.exec("ROLLBACK");
            throw err;
          }
        },
    };
  },
}));

// Migration 0032 : accès clients APK + file de synchro + annonces (V1 lecture seule).
// Aucune table financière touchée ; on vérifie la création et les garde-fous.
describe("Migration 0032 client access + sync outbox", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-0032-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function openMigrated(): DatabaseSync {
    const db = new DatabaseSync(path.join(tmp, "c32.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
    return db as unknown as DatabaseSync;
  }

  it("creates the three tables with indexes", () => {
    const db = openMigrated();
    for (const t of ["customer_access", "sync_outbox", "announcements"]) {
      const found = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(t) as { name: string } | undefined;
      expect(found?.name).toBe(t);
    }
    for (const i of ["idx_customer_access_customer", "idx_sync_outbox_status_created"]) {
      const found = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
        .get(i) as { name: string } | undefined;
      expect(found?.name).toBe(i);
    }
    db.close();
  });

  it("enforces one access row per customer and restrict on delete (0038)", () => {
    const db = openMigrated();
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('ca32','Nadia','Bey','nadia bey','2026-01-01','2026-01-01')",
    ).run();
    const cid = Number(
      (db.prepare("SELECT id FROM customers WHERE uuid = 'ca32'").get() as { id: number }).id,
    );
    db.prepare(
      "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, created_at, updated_at) VALUES (?, 'ph', 'pinh', '2026-01-01', '2026-01-01')",
    ).run(cid);
    expect(() =>
      db
        .prepare(
          "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, created_at, updated_at) VALUES (?, 'ph2', 'pinh2', '2026-01-01', '2026-01-01')",
        )
        .run(cid),
    ).toThrow();
    expect(() => db.prepare("DELETE FROM customers WHERE id = ?").run(cid)).toThrow();
    const kept = db.prepare("SELECT id FROM customer_access WHERE customer_id = ?").get(cid) as
      | { id: number }
      | undefined;
    expect(kept).toBeDefined();
    db.prepare("DELETE FROM customer_access WHERE customer_id = ?").run(cid);
    db.prepare("DELETE FROM customers WHERE id = ?").run(cid);
    const gone2 = db.prepare("SELECT id FROM customers WHERE id = ?").get(cid) as
      | { id: number }
      | undefined;
    expect(gone2).toBeUndefined();
    db.close();
  });

  it("enforces outbox idempotence and announcement length", () => {
    const db = openMigrated();
    db.prepare(
      "INSERT INTO sync_outbox (operation_id, kind, payload_json, created_at) VALUES ('op-32-1', 'customer_snapshot', '{}', '2026-01-01')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO sync_outbox (operation_id, kind, payload_json, created_at) VALUES ('op-32-1', 'customer_snapshot', '{}', '2026-01-01')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          "INSERT INTO sync_outbox (operation_id, kind, payload_json, created_at) VALUES ('op-32-2', 'unknown_kind', '{}', '2026-01-01')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      db
        .prepare("INSERT INTO announcements (text, created_at) VALUES (?, '2026-01-01')")
        .run("x".repeat(121)),
    ).toThrow();
    db.prepare(
      "INSERT INTO announcements (text, created_at) VALUES ('Fermé vendredi', '2026-01-01')",
    ).run();
    const row = db.prepare("SELECT text FROM announcements").get() as { text: string };
    expect(row.text).toBe("Fermé vendredi");
    db.close();
  });

  it("leaves financial invariants intact", () => {
    const db = openMigrated();
    const ic = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    expect(ic.integrity_check).toBe("ok");
    db.close();
  });
});

// Repo RÉEL `activateClientAccessAtomic` (base temporaire via le mock ci-dessus).
// Racine de l'audit : `phone_hash` n'a AUCUN UNIQUE (POS 0032 + miroir cloud)
// et la fonction Edge cherche par condensat — le garde-fou vit donc dans la
// transaction d'activation, pas dans le schéma.
describe("activateClientAccessAtomic : numéro réutilisé refusé à la source", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-activation-repo-"));
    db = new DatabaseSync(path.join(tmp, "activation.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    for (const u of ["act1", "act2", "act3"]) {
      db.prepare(
        "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES (?,'A','B','a b','2026-01-01','2026-01-01')",
      ).run(u);
    }
    repoDb.current = db;
  });

  afterEach(() => {
    repoDb.current = null;
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const now = "2026-10-01T10:00:00.000Z";

  it("même client : remplacement + replay inchangé ; autre client : erreur FR, rien n'est écrasé", () => {
    const one = Number(
      (db.prepare("SELECT id FROM customers WHERE uuid = 'act1'").get() as { id: number }).id,
    );
    const two = Number(
      (db.prepare("SELECT id FROM customers WHERE uuid = 'act2'").get() as { id: number }).id,
    );
    // 1) Première activation du client 1.
    const first = activateClientAccessAtomic({
      operationId: "11111111-1111-4111-8111-111111111111",
      customerId: one,
      phone: "0550123456",
      pin: "482916",
      now,
    });
    expect(first.activated).toBe(true);
    // 2) Le MÊME client réactive avec son numéro → remplacement (comportement
    //    existant conservé : la DELETE de ses propres lignes passe).
    const again = activateClientAccessAtomic({
      operationId: "22222222-2222-4222-8222-222222222222",
      customerId: one,
      phone: "0550123456",
      pin: "654321",
      now,
    });
    expect(again.activated).toBe(true);
    // 3) Un AUTRE client avec le MÊME numéro → refus explicite, transaction
    //    annulée (la DELETE du client 1 est restaurée, son PIN reste le sien).
    expect(() =>
      activateClientAccessAtomic({
        operationId: "33333333-3333-4333-8333-333333333333",
        customerId: two,
        phone: "0550123456",
        pin: "111111",
        now,
      }),
    ).toThrow("Ce numéro de téléphone est déjà activé pour un autre client.");
    const rows = db
      .prepare(
        `SELECT customer_id, pin_hash, pin_salt, pin_algo FROM customer_access WHERE phone_hash = ?`,
      )
      .all(sha256Hex("0550123456")) as {
      customer_id: number;
      pin_hash: string;
      pin_salt: string;
      pin_algo: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.customer_id).toBe(one);
    // #39 : PIN durci — sel par client + PBKDF2 vérifiable, jamais SHA-256 nu.
    expect(rows[0]?.pin_algo).toBe("pbkdf2-sha256-100k");
    expect(typeof rows[0]?.pin_salt).toBe("string");
    expect(rows[0]?.pin_salt).toHaveLength(32);
    const derived = pbkdf2Sync(
      "654321",
      Buffer.from(rows[0]?.pin_salt ?? "", "hex"),
      100_000,
      32,
      "sha256",
    ).toString("hex");
    expect(rows[0]?.pin_hash).toBe(derived);
    // 4) Replay idempotent du 1er operationId → résultat stocké, aucun doublon.
    expect(
      activateClientAccessAtomic({
        operationId: "11111111-1111-4111-8111-111111111111",
        customerId: one,
        phone: "0550123456",
        pin: "482916",
        now,
      }),
    ).toEqual(first);
    // 5) Le client 2 s'active sans problème avec un AUTRE numéro.
    expect(
      activateClientAccessAtomic({
        operationId: "44444444-4444-4444-8444-444444444444",
        customerId: two,
        phone: "0551112233",
        pin: "222222",
        now,
      }).activated,
    ).toBe(true);
  });

  it("révoqué : le numéro reste tracé mais ne bloque plus (politique 0034)", () => {
    const one = Number(
      (db.prepare("SELECT id FROM customers WHERE uuid = 'act1'").get() as { id: number }).id,
    );
    const two = Number(
      (db.prepare("SELECT id FROM customers WHERE uuid = 'act2'").get() as { id: number }).id,
    );
    const three = Number(
      (db.prepare("SELECT id FROM customers WHERE uuid = 'act3'").get() as { id: number }).id,
    );
    activateClientAccessAtomic({
      operationId: "55555555-5555-4555-8555-555555555555",
      customerId: one,
      phone: "0550999999",
      pin: "482916",
      now,
    });
    // Révocation (miroir de revokeClientAccessAtomic) : la ligne reste, le
    // condensat aussi — 0034 : « une ligne révoquée ne bloque plus personne ».
    db.prepare(
      `UPDATE customer_access SET revoked_at = ?, updated_at = ? WHERE customer_id = ?`,
    ).run(now, now, one);
    // Un AUTRE client peut reprendre le numéro (SIM recyclée)…
    expect(
      activateClientAccessAtomic({
        operationId: "66666666-6666-4666-8666-666666666666",
        customerId: two,
        phone: "0550999999",
        pin: "111111",
        now,
      }).activated,
    ).toBe(true);
    const rows = db
      .prepare(`SELECT customer_id, revoked_at FROM customer_access WHERE phone_hash = ?`)
      .all(sha256Hex("0550999999")) as { customer_id: number; revoked_at: string | null }[];
    // …sans écraser l'historique : les 2 lignes coexistent, UNE seule active.
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revoked_at == null)).toHaveLength(1);
    expect(rows.find((r) => r.revoked_at == null)?.customer_id).toBe(two);
    // TROISIÈME client sur ce numéro = refus FR (la ligne ACTIVE compte).
    expect(() =>
      activateClientAccessAtomic({
        operationId: "77777777-7777-4777-8777-777777777777",
        customerId: three,
        phone: "0550999999",
        pin: "222222",
        now,
      }),
    ).toThrow("Ce numéro de téléphone est déjà activé pour un autre client.");
  });
});
