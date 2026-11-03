// Veloria PoS — ADR-173 : la file de synchronisation n'est plus gelée par une
// ligne condamnée. PostgREST applique un POST par lot en UNE seule instruction
// : sans division, un `customer_id` sans `client_access` côté miroir (FK 23503,
// HTTP 409) faisait échouer les 200 clichés du lot et le tick suivant
// recommençait — la poussée ne passait jamais, même avec des clés valides.
// Base migrée réelle + transport injecté : on prouve le TRI, pas le rendu.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

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

import { pushNowAtomic } from "../../electron/sync/sync.service";

const NOW = "2026-11-02T21:30:00.000Z";
const RELAY = "http://127.0.0.1:8100";
const SERVICE_KEY = "k".repeat(40);
/** Client 1 : clichés en file mais AUCUN accès côté miroir → FK 23503. */
const ORPHAN = 1;
/** Client 2 : accès actif, clichés recevables. */
const HEALTHY = 2;

/** `operationId` UUID déterministe, haché EN ENTIER (tronc = collisions). */
const OP = (seed: string): string => {
  const hex = createHash("sha256").update(`veloria-push-${seed}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

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

function addCustomer(id: number): void {
  const raw = repoDb.current;
  if (!raw) throw new Error("Base de test non ouverte.");
  raw
    .prepare(
      `INSERT INTO customers (id, uuid, first_name, last_name, search_name, phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      `Client`,
      `#${id}`,
      `client #${id}`,
      `055${id}00000`,
      NOW,
      NOW,
    );
}

function queueRow(customerId: number, kind: string, seed: string): void {
  const raw = repoDb.current;
  if (!raw) throw new Error("Base de test non ouverte.");
  raw
    .prepare(
      `INSERT INTO sync_outbox (operation_id, customer_id, kind, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
    )
    .run(OP(seed), customerId, kind, JSON.stringify({ demo: seed }), NOW);
}

function seed(): void {
  const raw = openMigrated();
  repoDb.current = raw;
  addCustomer(ORPHAN);
  addCustomer(HEALTHY);
  // Seul le client 2 a un accès : les 6 clichés du client 1 sont condamnés.
  raw
    .prepare(
      `INSERT INTO customer_access (customer_id, phone_hash, pin_hash, qr_secret_hash, revoked_at, failed_attempts, locked_until, created_at, updated_at, pin_algo)
       VALUES (?, ?, ?, NULL, NULL, 0, NULL, ?, ?, 'pbkdf2-sha256-100k')`,
    )
    .run(HEALTHY, "hash-phone-2", "hash-pin-2", NOW, NOW);
  // 6 orphelins D'ABORD (id croissants) puis 9 sains : l'ancien code s'arrêtait
  // sur la première requête et ne poussait jamais les sains.
  for (let i = 0; i < 2; i += 1) {
    for (const kind of ["customer_snapshot", "invoice_list", "payment_list"]) {
      queueRow(ORPHAN, kind, `orphelin-${kind}-${i}`);
    }
  }
  for (let i = 0; i < 3; i += 1) {
    for (const kind of ["customer_snapshot", "invoice_list", "payment_list"]) {
      queueRow(HEALTHY, kind, `sain-${kind}-${i}`);
    }
  }
  // Doc miroir en legacy CLAIR : `readDoc` l'accepte sans backend DPAPI.
  raw
    .prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    )
    .run(
      "client_sync",
      JSON.stringify({
        enabled: true,
        supabaseUrl: RELAY,
        serviceKey: SERVICE_KEY,
        anonKey: "",
        intervalMinutes: 15,
        lastPushAt: null,
        lastError: null,
      }),
      NOW,
    );
}

function statuses(): Record<string, number> {
  const raw = repoDb.current;
  if (!raw) throw new Error("Base de test non ouverte.");
  const rows = raw
    .prepare(`SELECT status, COUNT(*) AS n FROM sync_outbox GROUP BY status`)
    .all() as { status: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

function storedDoc(): Record<string, unknown> {
  const raw = repoDb.current;
  if (!raw) throw new Error("Base de test non ouverte.");
  const row = raw.prepare(`SELECT value_json FROM app_settings WHERE key = 'client_sync'`).get() as
    { value_json: string } | undefined;
  if (!row) throw new Error("Configuration sync absente.");
  return JSON.parse(row.value_json) as Record<string, unknown>;
}

interface Reply {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

function reply(
  status: number,
  body: string,
): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  });
}

const FK_DETAIL =
  '{"code":"23503","message":"insert or update on table \\"client_payloads\\" violates foreign key constraint","details":"Key (customer_id)=(1) is not present in table \\"client_access\\"."}';

/** Miroir fidèle : le lot entier échoue dès qu'une ligne vise un client sans accès. */
function mirrorWithOneBadCustomer(): (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Reply> {
  return (url, init) => {
    if (!url.includes("client_payloads")) return reply(201, "[]");
    const rows = JSON.parse(init.body) as { customer_id: number }[];
    if (rows.some((r) => r.customer_id === ORPHAN)) return reply(409, FK_DETAIL);
    return reply(201, "[]");
  };
}

describe("ADR-173 : la file survit aux lignes condamnées", () => {
  beforeEach(() => {
    seed();
  });

  it("écarte les 6 orphelins et pousse les 9 sains dans la même tentative", async () => {
    const result = await pushNowAtomic(
      { operationId: OP("push-1"), now: NOW },
      mirrorWithOneBadCustomer(),
    );
    expect(result).toEqual({ pushed: 9, access: 1, failed: 6 });
    expect(statuses()).toEqual({ sent: 9, failed: 6 });
  });

  it("garde la trace FR côté UI sans bloquer la prochaine poussée", async () => {
    await pushNowAtomic({ operationId: OP("push-2"), now: NOW }, mirrorWithOneBadCustomer());
    const doc = storedDoc();
    expect(doc["lastPushAt"]).toBe(NOW);
    // Formulation E-41 : le motif est désormais distingué (refus du miroir vs
    // cliché illisible en local), le garde reste « ce que le miroir a écarté ».
    expect(String(doc["lastError"])).toMatch(/par le miroir/);
    // La file est vidée des `pending` : le tick suivant ne rejoue plus rien.
    expect(statuses()["pending"] ?? 0).toBe(0);
  });

  it("rejoue à l'identique sur le même operationId (un seul tri)", async () => {
    const transport = mirrorWithOneBadCustomer();
    const first = await pushNowAtomic({ operationId: OP("push-3"), now: NOW }, transport);
    const replay = await pushNowAtomic({ operationId: OP("push-3"), now: NOW }, transport);
    expect(replay).toEqual(first);
  });

  it("un rejet temporaire (503) laisse TOUT rejouable, rien d'écarté", async () => {
    const always503 = (): Promise<Reply> => reply(503, '{"message":"Service Unavailable"}');
    await expect(pushNowAtomic({ operationId: OP("push-4"), now: NOW }, always503)).rejects.toThrow(
      /HTTP 503/,
    );
    expect(statuses()).toEqual({ pending: 15 });
    expect(storedDoc()["lastPushAt"]).toBe(null);
    expect(String(storedDoc()["lastError"])).toMatch(/HTTP 503/);
  });

  it("un 401 d'identité arrête la poussée sans condamner une seule ligne", async () => {
    const always401 = (): Promise<Reply> =>
      reply(401, '{"message":"Invalid API key","hint":"Double check your API key."}');
    await expect(pushNowAtomic({ operationId: OP("push-5"), now: NOW }, always401)).rejects.toThrow(
      /HTTP 401/,
    );
    expect(statuses()).toEqual({ pending: 15 });
  });

  it("divise le lot refusé au lieu d'abandonner (plus d'une requête émise)", async () => {
    let calls = 0;
    const counting = (
      url: string,
      init: { method: string; headers: Record<string, string>; body: string },
    ): Promise<Reply> => {
      calls += 1;
      return mirrorWithOneBadCustomer()(url, init);
    };
    await pushNowAtomic({ operationId: OP("push-6"), now: NOW }, counting);
    // 1 accès + 1 refus d'ensemble + la bissection des 15 clichés.
    expect(calls).toBeGreaterThan(3);
  });
});
