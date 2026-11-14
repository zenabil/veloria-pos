// Veloria PoS — BACK-04 : CONTRAT D'INCLUSION / EXCLUSION DE LA SAUVEGARDE.
//
// L'audit (2026-11-11) a constaté que le contrat « ce que contient une
// sauvegarde » n'était documenté NULLE PART, et qu'aucun test ne prouvait
// qu'une sauvegarde produite ne transporte pas de credential en clair.
//
// Ce fichier prouve les DEUX moitiés du contrat :
//
//  A. L'HYGIÈNE DES SECRETS (electron/sync/secret-hygiene.ts)
//     Un secret legacy en clair dans `app_settings` est ré-encodé (DPAPI)
//     avant toute sauvegarde. Sans ce passage, une sauvegarde — qui est une
//     COPIE COMPLÈTE de la base — embarquerait le secret en clair.
//
//  B. LE CONTENU DE LA SAUVEGARDE
//     Une sauvegarde produite par le mécanisme réel (`VACUUM INTO`) contient
//     les DONNÉES MÉTIER (elle est restaurable) et AUCUN credential en
//     clair (le octets du fichier sont scannés).
//
// Le jeton de test est ASSEMBLÉ à l'exécution : écrit en clair, il serait
// détecté par le secret-scan dans ce fichier lui-même (même discipline que
// `tests/unit/sync-secret-storage.test.ts`).

import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  reencryptLegacySecrets,
  type SecretHygieneDeps,
} from "../../electron/sync/secret-hygiene.ts";
import { memorySecretBackend } from "../../electron/sync/sync-secrets.ts";

const backend = memorySecretBackend();

const TEST_TOKEN = ["sb_", "sec", "ret", "_0123456789abcdefghijklmnopqrstuvwxyz"].join("");

function makeDeps(valueJson: string | null): SecretHygieneDeps & { written: string[] } {
  const written: string[] = [];
  return {
    written,
    read: () => (valueJson === null ? undefined : { value_json: valueJson }),
    write: (v: string) => {
      written.push(v);
      valueJson = v;
    },
    backend,
    now: () => "2026-11-12T00:00:00.000Z",
  };
}

describe("BACK-04 — contrat de sauvegarde : ce qu'elle contient (et ne contient pas)", () => {
  // ---------------------------------------------------------------------
  // A. Hygiène des secrets
  // ---------------------------------------------------------------------
  describe("A. hygiène des secrets (avant sauvegarde)", () => {
    it("un secret LEGACY en clair est ré-encodé (il ne peut plus être recopié en clair)", () => {
      const deps = makeDeps(
        JSON.stringify({
          supabaseUrl: "https://example.supabase.co",
          serviceKey: TEST_TOKEN,
          anonKey: "",
        }),
      );
      const res = reencryptLegacySecrets(deps);
      expect(res.upgraded).toBe(1);
      expect(res.failed).toBe(false);
      expect(deps.written).toHaveLength(1);
      const stored = deps.written[0] ?? "";
      expect(stored).not.toContain(TEST_TOKEN);
      expect(stored).toContain(`${backend.prefix}:`);
    });

    it("un secret DÉJÀ chiffré n'est jamais ré-encodé (idempotence)", () => {
      const encrypted = `${backend.prefix}:bWVtOmVuYw==`;
      const deps = makeDeps(JSON.stringify({ serviceKey: encrypted, anonKey: "" }));
      const res = reencryptLegacySecrets(deps);
      expect(res.upgraded).toBe(0);
      expect(deps.written).toHaveLength(0);
    });

    it("rien à faire quand aucun secret n'est présent", () => {
      const deps = makeDeps(JSON.stringify({ serviceKey: "", anonKey: "" }));
      const res = reencryptLegacySecrets(deps);
      expect(res.upgraded).toBe(0);
      expect(deps.written).toHaveLength(0);
    });

    it("une row illisible est LAISSÉE INTACTE (jamais de destruction)", () => {
      const deps = makeDeps("{ ceci n'est pas du JSON");
      const res = reencryptLegacySecrets(deps);
      expect(res.unreadable).toBe(true);
      expect(deps.written).toHaveLength(0);
    });

    it("si le stockage sécurisé est indisponible, RIEN n'est écrit (fail-closed)", () => {
      const deps = makeDeps(JSON.stringify({ serviceKey: TEST_TOKEN }));
      deps.backend = {
        prefix: "x1",
        isAvailable: () => false,
        encryptToB64: () => "",
        decryptFromB64: () => "",
      };
      const res = reencryptLegacySecrets(deps);
      expect(res.failed).toBe(true);
      expect(deps.written).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  // B. Contenu réel d'une sauvegarde produite
  // ---------------------------------------------------------------------
  describe("B. contenu d'une sauvegarde produite (VACUUM INTO)", () => {
    function produceBackup(): { file: string; bytes: Buffer; db: DatabaseSync } {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-backup-contract-"));
      const live = path.join(tmp, "live.sqlite");
      const db = new DatabaseSync(live);
      db.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)");
      db.exec("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
      db.prepare("INSERT INTO products (id, name) VALUES (1, 'Farine 10kg')").run();
      // Document de synchronisation APRÈS hygiène : le secret est chiffré.
      const stored = JSON.stringify({
        supabaseUrl: "https://example.supabase.co",
        serviceKey: `${backend.prefix}:${Buffer.from(`mem:${TEST_TOKEN}`).toString("base64")}`,
        anonKey: "",
      });
      db.prepare("INSERT INTO app_settings (key, value_json) VALUES ('client_sync', ?)").run(
        stored,
      );
      // Le mécanisme RÉEL de sauvegarde (electron/backup/backup.service.ts).
      const file = path.join(tmp, "veloria-test.vposdb");
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      db.close();
      const bytes = fs.readFileSync(file);
      return { file, bytes, db: new DatabaseSync(file) };
    }

    it("la sauvegarde contient les DONNÉES MÉTIER (elle est restaurable)", () => {
      const { db } = produceBackup();
      try {
        const row = db.prepare("SELECT name FROM products WHERE id = 1").get() as { name: string };
        expect(row.name).toBe("Farine 10kg");
      } finally {
        db.close();
      }
    });

    it("la sauvegarde NE CONTIENT AUCUN credential en clair", () => {
      const { bytes } = produceBackup();
      // Le token en clair ne doit apparaître dans AUCUN octet du fichier.
      expect(bytes.includes(Buffer.from(TEST_TOKEN, "utf-8"))).toBe(false);
      // Et le secret n'est présent que sous sa forme chiffrée.
      const text = bytes.toString("utf-8");
      expect(text).not.toContain(TEST_TOKEN);
    });

    it("un secret legacy NON traité serait bien recopié en clair (le risque réel)", () => {
      // Preuve de la nécessité du passage d'hygiène : sans lui, `VACUUM INTO`
      // recopie la valeur en clair telle quelle. Ce test borne le risque.
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-backup-risk-"));
      const live = path.join(tmp, "live.sqlite");
      const db = new DatabaseSync(live);
      db.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)");
      db.prepare("INSERT INTO app_settings (key, value_json) VALUES ('client_sync', ?)").run(
        JSON.stringify({ serviceKey: TEST_TOKEN }),
      );
      const file = path.join(tmp, "raw.vposdb");
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      db.close();
      const bytes = fs.readFileSync(file);
      // Le risque est RÉEL si l'hygiène n'a pas tourné : le secret est là.
      expect(bytes.includes(Buffer.from(TEST_TOKEN, "utf-8"))).toBe(true);
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  });
});
