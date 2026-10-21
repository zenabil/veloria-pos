// Veloria PoS — Q1 : tranche « annonce magasin » (POS → APK).
//
// La chaîne était complète côté main (canal `announcements.save`, repo
// `saveAnnouncementAtomic`, domaine `assertValidAnnouncement`) mais la
// LECTURE manquait : le gérant ne pouvait pas voir l'annonce en cours, il
// pouvait seulement l'écraser. La tranche complète ajoute :
//   - `getCurrentAnnouncement` (lecture, permission `settings`) ;
//   - l'écran de saisie (Paramètres → Commerce).
//
// Ce test couvre le comportement métier : idempotence (rejeu du même
// `operationId`), refus FR hors bornes, et lecture de l'annonce courante.
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

import {
  getCurrentAnnouncement,
  saveAnnouncementAtomic,
} from "../../electron/ipc/handlers/client-access.repo";
import { assertValidAnnouncement } from "../../src/domain/customer/client-access.ts";

const NOW = "2026-10-21T09:00:00.000Z";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "announcement.sqlite"));
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

describe("Q1 : annonce magasin (écriture, lecture, idempotence)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-announce-"));
    db = openMigrated(tmp);
    (repoDb as { current: unknown; depth: number }).current = db;
    (repoDb as { current: unknown; depth: number }).depth = 0;
  });

  afterEach(() => {
    (repoDb as { current: unknown; depth: number }).current = null;
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("aucune annonce au départ", () => {
    expect(getCurrentAnnouncement().text).toBeNull();
  });

  it("l'annonce enregistrée est lisible (aller-retour complet)", () => {
    const res = saveAnnouncementAtomic({
      operationId: "11111111-1111-4111-8111-111111111111",
      text: "Livraison exceptionnelle ce samedi.",
      now: NOW,
    });
    expect(res.announcementId).toBeGreaterThan(0);
    expect(getCurrentAnnouncement().text).toBe("Livraison exceptionnelle ce samedi.");
  });

  it("rejouer le même operationId n'écrit qu'une fois", () => {
    const args = {
      operationId: "22222222-2222-4222-8222-222222222222",
      text: "Annonce unique.",
      now: NOW,
    };
    const first = saveAnnouncementAtomic(args);
    const second = saveAnnouncementAtomic(args);
    expect(second.announcementId).toBe(first.announcementId);
    const count = db.prepare("SELECT COUNT(*) AS n FROM announcements").get() as { n: number };
    expect(count.n).toBe(1);
  });

  it("la dernière annonce écrite est celle lue (remplace l'ancienne)", () => {
    saveAnnouncementAtomic({
      operationId: "33333333-3333-4333-8333-333333333333",
      text: "Première annonce.",
      now: NOW,
    });
    saveAnnouncementAtomic({
      operationId: "44444444-4444-4444-8444-444444444444",
      text: "Deuxième annonce.",
      now: NOW,
    });
    expect(getCurrentAnnouncement().text).toBe("Deuxième annonce.");
  });

  it("le domaine refuse une annonce vide ou trop longue (FR)", () => {
    expect(() => assertValidAnnouncement("")).toThrow(/Annonce invalide/);
    expect(() => assertValidAnnouncement("x".repeat(121))).toThrow(/Annonce invalide/);
    expect(() => assertValidAnnouncement("x".repeat(120))).not.toThrow();
    expect(() =>
      saveAnnouncementAtomic({
        operationId: "55555555-5555-4555-8555-555555555555",
        text: "   ",
        now: NOW,
      }),
    ).toThrow(/Annonce invalide/);
  });
});
