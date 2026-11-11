// ADR-182 — Publication du catalogue client : preuve d'intégration.
//
// On simule le miroir (table `store_catalog` + `store_catalog_meta`) par un
// transport injecté, et on publie depuis une base migrée réelle. Ce que le
// test prouve (et qui ne serait PAS prouvé par le test unitaire) :
//   1. seuls les produits publiables partent (prix nul, archivé, catégorie
//      exclue : absents du corps POST) ;
//   2. le retrait se fait par DRAPEAU (`is_published = 0`), jamais par
//      DELETE — un produit dépublié reste lisible pour le diagnostic ;
//   3. la version est écrite dans `store_catalog_meta` et mémorisée en local ;
//   4. le rejeu du même `operationId` ne republie PAS (idempotence).
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

import { publishCatalogAtomic } from "../../electron/sync/sync.service";
import {
  getCatalogSettings,
  isCatalogStale,
} from "../../electron/ipc/handlers/client-catalog.repo";

const NOW = "2026-11-11T10:00:00.000Z";
const SERVICE_KEY = "k".repeat(40);

const OP = (seed: string): string => {
  const hex = createHash("sha256").update(`veloria-catalog-${seed}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

/** Miroir simulé : lignes `store_catalog` + méta. */
interface Mirror {
  rows: Map<number, Record<string, unknown>>;
  meta: Record<string, unknown> | null;
  posts: { url: string; body: unknown }[];
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

function addCategory(id: number, name: string): void {
  const raw = repoDb.current;
  if (!raw) throw new Error("Base de test non ouverte.");
  raw
    .prepare(
      `INSERT INTO categories (id, uuid, name, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run(id, `10000000-0000-4000-8000-${String(id).padStart(12, "0")}`, name, NOW, NOW);
}

function addProduct(args: {
  id: number;
  name: string;
  priceMinor: number;
  categoryId?: number | null;
  active?: boolean;
  quantity?: number;
}): void {
  const raw = repoDb.current;
  if (!raw) throw new Error("Base de test non ouverte.");
  const now = NOW;
  raw
    .prepare(
      `INSERT INTO products (uuid, name, category_id, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'PIECE', 0, ?, ?, 0, 'in_stock', ?, ?, ?)`,
    )
    .run(
      `00000000-0000-4000-8000-${String(args.id).padStart(12, "0")}`,
      args.name,
      args.categoryId ?? null,
      args.priceMinor,
      args.quantity ?? 10,
      args.active === false ? 0 : 1,
      now,
      now,
    );
}

function setSetting(key: string, value: unknown): void {
  const raw = repoDb.current;
  if (!raw) throw new Error("Base de test non ouverte.");
  raw
    .prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), NOW);
}

/** Transport qui joue le rôle de PostgREST sur le miroir simulé. */
function makeTransport(mirror: Mirror) {
  return (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> => {
    if (init.method === "GET") {
      const rows = [...mirror.rows.values()].filter((r) => Number(r["is_published"]) === 1);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(rows)),
      });
    }
    mirror.posts.push({ url, body: JSON.parse(init.body) as unknown });
    if (url.includes("/store_catalog_meta")) {
      const rows = JSON.parse(init.body) as Record<string, unknown>[];
      mirror.meta = rows[0] ?? null;
      return Promise.resolve({ ok: true, status: 201, text: () => Promise.resolve("[]") });
    }
    const rows = JSON.parse(init.body) as Record<string, unknown>[];
    for (const row of rows) {
      mirror.rows.set(Number(row["product_id"]), { ...row });
    }
    return Promise.resolve({ ok: true, status: 201, text: () => Promise.resolve("[]") });
  };
}

function seed(): Mirror {
  const raw = openMigrated();
  repoDb.current = raw;
  addCategory(10, "Épicerie");
  addCategory(20, "Boissons");
  addProduct({ id: 1, name: "Huile d'olive 1 L", priceMinor: 85_000, categoryId: 10 });
  addProduct({ id: 2, name: "Riz 5 kg", priceMinor: 62_000, categoryId: 10 });
  addProduct({ id: 3, name: "Produit sans prix", priceMinor: 0, categoryId: 10 });
  addProduct({ id: 4, name: "Produit archivé", priceMinor: 10_000, active: false });
  addProduct({ id: 5, name: "Alcool (catégorie exclue)", priceMinor: 500_000, categoryId: 20 });
  setSetting("client_sync", {
    enabled: true,
    supabaseUrl: "http://127.0.0.1:8100",
    serviceKey: SERVICE_KEY,
    anonKey: "",
    intervalMinutes: 15,
    lastPushAt: null,
    lastError: null,
  });
  setSetting("client_catalog", {
    enabled: true,
    excludedCategoryIds: [20],
    lastPublishedAt: null,
    lastVersion: null,
    lastProductCount: 0,
    dirty: true,
  });
  return { rows: new Map(), meta: null, posts: [] };
}

describe("ADR-182 — publication du catalogue vers le miroir", () => {
  let mirror: Mirror;

  beforeEach(() => {
    mirror = seed();
  });

  it("publie SEULEMENT les produits publiables et écrit la version", async () => {
    const result = await publishCatalogAtomic(
      { operationId: OP("publish-1"), now: NOW },
      makeTransport(mirror),
    );
    expect(result.published).toBe(true);
    expect(result.productCount).toBe(2);
    expect(result.retiredCount).toBe(0);
    const ids = [...mirror.rows.keys()].sort((a, b) => a - b);
    // 1 (prix) et 2 (prix) publiés ; 3 (prix nul), 4 (archivé) et
    // 5 (catégorie exclue) ABSENTS.
    expect(ids).toEqual([1, 2]);
    expect(mirror.meta).toMatchObject({ id: 1, product_count: 2 });
    expect(String(mirror.meta?.["version"])).toMatch(/^[0-9a-f]{64}$/);
    // La version est mémorisée en local : le catalogue n'est plus « périmé ».
    const settings = getCatalogSettings();
    expect(settings.lastVersion).toBe(String(mirror.meta?.["version"]));
    expect(settings.dirty).toBe(false);
    expect(settings.lastProductCount).toBe(2);
    expect(isCatalogStale()).toBe(false);
  });

  it("retire un produit dépublié par DRAPEAU (jamais par DELETE)", async () => {
    await publishCatalogAtomic({ operationId: OP("publish-2"), now: NOW }, makeTransport(mirror));
    expect(mirror.rows.size).toBe(2);
    // Le commerçant désactive le produit 2 puis republie.
    const raw = repoDb.current;
    if (!raw) throw new Error("Base de test non ouverte.");
    raw.prepare(`UPDATE products SET is_active = 0, deleted_at = ? WHERE id = 2`).run(NOW);
    expect(isCatalogStale()).toBe(true);
    const result = await publishCatalogAtomic(
      { operationId: OP("publish-3"), now: NOW },
      makeTransport(mirror),
    );
    expect(result.productCount).toBe(1);
    expect(result.retiredCount).toBe(1);
    // La ligne reste dans le miroir, mais retirée de la publication.
    expect(mirror.rows.size).toBe(2);
    expect(Number(mirror.rows.get(2)?.["is_published"])).toBe(0);
    expect(Number(mirror.rows.get(1)?.["is_published"])).toBe(1);
  });

  it("le rejeu du même operationId ne republie PAS", async () => {
    const transport = makeTransport(mirror);
    const first = await publishCatalogAtomic({ operationId: OP("idem"), now: NOW }, transport);
    const postsAfterFirst = mirror.posts.length;
    const second = await publishCatalogAtomic({ operationId: OP("idem"), now: NOW }, transport);
    expect(second).toEqual(first);
    expect(mirror.posts.length).toBe(postsAfterFirst);
  });

  it("refuse la publication si le catalogue est désactivé (message FR)", async () => {
    setSetting("client_catalog", {
      enabled: false,
      excludedCategoryIds: [],
      lastPublishedAt: null,
      lastVersion: null,
      lastProductCount: 0,
      dirty: true,
    });
    await expect(
      publishCatalogAtomic({ operationId: OP("off"), now: NOW }, makeTransport(mirror)),
    ).rejects.toThrow(/désactivé/i);
    expect(mirror.posts.length).toBe(0);
  });

  it("refuse la publication si le miroir n'est pas configuré (message FR)", async () => {
    setSetting("client_sync", {
      enabled: false,
      supabaseUrl: "",
      serviceKey: "",
      anonKey: "",
      intervalMinutes: 15,
      lastPushAt: null,
      lastError: null,
    });
    await expect(
      publishCatalogAtomic({ operationId: OP("nomirror"), now: NOW }, makeTransport(mirror)),
    ).rejects.toThrow(/Miroir non configuré/i);
    expect(mirror.posts.length).toBe(0);
  });
});
