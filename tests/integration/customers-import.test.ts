// Veloria PoS — Tests d'intégration : import CSV clients (lot atomique).
//
// ADR-130 (2026-10-21) : l'import clients est un NOUVEAU chemin d'écriture
// (canal `customers.import`). Ces tests appellent la fonction de PRODUCTION
// (`importCustomersAtomic`) sur une base migrée et vérifient :
// - tout-ou-rien (une ligne invalide ⇒ RIEN n'est écrit) ;
// - unicité du téléphone (E-28) refusée AVANT l'écriture (message FR) ;
// - idempotence de lot (le même fichier rejoué ne duplique pas) ;
// - le client importé est trouvable par la recherche (`search_norm`).
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

import { importCustomersAtomic } from "../../electron/ipc/handlers/import.repo";
import { searchCustomers } from "../../electron/ipc/handlers/customers.repo";

const NOW = "2026-10-21T10:00:00.000Z";
const OP = "11111111-2222-4333-8444-555555555555";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "import-clients.sqlite"));
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

function useDb(db: DatabaseSync): void {
  (repoDb as { current: unknown; depth: number }).current = db;
  (repoDb as { current: unknown; depth: number }).depth = 0;
}

function countCustomers(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM customers").get() as { c: number };
  return Number(row.c);
}

describe("Import CSV clients (lot atomique)", () => {
  let tmp: string;
  let trackedDb: DatabaseSync | null = null;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-import-clients-"));
  });
  afterEach(() => {
    // Fermer la base AVANT le nettoyage : sinon Windows verrouille le
    // fichier (EBUSY) et le dossier temporaire reste.
    trackedDb?.close();
    trackedDb = null;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("importe les fiches (nom, prénom, téléphone) et les rend trouvables", () => {
    const db = openMigrated(tmp);
    trackedDb = db;
    useDb(db);
    const res = importCustomersAtomic(
      [
        { firstName: "Amine", lastName: "Benali", phone: "0550123456" },
        { firstName: "Karim", lastName: "Ziani", phone: "0661987654" },
      ],
      NOW,
      OP,
    );
    expect(res.imported).toBe(2);
    expect(countCustomers(db)).toBe(2);

    // `search_norm` rempli (migration 0047) ⇒ la recherche les trouve.
    const found = searchCustomers("benali", 1, 20, false, "all", false, "name_asc");
    expect(found.total).toBe(1);
    const row = db
      .prepare("SELECT first_name, last_name, phone, search_norm, debt_status FROM customers")
      .get() as {
      first_name: string;
      last_name: string;
      phone: string;
      search_norm: string;
      debt_status: string;
    };
    expect(row.first_name).toBe("Amine");
    expect(row.last_name).toBe("Benali");
    expect(row.phone).toBe("0550123456");
    expect(row.search_norm).toBe("amine benali");
    // Une fiche importée ne porte AUCUNE dette (l'import ne crée pas de crédit).
    expect(row.debt_status).toBe("none");

    // Trace d'audit (l'import est une mutation métier).
    const audit = db.prepare("SELECT event_type FROM audit_log WHERE operation_id = ?").get(OP) as
      | { event_type: string }
      | undefined;
    expect(audit?.event_type).toBe("customers.imported");
  });

  it("tout-ou-rien : une ligne invalide ⇒ AUCUNE fiche écrite", () => {
    const db = openMigrated(tmp);
    trackedDb = db;
    useDb(db);
    expect(() =>
      importCustomersAtomic(
        [
          { firstName: "Amine", lastName: "Benali", phone: "0550123456" },
          { firstName: "  ", lastName: "Ziani", phone: "0661987654" },
        ],
        NOW,
        OP,
      ),
    ).toThrow(/prénom et nom requis/);
    expect(countCustomers(db)).toBe(0);
  });

  it("refuse un téléphone en double dans le MÊME fichier (rien n'est écrit)", () => {
    const db = openMigrated(tmp);
    trackedDb = db;
    useDb(db);
    expect(() =>
      importCustomersAtomic(
        [
          { firstName: "Amine", lastName: "Benali", phone: "0550123456" },
          { firstName: "Karim", lastName: "Ziani", phone: "0550 123 456" },
        ],
        NOW,
        OP,
      ),
    ).toThrow(/téléphone en double/);
    expect(countCustomers(db)).toBe(0);
  });

  it("refuse un téléphone déjà utilisé en base (E-28, message FR)", () => {
    const db = openMigrated(tmp);
    trackedDb = db;
    useDb(db);
    importCustomersAtomic(
      [{ firstName: "Amine", lastName: "Benali", phone: "0550123456" }],
      NOW,
      "22222222-2222-4333-8444-555555555555",
    );
    expect(() =>
      importCustomersAtomic(
        [{ firstName: "Karim", lastName: "Ziani", phone: "0550 12 34 56" }],
        NOW,
        OP,
      ),
    ).toThrow(/déjà utilisé/);
    // La fiche existante est intacte, la nouvelle n'existe pas.
    expect(countCustomers(db)).toBe(1);
  });

  it("refuse un téléphone qui n'est pas un numéro (EMP-1, rien n'est écrit)", () => {
    const db = openMigrated(tmp);
    trackedDb = db;
    useDb(db);
    expect(() =>
      importCustomersAtomic(
        [{ firstName: "Amine", lastName: "Benali", phone: "pas-un-numero" }],
        NOW,
        OP,
      ),
    ).toThrow(/téléphone invalide/);
    expect(countCustomers(db)).toBe(0);
  });

  it("idempotent de lot : le même operationId rejoué ne duplique rien", () => {
    const db = openMigrated(tmp);
    trackedDb = db;
    useDb(db);
    const rows = [{ firstName: "Amine", lastName: "Benali", phone: "0550123456" }];
    const first = importCustomersAtomic(rows, NOW, OP);
    const replay = importCustomersAtomic(rows, NOW, OP);
    expect(first.imported).toBe(1);
    expect(replay.imported).toBe(1);
    expect(countCustomers(db)).toBe(1);
  });

  it("refuse un fichier vide et un lot hors bornes", () => {
    const db = openMigrated(tmp);
    trackedDb = db;
    useDb(db);
    expect(() => importCustomersAtomic([], NOW, OP)).toThrow(/Fichier vide/);
    const tooMany = Array.from({ length: 5001 }, (_, i) => ({
      firstName: `C${i}`,
      lastName: "Test",
      phone: "",
    }));
    expect(() => importCustomersAtomic(tooMany, NOW, OP)).toThrow(/5 000/);
    expect(countCustomers(db)).toBe(0);
  });
});
