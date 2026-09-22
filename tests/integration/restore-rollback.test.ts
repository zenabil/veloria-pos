// Veloria PoS — P0-2 : la restauration annulée conserve l'ancienne base ouverte.
// Miroir node:sqlite du pattern restore (jamais de db=null silencieux) +
// contrat fail-loud de reopenWithRetry (échec = throw FR, jamais null muet).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("P0-2 : rollback de restauration (miroir)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-restore-"));
  });
  afterEach(() => {
    // Windows : verrou fichier transitoire (AV) — réessais courts.
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

  it("swap en échec → snapshot restauré → réouverture OK, données intactes", () => {
    const current = path.join(tmp, "Veloria POS DB.sqlite");
    const snapshot = path.join(tmp, "snap.vposdb");
    const live = new DatabaseSync(current);
    live.exec(
      "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t (v) VALUES ('vente-1');",
    );
    live.close();
    // Snapshot de sécurité (miroir de createBackup).
    fs.copyFileSync(current, snapshot);
    // Swap simulé en échec : le fichier courant est écrasé par du rebut.
    // (node:sqlite ouvre paresseusement : l'erreur sort à la 1re requête,
    // d'où exec + close explicite — sans quoi le handle fui bloque rm Windows.)
    fs.writeFileSync(current, Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11]));
    const broken = new DatabaseSync(current);
    try {
      expect(() => broken.exec("SELECT 1;")).toThrow();
    } finally {
      broken.close();
    }
    // Rollback : snapshot recopié, puis réouverture garantie.
    fs.copyFileSync(snapshot, current);
    const reopened = new DatabaseSync(current);
    try {
      const row = reopened.prepare("SELECT v FROM t WHERE id = 1").get() as { v: string };
      expect(row.v).toBe("vente-1");
      const check = reopened.prepare("PRAGMA integrity_check").get() as {
        integrity_check: string;
      };
      expect(check.integrity_check).toBe("ok");
    } finally {
      reopened.close();
    }
  });
});

describe("P0-2 : reopenWithRetry échoue FORT (jamais silencieux)", () => {
  it("échec persistant = throw (pas de null muet)", async () => {
    const mod = await import("../../electron/database/sqlite.service.ts");
    expect(typeof mod.reopenWithRetry).toBe("function");
    // Hors Electron : openDatabase ne peut pas aboutir → doit LEVER, pas
    // rendre la main sur un état fermé silencieux. 1 tentative = rapide.
    expect(() => mod.reopenWithRetry("test.p0-2", 1)).toThrow();
  });
});
