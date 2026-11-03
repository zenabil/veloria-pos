// Veloria PoS — E-41/E-42/E-43 sur la VRAIE file (base migrée + transport
// injecté) : une ligne localement corrompue ne gèle plus la poussée, une table
// absente ne condamne plus 200 clichés, et un échec horodate la tentative.
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

vi.mock("../../electron/sync/sync-secrets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../electron/sync/sync-secrets")>();
  return { ...actual, safeStorageSecretBackend: () => actual.memorySecretBackend() };
});

import { pushNowAtomic } from "../../electron/sync/sync.service";

const NOW = "2026-11-03T08:00:00.000Z";
const RELAY = "http://127.0.0.1:8100";
const SERVICE_KEY = "k".repeat(40);

const OP = (seed: string): string => {
  const hex = createHash("sha256").update(`veloria-resilience-${seed}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

function raw(): DatabaseSync {
  const current = repoDb.current;
  if (!current) throw new Error("Base de test non ouverte.");
  return current;
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

function addCustomer(id: number): void {
  raw()
    .prepare(
      `INSERT INTO customers (id, uuid, first_name, last_name, search_name, phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      "Client",
      `#${id}`,
      `client #${id}`,
      `055${id}00000`,
      NOW,
      NOW,
    );
}

function queueRow(customerId: number, kind: string, seed: string, payloadJson: string): string {
  const operationId = OP(seed);
  raw()
    .prepare(
      `INSERT INTO sync_outbox (operation_id, customer_id, kind, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
    )
    .run(operationId, customerId, kind, payloadJson, NOW);
  return operationId;
}

function statusOf(operationId: string): string {
  const row = raw()
    .prepare(`SELECT status FROM sync_outbox WHERE operation_id = ?`)
    .get(operationId) as { status: string } | undefined;
  return row?.status ?? "absent";
}

function countsByStatus(): Record<string, number> {
  const rows = raw()
    .prepare(`SELECT status, COUNT(*) AS n FROM sync_outbox GROUP BY status`)
    .all() as { status: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

function storedDoc(): Record<string, unknown> {
  const row = raw()
    .prepare(`SELECT value_json FROM app_settings WHERE key = 'client_sync'`)
    .get() as { value_json: string } | undefined;
  if (!row) throw new Error("Configuration sync absente.");
  return JSON.parse(row.value_json) as Record<string, unknown>;
}

function seedDoc(): void {
  raw()
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
        lastAttemptAt: null,
        lastError: null,
      }),
      NOW,
    );
}

function seed(): void {
  const db = openMigrated();
  repoDb.current = db;
  addCustomer(1);
  addCustomer(2);
  db.prepare(
    `INSERT INTO customer_access (customer_id, phone_hash, pin_hash, qr_secret_hash, revoked_at, failed_attempts, locked_until, created_at, updated_at, pin_algo)
       VALUES (2, ?, ?, NULL, NULL, 0, NULL, ?, ?, 'pbkdf2-sha256-100k')`,
  ).run("hash-phone-2", "hash-pin-2", NOW, NOW);
  seedDoc();
}

interface Reply {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

function reply(status: number, body: string): Promise<Reply> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  });
}

/** Miroir qui accepte tout (le seul défaut est dans la file locale). */
const mirrorOk = (): (() => Promise<Reply>) => () => reply(201, "[]");

/** Miroir dont la TABLE `client_payloads` n'existe pas (projet non provisionné). */
const mirrorWithoutTable = () => {
  return (url: string) => {
    if (!url.includes("client_payloads")) return reply(201, "[]");
    return reply(
      404,
      '{"code":"42P01","message":"relation \\"public.client_payloads\\" does not exist"}',
    );
  };
};

/** Miroir injoignable (erreur temporaire). */
const mirrorDown = () => () => reply(503, "gateway down");

describe("E-41 : une ligne corrompue en local ne gèle plus la file", () => {
  beforeEach(() => {
    seed();
  });

  it("pousse les clichés lisibles et condamne l'illisible, en UNE tentative", async () => {
    const poison = queueRow(2, "customer_snapshot", "poison", "{payload casse");
    const healthyA = queueRow(2, "invoice_list", "sain-a", '{"demo":"a"}');
    const healthyB = queueRow(2, "payment_list", "sain-b", '{"demo":"b"}');

    const result = await pushNowAtomic({ operationId: OP("push-poison"), now: NOW }, mirrorOk());

    expect(result.pushed).toBe(2);
    expect(result.failed).toBe(1);
    expect(statusOf(poison)).toBe("failed");
    expect(statusOf(healthyA)).toBe("sent");
    expect(statusOf(healthyB)).toBe("sent");
    const doc = storedDoc();
    expect(String(doc["lastError"])).toMatch(/illisible/);
    expect(doc["lastPushAt"]).toBe(NOW);
  });

  it("sans ce correctif la file entière restait pending : rien n'était poussé", async () => {
    // Deuxième tentative sur une file désormais propre : plus aucune erreur.
    queueRow(2, "customer_snapshot", "second-volet", "{oops");
    await pushNowAtomic({ operationId: OP("push-2nd"), now: NOW }, mirrorOk());
    expect(countsByStatus()["failed"]).toBe(1);
    expect(countsByStatus()["pending"] ?? 0).toBe(0);
  });
});

describe("E-42 : une table absente ne condamne pas la file", () => {
  beforeEach(() => {
    seed();
  });

  it("refuse la poussée en laissant TOUS les clichés rejouables", async () => {
    const ids = [
      queueRow(2, "customer_snapshot", "t1", '{"demo":1}'),
      queueRow(2, "invoice_list", "t2", '{"demo":2}'),
      queueRow(2, "payment_list", "t3", '{"demo":3}'),
    ];

    await expect(
      pushNowAtomic({ operationId: OP("push-404"), now: NOW }, mirrorWithoutTable()),
    ).rejects.toThrow(/table/i);

    for (const id of ids) expect(statusOf(id)).toBe("pending");
    expect(countsByStatus()["failed"] ?? 0).toBe(0);
    expect(String(storedDoc()["lastError"])).toMatch(/Miroir incomplet/);
  });
});

describe("E-43 : la cadence est respectée même en échec", () => {
  beforeEach(() => {
    seed();
  });

  it("un échec réseau horodate `lastAttemptAt` (sinon re-tentative toutes les 60 s)", async () => {
    queueRow(2, "customer_snapshot", "down", '{"demo":1}');
    await expect(
      pushNowAtomic({ operationId: OP("push-down"), now: NOW }, mirrorDown()),
    ).rejects.toThrow();
    const doc = storedDoc();
    expect(doc["lastPushAt"]).toBeNull();
    expect(doc["lastAttemptAt"]).toBe(NOW);
    expect(statusOfFirstPending()).toBe("pending");
  });
});

function statusOfFirstPending(): string {
  const row = raw().prepare(`SELECT status FROM sync_outbox ORDER BY id ASC LIMIT 1`).get() as
    { status: string } | undefined;
  return row?.status ?? "absent";
}
