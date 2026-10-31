// Veloria PoS — ADR-166 : annonces magasin multi-médias (texte OU image),
// expiration et plafond de 4 actives. Couvre le repo RÉEL (idempotence,
// transactions) + le cliché miroir consommé par l'APK.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null, depth: 0 }));

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
  buildSnapshotPayload,
  listAnnouncements,
  removeAnnouncementAtomic,
  saveAnnouncementAtomic,
} from "../../electron/ipc/handlers/client-access.repo";
import {
  assertValidAnnouncement,
  assertValidAnnouncementInput,
} from "../../src/domain/customer/client-access.ts";

const NOW = "2026-10-21T09:00:00.000Z";
const FUTURE = "2026-12-31T23:59:00.000Z";
const PAST = "2026-10-20T09:00:00.000Z";
const LIMIT = /4 annonces actives maximum/;

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

function op(n: number): string {
  return `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
}

function save(
  n: number,
  text: string | null,
  extra: Partial<{
    imageUrl: string | null;
    endsAt: string;
    sort: number;
    isActive: boolean;
    id: number | null;
  }> = {},
): { announcementId: number } {
  return saveAnnouncementAtomic({
    operationId: op(n),
    id: extra.id ?? null,
    text,
    imageUrl: extra.imageUrl ?? null,
    endsAt: extra.endsAt ?? FUTURE,
    sort: extra.sort ?? 0,
    isActive: extra.isActive ?? true,
    now: NOW,
  });
}

describe("ADR-166 : annonces (texte/image, échéance, plafond, snapshot)", () => {
  let tmp: string;
  let db: DatabaseSync;
  let customerId: number;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-announce-"));
    db = openMigrated(tmp);
    repoDb.current = db;
    repoDb.depth = 0;
    const r = db
      .prepare(
        "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('c1','Amine','Benali','amine benali','2026-01-01','2026-01-01')",
      )
      .run();
    customerId = Number(r.lastInsertRowid);
  });

  afterEach(() => {
    repoDb.current = null;
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("aucune annonce au départ", () => {
    expect(listAnnouncements()).toEqual([]);
  });

  it("aller-retour texte + échéance, rejouer le même operationId n'écrit qu'une fois", () => {
    const first = save(1, "Livraison exceptionnelle ce samedi.");
    const second = save(1, "Livraison exceptionnelle ce samedi.");
    expect(second.announcementId).toBe(first.announcementId);
    const rows = listAnnouncements();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first.announcementId,
      text: "Livraison exceptionnelle ce samedi.",
      imageUrl: null,
      isActive: true,
      endsAt: FUTURE,
      sort: 0,
    });
  });

  it("image seule acceptée, texte seul accepté, rien du tout refusé", () => {
    const image = save(2, null, { imageUrl: "https://cdn.example.com/promo.jpg" });
    expect(image.announcementId).toBeGreaterThan(0);
    expect(() => save(3, "   ")).toThrow(/texte ou image requis/);
    expect(() => save(3, null)).toThrow(/texte ou image requis/);
    expect(() => save(3, "Promo", { imageUrl: "http://cdn.example.com/x.jpg" })).toThrow(
      /Lien d'image invalide/,
    );
  });

  it("refuse un texte > 120 caractères et une échéance passée (FR)", () => {
    expect(() => save(4, "x".repeat(121))).toThrow(/1 à 120/);
    expect(() => save(4, "Promo", { endsAt: PAST })).toThrow(/futur/);
  });

  it("met à jour une annonce existante (id fourni) et rafraîchit le compte à rebours", () => {
    const created = save(5, "Ancien texte");
    const updated = save(6, "Nouveau texte", { id: created.announcementId, endsAt: FUTURE });
    expect(updated.announcementId).toBe(created.announcementId);
    expect(listAnnouncements()[0]?.text).toBe("Nouveau texte");
    expect(() => save(7, "Fantôme", { id: 999_999 })).toThrow(/Annonce introuvable/);
  });

  it("plafonne à 4 annonces actives non expirées", () => {
    for (let i = 0; i < 4; i += 1) save(10 + i, `Annonce ${i}`);
    expect(() => save(20, "La cinquième")).toThrow(LIMIT);
    // Une annonce expirée ne compte plus : la place est libérée.
    const expiredId = listAnnouncements()[0]?.id ?? 0;
    expect(expiredId).toBeGreaterThan(0);
    db.prepare("UPDATE announcements SET ends_at = ? WHERE id = ?").run(PAST, expiredId);
    expect(() => save(20, "La cinquième")).not.toThrow();
    // Désactiver libère aussi une place.
    save(21, "Sixième", { isActive: false });
    expect(listAnnouncements().length).toBe(6);
  });

  it("suppression idempotente (rejeu = succès, jamais d'erreur)", () => {
    const created = save(30, "À supprimer");
    const first = removeAnnouncementAtomic({
      id: created.announcementId,
      operationId: op(31),
      now: NOW,
    });
    expect(first.removed).toBe(true);
    expect(listAnnouncements()).toHaveLength(0);
    const replay = removeAnnouncementAtomic({
      id: created.announcementId,
      operationId: op(31),
      now: NOW,
    });
    expect(replay.removed).toBe(true);
    // Supprimer un id déjà absent reste un no-op idempotent.
    expect(removeAnnouncementAtomic({ id: 424_242, operationId: op(32), now: NOW }).removed).toBe(
      true,
    );
  });

  it("le cliché ne contient que les actives non expirées, ordonnées, bornées à 4", () => {
    save(40, "Deuxième", { sort: 2 });
    save(41, "Première", { sort: 1 });
    save(42, "Expirée", { sort: 0 });
    db.prepare("UPDATE announcements SET ends_at = ? WHERE text = 'Expirée'").run(PAST);
    save(43, "Inactive", { sort: 0, isActive: false });
    save(44, null, { sort: 3, imageUrl: "https://cdn.example.com/p.jpg" });

    const payload = JSON.parse(
      buildSnapshotPayload(customerId, "customer_snapshot", null, "2026-10", NOW),
    ) as {
      announcement: string | null;
      announcements: { id: number; text: string | null; imageUrl: string | null }[];
    };

    expect(payload.announcements.map((a) => a.text)).toEqual(["Première", "Deuxième", null]);
    expect(payload.announcements[2]?.imageUrl).toBe("https://cdn.example.com/p.jpg");
    // Compatibilité APK historique : premier texte servi dans l'ancien champ.
    expect(payload.announcement).toBe("Première");
  });

  it("domaine : validation complète (image https, échéance future)", () => {
    expect(() => assertValidAnnouncement("")).toThrow(/Annonce invalide/);
    expect(() => assertValidAnnouncement("x".repeat(121))).toThrow(/Annonce invalide/);
    expect(() => assertValidAnnouncement("x".repeat(120))).not.toThrow();
    expect(() =>
      assertValidAnnouncementInput({
        text: null,
        imageUrl: null,
        endsAt: FUTURE,
        nowISO: NOW,
      }),
    ).toThrow(/texte ou image requis/);
    expect(() =>
      assertValidAnnouncementInput({
        text: "Promo",
        imageUrl: "https://cdn.example.com/ok.jpg",
        endsAt: PAST,
        nowISO: NOW,
      }),
    ).toThrow(/futur/);
    expect(() =>
      assertValidAnnouncementInput({
        text: "Promo",
        imageUrl: null,
        endsAt: FUTURE,
        nowISO: NOW,
      }),
    ).not.toThrow();
  });
});
