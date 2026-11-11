// Veloria PoS — ADR-182 tranche C : cycle de vie d'une commande client.
//
// Base migrée RÉELLE (node:sqlite) + repo réel : ce que le test prouve :
//   1. le prix de la ligne est RELU dans `products` (le renderer ne fait
//      jamais foi) ;
//   2. la référence suit `CMD-AAAA-NNNNNN` et le compteur avance ;
//   3. le rejeu du même `operationId` ne crée PAS une seconde commande ;
//   4. les transitions suivent le domaine (une commande servie est terminale) ;
//   5. l'annulation exige un MOTIF (le client doit comprendre) ;
//   6. la liaison commande ↔ vente se fait DANS une transaction (pas de
//      commande orpheline, pas de vente sans commande).
import { describe, it, expect, beforeEach, vi } from "vitest";
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

import { buildSnapshotPayload } from "../../electron/ipc/handlers/client-access.repo";
import { pullOrderIntentsAtomic } from "../../electron/sync/sync.service";
import {
  createClientOrderAtomic,
  getClientOrder,
  linkClientOrderToSaleInTransaction,
  listClientOrders,
  setClientOrderStatusAtomic,
} from "../../electron/ipc/handlers/client-order.repo";

const NOW = "2026-11-11T10:00:00.000Z";
const OP = (seed: string): string => {
  const hex = Array.from(seed)
    .map((c) => c.charCodeAt(0).toString(16))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex
    .slice(20, 32)
    .padEnd(12, "0")}`;
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

function seed(): { customerId: number; productId: number } {
  const db = openMigrated();
  repoDb.current = db;
  db.prepare(
    `INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at)
     VALUES ('cuC', 'Nadia', 'Benali', 'nadia benali', '2026-01-01', '2026-01-01')`,
  ).run();
  const customerId = Number(
    (db.prepare(`SELECT id FROM customers WHERE uuid = 'cuC'`).get() as { id: number }).id,
  );
  db.prepare(
    `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at)
     VALUES ('prC', 'Huile d olive', 'PIECE', 5000, 8500, 10, 0, 'in_stock', 1, '2026-01-01', '2026-01-01')`,
  ).run();
  const productId = Number(
    (db.prepare(`SELECT id FROM products WHERE uuid = 'prC'`).get() as { id: number }).id,
  );
  return { customerId, productId };
}

describe("ADR-182 — commandes clients (cycle de vie)", () => {
  let ids: { customerId: number; productId: number };

  beforeEach(() => {
    ids = seed();
  });

  it("crée la commande avec le prix RELU en base et une référence CMD", () => {
    const result = createClientOrderAtomic({
      operationId: OP("create-1"),
      customerId: ids.customerId,
      lines: [{ productId: ids.productId, quantity: 2 }],
      note: "après 16 h",
      now: NOW,
    });
    expect(result.reference).toMatch(/^CMD-\d{4}-\d{5}$/);
    expect(result.totalMinor).toBe(17_000); // 8 500 × 2 (prix de la base)
    const order = getClientOrder(result.id);
    expect(order?.lines).toHaveLength(1);
    expect(order?.lines[0]?.unitPriceMinor).toBe(8_500);
    expect(order?.lines[0]?.reservedQuantity).toBe(2);
    expect(order?.status).toBe("nouvelle");
    expect(order?.note).toBe("après 16 h");
  });

  it("relit le prix : un changement de prix s'applique à la commande suivante", () => {
    const db = repoDb.current;
    if (!db) throw new Error("Base fermée.");
    db.prepare(`UPDATE products SET selling_price_minor = 9000 WHERE id = ?`).run(ids.productId);
    const result = createClientOrderAtomic({
      operationId: OP("create-price"),
      customerId: ids.customerId,
      lines: [{ productId: ids.productId, quantity: 1 }],
      now: NOW,
    });
    expect(result.totalMinor).toBe(9_000);
  });

  it("refuse une commande sans prix de vente valide", () => {
    const db = repoDb.current;
    if (!db) throw new Error("Base fermée.");
    db.prepare(`UPDATE products SET selling_price_minor = 0 WHERE id = ?`).run(ids.productId);
    expect(() =>
      createClientOrderAtomic({
        operationId: OP("create-noprice"),
        customerId: ids.customerId,
        lines: [{ productId: ids.productId, quantity: 1 }],
        now: NOW,
      }),
    ).toThrow(/prix de vente/i);
  });

  it("refuse une commande pour un client archivé", () => {
    const db = repoDb.current;
    if (!db) throw new Error("Base fermée.");
    db.prepare(`UPDATE customers SET deleted_at = ? WHERE id = ?`).run(NOW, ids.customerId);
    expect(() =>
      createClientOrderAtomic({
        operationId: OP("create-archived"),
        customerId: ids.customerId,
        lines: [{ productId: ids.productId, quantity: 1 }],
        now: NOW,
      }),
    ).toThrow(/archivé/i);
  });

  it("le rejeu du même operationId ne crée PAS de seconde commande", () => {
    const first = createClientOrderAtomic({
      operationId: OP("idem-1"),
      customerId: ids.customerId,
      lines: [{ productId: ids.productId, quantity: 1 }],
      now: NOW,
    });
    const second = createClientOrderAtomic({
      operationId: OP("idem-1"),
      customerId: ids.customerId,
      lines: [{ productId: ids.productId, quantity: 1 }],
      now: NOW,
    });
    expect(second).toEqual(first);
    expect(listClientOrders({ limit: 50 })).toHaveLength(1);
  });

  it("suit les transitions et refuse les retours en arrière", () => {
    const created = createClientOrderAtomic({
      operationId: OP("trans-1"),
      customerId: ids.customerId,
      lines: [{ productId: ids.productId, quantity: 1 }],
      now: NOW,
    });
    setClientOrderStatusAtomic({
      orderId: created.id,
      status: "preparing",
      operationId: OP("trans-2"),
      now: NOW,
    });
    expect(getClientOrder(created.id)?.status).toBe("preparing");
    setClientOrderStatusAtomic({
      orderId: created.id,
      status: "ready",
      operationId: OP("trans-3"),
      now: NOW,
    });
    expect(getClientOrder(created.id)?.status).toBe("ready");
    // « Préparation » depuis « prête » : interdit par le domaine ET le trigger.
    expect(() =>
      setClientOrderStatusAtomic({
        orderId: created.id,
        status: "preparing",
        operationId: OP("trans-4"),
        now: NOW,
      }),
    ).toThrow(/impossible|transition/i);
  });

  it("exige un motif pour annuler", () => {
    const created = createClientOrderAtomic({
      operationId: OP("cancel-1"),
      customerId: ids.customerId,
      lines: [{ productId: ids.productId, quantity: 1 }],
      now: NOW,
    });
    expect(() =>
      setClientOrderStatusAtomic({
        orderId: created.id,
        status: "cancelled",
        operationId: OP("cancel-2"),
        now: NOW,
      }),
    ).toThrow(/motif|pourquoi/i);
    setClientOrderStatusAtomic({
      orderId: created.id,
      status: "cancelled",
      cancelReason: "stock épuisé",
      operationId: OP("cancel-3"),
      now: NOW,
    });
    expect(getClientOrder(created.id)?.cancelReason).toBe("stock épuisé");
  });

  it("refuse de livrer une commande sans vente encaissée", () => {
    const created = createClientOrderAtomic({
      operationId: OP("serve-0"),
      customerId: ids.customerId,
      lines: [{ productId: ids.productId, quantity: 1 }],
      now: NOW,
    });
    expect(() =>
      setClientOrderStatusAtomic({
        orderId: created.id,
        status: "served",
        operationId: OP("serve-1"),
        now: NOW,
      }),
    ).toThrow(/vente/i);
  });

  it("lie la commande à la vente DANS la transaction (et refuse les abus)", () => {
    const db = repoDb.current;
    if (!db) throw new Error("Base fermée.");
    const created = createClientOrderAtomic({
      operationId: OP("link-1"),
      customerId: ids.customerId,
      lines: [{ productId: ids.productId, quantity: 1 }],
      now: NOW,
    });
    db.prepare(
      `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, discount_type, discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, payment_method, created_at, updated_at)
       VALUES ('saC', 'FAC-2026-9001', ?, 8500, 'none', 0, 0, 0, 8500, 8500, 0, 'paid', 'cash', ?, ?)`,
    ).run(ids.customerId, NOW, NOW);
    const saleId = Number(
      (db.prepare(`SELECT id FROM sales WHERE uuid = 'saC'`).get() as { id: number }).id,
    );

    // Autre client : refus (une commande ne se lie pas au compte d'autrui).
    db.prepare(
      `INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at)
       VALUES ('cuD', 'Ali', 'Autre', 'ali autre', '2026-01-01', '2026-01-01')`,
    ).run();
    const otherId = Number(
      (db.prepare(`SELECT id FROM customers WHERE uuid = 'cuD'`).get() as { id: number }).id,
    );
    expect(() =>
      linkClientOrderToSaleInTransaction({
        orderId: created.id,
        saleId,
        customerId: otherId,
        now: NOW,
      }),
    ).toThrow(/client/i);

    // Bonne liaison : la commande passe à « livrée ».
    linkClientOrderToSaleInTransaction({
      orderId: created.id,
      saleId,
      customerId: ids.customerId,
      now: NOW,
    });
    const linked = getClientOrder(created.id);
    expect(linked?.status).toBe("served");
    expect(linked?.saleId).toBe(saleId);

    // Re-liaison à une autre vente : refus (pas d'historique réécrit).
    expect(() =>
      linkClientOrderToSaleInTransaction({
        orderId: created.id,
        saleId: saleId + 1,
        customerId: ids.customerId,
        now: NOW,
      }),
    ).toThrow(/déjà liée/i);
  });

  it("le cliché customer_snapshot porte les commandes du client (ADR-182 D)", () => {
    const created = createClientOrderAtomic({
      operationId: OP("snapshot-1"),
      customerId: ids.customerId,
      lines: [{ productId: ids.productId, quantity: 1 }],
      now: NOW,
    });
    const payload = JSON.parse(
      buildSnapshotPayload(ids.customerId, "customer_snapshot", null, "2026-11", NOW),
    ) as {
      orders?: {
        id: number;
        reference: string;
        status: string;
        totalMinor: number;
        saleId: number | null;
      }[];
    };
    expect(Array.isArray(payload.orders)).toBe(true);
    expect(payload.orders).toHaveLength(1);
    expect(payload.orders?.[0]?.id).toBe(created.id);
    expect(payload.orders?.[0]?.reference).toBe(created.reference);
    expect(payload.orders?.[0]?.status).toBe("nouvelle");
    expect(payload.orders?.[0]?.totalMinor).toBe(8_500);
    expect(payload.orders?.[0]?.saleId).toBeNull();
  });

  it("tire les intentions et les transforme en commandes (ADR-182 F)", async () => {
    const db = repoDb.current;
    if (!db) throw new Error("Base fermée.");
    // Doc miroir configurée (le tirage refuse de partir sans elle).
    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('client_sync', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(
      JSON.stringify({
        enabled: true,
        supabaseUrl: "http://127.0.0.1:8100",
        serviceKey: "k".repeat(40),
        anonKey: "",
        intervalMinutes: 15,
        lastPushAt: null,
        lastError: null,
      }),
      NOW,
    );
    const intents = [
      {
        operation_id: "11111111-1111-4111-8111-111111111111",
        customer_id: ids.customerId,
        lines: [{ productId: ids.productId, quantity: 2 }],
        total_minor: 17_000,
        note: "après 16 h",
      },
    ];
    const marked: { status: string; reference: string | null }[] = [];
    const result = await pullOrderIntentsAtomic(
      (_url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
        if (init.method === "GET") {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(intents)),
          });
        }
        const parsed = JSON.parse(init.body) as { status: string; order_reference: string | null };
        marked.push({ status: parsed.status, reference: parsed.order_reference });
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("[]") });
      },
    );
    expect(result.taken).toBe(1);
    expect(result.rejected).toBe(0);
    // La commande existe dans SQLite (le master) avec la référence CMD-…
    const orders = db
      .prepare(`SELECT id, reference, status, total_minor, note FROM client_orders`)
      .all() as {
      id: number;
      reference: string;
      status: string;
      total_minor: number;
      note: string;
    }[];
    expect(orders).toHaveLength(1);
    expect(orders[0]?.reference).toMatch(/^CMD-\d{4}-\d{5}$/);
    expect(orders[0]?.status).toBe("nouvelle");
    expect(orders[0]?.total_minor).toBe(17_000);
    expect(orders[0]?.note).toBe("après 16 h");
    // L'intention est marquée prise, avec la référence de la commande.
    expect(marked[0]?.status).toBe("taken");
    expect(marked[0]?.reference).toBe(orders[0]?.reference);
  });

  it("refuse DÉFINITIVEMENT une intention irrecevable (produit archivé)", async () => {
    const db = repoDb.current;
    if (!db) throw new Error("Base fermée.");
    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('client_sync', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(
      JSON.stringify({
        enabled: true,
        supabaseUrl: "http://127.0.0.1:8100",
        serviceKey: "k".repeat(40),
        anonKey: "",
        intervalMinutes: 15,
        lastPushAt: null,
        lastError: null,
      }),
      NOW,
    );
    // Le produit n'existe pas (produit supprimé) => refus définitif.
    const marked: string[] = [];
    const result = await pullOrderIntentsAtomic(
      (_url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
        if (init.method === "GET") {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify([
                  {
                    operation_id: "22222222-2222-4222-8222-222222222222",
                    customer_id: ids.customerId,
                    lines: [{ productId: 999_999, quantity: 1 }],
                    total_minor: 100,
                    note: null,
                  },
                ]),
              ),
          });
        }
        marked.push((JSON.parse(init.body) as { status: string }).status);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("[]") });
      },
    );
    expect(result.taken).toBe(0);
    expect(result.rejected).toBe(1);
    expect(marked[0]).toBe("rejected");
  });
});
