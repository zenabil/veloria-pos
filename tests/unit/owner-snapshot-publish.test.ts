// Veloria PoS — ADR-171 : PUBLIEUR de la liasse de supervision.
// Première exercise réelle du `Transport` injectable de la synchro : on prouve
// la requête (URL, en-têtes service_role, corps append-only), le refus,
// l'idempotence (un seul INSERT) et la mémoire d'état (`lastOwnerPushAt` /
// `lastOwnerError`) — sans aucun cloud.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const repoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const raw = repoDb.current;
    if (!raw) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => raw.prepare(sql),
      exec: (sql: string) => raw.exec(sql),
      transaction: (fn: () => unknown) => () => {
        raw.exec("BEGIN");
        try {
          const out = fn();
          raw.exec("COMMIT");
          return out;
        } catch (err) {
          raw.exec("ROLLBACK");
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

// Jamais de DPAPI en test : backend mémoire (réversible, préfixe `mem1`).
vi.mock("../../electron/sync/sync-secrets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../electron/sync/sync-secrets")>();
  return { ...actual, safeStorageSecretBackend: () => actual.memorySecretBackend() };
});

// La liasse elle-même est prouvée par `tests/integration/owner-snapshot.test.ts`
// (base réelle, chiffres calculés à la main). Ici : un corps fixe, pour que
// l'unique sujet du test soit LA PUBLICATION.
const FIXTURE_LIASSE = {
  version: 1,
  shopName: "Boulangerie Veloria",
  generatedAt: "2026-09-02T18:00:00.000Z",
  day: { salesMinor: 500 },
  stock: { valueMinor: 1800 },
  money: { debts: { totalMinor: 7000 } },
};
vi.mock("../../electron/sync/owner-snapshot", () => ({
  MAX_LIASSE_CHARS: 900_000,
  buildOwnerSnapshot: () => FIXTURE_LIASSE,
}));

import { publishOwnerSnapshotAtomic, saveSyncConfigAtomic } from "../../electron/sync/sync.service";

const NOW = "2026-09-02T18:00:00.000Z";
const SERVICE_KEY = "k".repeat(40);
const RELAY = "http://127.0.0.1:8100";

/** `operationId` UUID déterministe, haché EN ENTIER (tronc = collisions). */
const OP = (seed: string): string => {
  const hex = createHash("sha256").update(`veloria-owner-${seed}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function openMigrated(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  db.exec("PRAGMA foreign_keys=ON;");
  return db;
}

function saveOwnerConfig(overrides: Record<string, unknown>, seed: string): void {
  saveSyncConfigAtomic({
    config: {
      enabled: true,
      supabaseUrl: RELAY,
      serviceKey: SERVICE_KEY,
      anonKey: "",
      intervalMinutes: 15,
      ownerEnabled: true,
      ownerIntervalMinutes: 60,
      ...overrides,
    },
    operationId: OP(seed),
    now: NOW,
  });
}

function storedDoc(): Record<string, unknown> {
  const row = repoDb.current
    ?.prepare(`SELECT value_json FROM app_settings WHERE key = 'client_sync'`)
    .get() as { value_json: string } | undefined;
  if (!row) throw new Error("Configuration sync absente.");
  return JSON.parse(row.value_json) as Record<string, unknown>;
}

/**
 * Écrit le doc `client_sync` SANS passer par `saveSyncConfigAtomic` : permet
 * de tester les portes du publieur face à un doc hérité ou altéré (miroir
 * coupé après l'activation de la liasse), ce que le registre refuse à l'entrée.
 * Secrets en clair : `readDoc` accepte le legacy sans préfixe.
 */
function writeStoredDoc(doc: Record<string, unknown>): void {
  const raw = repoDb.current;
  if (!raw) throw new Error("Base de test non ouverte.");
  raw
    .prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    )
    .run("client_sync", JSON.stringify(doc), NOW);
}

/** Réponse réussite du transport factice (sans `async` : règle `require-await`). */
function okReply(): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
  return Promise.resolve({ ok: true, status: 201, text: () => Promise.resolve("[]") });
}

/** Réponse d'erreur du transport factice, corps serveur inclus. */
function errReply(
  status: number,
  body: string,
): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
  return Promise.resolve({ ok: false, status, text: () => Promise.resolve(body) });
}

describe("ADR-171 : publishOwnerSnapshotAtomic (transport injecté)", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openMigrated();
    repoDb.current = db;
  });

  it("POST append-only vers /rest/v1/owner_snapshots avec les secrets service", async () => {
    saveOwnerConfig({}, "cfg-ok");
    const sent: Sent[] = [];
    const result = await publishOwnerSnapshotAtomic(
      { operationId: OP("push-1"), now: NOW },
      (url, init) => {
        sent.push({ url, method: init.method, headers: init.headers, body: init.body });
        return okReply();
      },
    );
    expect(sent).toHaveLength(1);
    const req = sent[0];
    if (!req) throw new Error("Requête attendue.");
    expect(req.url).toBe(`${RELAY}/rest/v1/owner_snapshots`);
    expect(req.method).toBe("POST");
    expect(req.headers["apikey"]).toBe(SERVICE_KEY);
    expect(req.headers["Authorization"]).toBe(`Bearer ${SERVICE_KEY}`);
    // `shop_key` littéral de `cloud/supabase/owner.sql` + payload + instant.
    const rows = JSON.parse(req.body) as {
      shop_key: string;
      payload: typeof FIXTURE_LIASSE;
      generated_at: string;
    }[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.shop_key).toBe("veloria");
    expect(rows[0]?.payload).toEqual(FIXTURE_LIASSE);
    expect(rows[0]?.generated_at).toBe(NOW);
    expect(result.published).toBe(true);
    expect(result.chars).toBe(req.body.length);
    expect(result.lastOwnerPushAt).toBe(NOW);
    // État persisté : la dernière publication est visible, plus d'erreur.
    expect(storedDoc()["lastOwnerPushAt"]).toBe(NOW);
    expect(storedDoc()["lastOwnerError"]).toBeNull();
  });

  it("rejouer le même operationId n'insère PAS une seconde liasse", async () => {
    saveOwnerConfig({}, "cfg-idem");
    let calls = 0;
    const transport = (): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> => {
      calls += 1;
      return okReply();
    };
    const first = await publishOwnerSnapshotAtomic(
      { operationId: OP("push-2"), now: NOW },
      transport,
    );
    const replay = await publishOwnerSnapshotAtomic(
      { operationId: OP("push-2"), now: NOW },
      transport,
    );
    expect(calls).toBe(1);
    expect(replay).toEqual(first);
    const raw = repoDb.current;
    if (!raw) throw new Error("Base de test non ouverte.");
    const keys = raw
      .prepare(
        `SELECT COUNT(*) AS c FROM idempotency_keys WHERE op_type = 'sync.pushOwnerSnapshot'`,
      )
      .get() as { c: number };
    expect(Number(keys.c)).toBe(1);
  });

  it("liasse désactivée : refus FR, aucune requête", async () => {
    saveOwnerConfig({ ownerEnabled: false }, "cfg-off");
    let calls = 0;
    await expect(
      publishOwnerSnapshotAtomic({ operationId: OP("push-off"), now: NOW }, () => {
        calls += 1;
        return okReply();
      }),
    ).rejects.toThrow(/Liasse de supervision désactivée/);
    expect(calls).toBe(0);
  });

  it("miroir coupé ou sans identifiants : refus FR, aucune requête", async () => {
    // Le doc est écrit DIRECTEMENT (hors `saveSyncConfigAtomic`) : la porte du
    // registre refuse déjà « liasse activée sans miroir ». Ce cas simule le
    // doc hérité/altéré (miroir désactivé APRÈS l'activation de la liasse) et
    // prouve que la porte du publieur tient seule, sans requête réseau.
    writeStoredDoc({
      enabled: false,
      supabaseUrl: "",
      serviceKey: "",
      anonKey: "",
      intervalMinutes: 15,
      ownerEnabled: true,
      ownerIntervalMinutes: 60,
      lastPushAt: null,
      lastError: null,
      lastOwnerPushAt: null,
      lastOwnerError: null,
    });
    let calls = 0;
    await expect(
      publishOwnerSnapshotAtomic({ operationId: OP("push-nomirror"), now: NOW }, () => {
        calls += 1;
        return okReply();
      }),
    ).rejects.toThrow(/Miroir non configuré/);
    expect(calls).toBe(0);
    // Miroir activé mais clé vidée : même refus (jamais de POST sans secret).
    writeStoredDoc({
      enabled: true,
      supabaseUrl: RELAY,
      serviceKey: "",
      anonKey: "",
      intervalMinutes: 15,
      ownerEnabled: true,
      ownerIntervalMinutes: 60,
      lastPushAt: null,
      lastError: null,
      lastOwnerPushAt: "2026-09-01T10:00:00.000Z",
      lastOwnerError: null,
    });
    await expect(
      publishOwnerSnapshotAtomic({ operationId: OP("push-nokey"), now: NOW }, () => {
        calls += 1;
        return okReply();
      }),
    ).rejects.toThrow(/Miroir non configuré/);
    expect(calls).toBe(0);
    // Un refus ne touche PAS l'état de la dernière publication réussie.
    expect(storedDoc()["lastOwnerPushAt"]).toBe("2026-09-01T10:00:00.000Z");
  });

  it("HTTP 500 : message FR enregistré dans lastOwnerError, pas de fausse réussite", async () => {
    saveOwnerConfig({}, "cfg-500");
    await expect(
      publishOwnerSnapshotAtomic({ operationId: OP("push-500"), now: NOW }, () =>
        errReply(500, '{"error":"relation inconnue"}'),
      ),
    ).rejects.toThrow(/Publication de la liasse impossible \(HTTP 500\)/);
    const doc = storedDoc();
    expect(doc["lastOwnerError"]).toBe("Publication de la liasse impossible (HTTP 500).");
    expect(doc["lastOwnerPushAt"]).toBeNull();
    // Le détail serveur (anglais/JSON) ne remonte JAMAIS dans la valeur stockée.
    expect(String(doc["lastOwnerError"])).not.toContain("relation");
  });

  it("cadence hors bornes = défaut documenté (60), jamais une valeur fantôme", () => {
    saveOwnerConfig({ ownerIntervalMinutes: 1 }, "cfg-cadence");
    expect(storedDoc()["ownerIntervalMinutes"]).toBe(60);
    expect(storedDoc()["ownerEnabled"]).toBe(true);
  });

  it("liasse activée sans miroir = refus FR à l'enregistrement", () => {
    expect(() =>
      saveSyncConfigAtomic({
        config: {
          enabled: false,
          supabaseUrl: "",
          serviceKey: "",
          anonKey: "",
          intervalMinutes: 15,
          ownerEnabled: true,
          ownerIntervalMinutes: 60,
        },
        operationId: OP("cfg-orphan"),
        now: NOW,
      }),
    ).toThrow(/Liasse propriétaire/);
  });
});
