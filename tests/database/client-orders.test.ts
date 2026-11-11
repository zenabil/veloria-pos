// Veloria PoS — Migration 0063 : commandes clients (ADR-182, tranche C).
//
// Ce que le test prouve sur la base RÉELLE migrée :
//   1. les tables, index, séquence et trigger existent ;
//   2. le TRIGGER accepte exactement les transitions que le DOMAINE déclare
//      (parité domaine ↔ base : le merchant ne doit jamais voir une transition
//      annoncée impossible puis refusée par la base, ni l'inverse) ;
//   3. les CHECK de FORME tiennent : une commande livrée sans vente, ou
//      annulée sans motif, sont refusées PAR LA BASE (pas seulement par l'UI).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  formatOrderReference,
} from "../../src/domain/order/client-order.ts";

describe("Migration 0063 — commandes clients", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-0063-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function openMigrated(): DatabaseSync {
    const db = new DatabaseSync(path.join(tmp, "c63.sqlite"));
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

  function seedCustomerAndProduct(db: DatabaseSync): { customerId: number; productId: number } {
    db.prepare(
      `INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at)
       VALUES ('cu63', 'Amine', 'Test', 'amine test', '2026-01-01', '2026-01-01')`,
    ).run();
    const customerId = Number(
      (db.prepare(`SELECT id FROM customers WHERE uuid = 'cu63'`).get() as { id: number }).id,
    );
    db.prepare(
      `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at)
       VALUES ('pr63', 'Huile', 'PIECE', 5000, 8500, 10, 0, 'in_stock', 1, '2026-01-01', '2026-01-01')`,
    ).run();
    const productId = Number(
      (db.prepare(`SELECT id FROM products WHERE uuid = 'pr63'`).get() as { id: number }).id,
    );
    return { customerId, productId };
  }

  /** Compteur déterministe : les références sont UNIQUES en base. */
  let referenceCounter = 0;

  function insertOrder(
    db: DatabaseSync,
    customerId: number,
    status: string,
    extra?: { saleId?: number | null; cancelReason?: string | null },
  ): number {
    referenceCounter += 1;
    const info = db
      .prepare(
        `INSERT INTO client_orders (uuid, reference, customer_id, status, total_minor, source, cancel_reason, sale_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 8500, 'manual', ?, ?, '2026-11-11T10:00:00.000Z', '2026-11-11T10:00:00.000Z')`,
      )
      .run(
        `co63-${status}-${referenceCounter}`,
        `CMD-2026-${String(referenceCounter).padStart(5, "0")}`,
        customerId,
        status,
        extra?.cancelReason ?? null,
        extra?.saleId ?? null,
      );
    return Number(info.lastInsertRowid);
  }

  it("crée les tables, index, séquence et trigger", () => {
    const db = openMigrated();
    for (const t of ["client_orders", "client_order_lines"]) {
      const found = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(t) as { name: string } | undefined;
      expect(found?.name, `table manquante : ${t}`).toBe(t);
    }
    for (const i of [
      "idx_client_orders_status_created",
      "idx_client_orders_customer",
      "idx_client_order_lines_order",
    ]) {
      const found = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
        .get(i) as { name: string } | undefined;
      expect(found?.name, `index manquant : ${i}`).toBe(i);
    }
    const trigger = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?")
      .get("trg_client_orders_status_transition") as { name: string } | undefined;
    expect(trigger?.name).toBe("trg_client_orders_status_transition");
    const seq = db
      .prepare(
        `SELECT prefix, next_value FROM number_sequences WHERE sequence_key = 'client_order'`,
      )
      .get() as { prefix: string; next_value: number } | undefined;
    expect(seq?.prefix).toBe("CMD");
    expect(seq?.next_value).toBe(1);
    db.close();
  });

  it("le TRIGGER accepte exactement les transitions du domaine (parité)", () => {
    const db = openMigrated();
    const { customerId } = seedCustomerAndProduct(db);
    // Une vente pour l'état « servie ».
    db.prepare(
      `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, discount_type, discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, payment_method, created_at, updated_at)
       VALUES ('sa63', 'FAC-2026-0001', ?, 8500, 'none', 0, 0, 0, 8500, 8500, 0, 'paid', 'cash', '2026-11-11T10:00:00.000Z', '2026-11-11T10:00:00.000Z')`,
    ).run(customerId);
    const saleId = Number(
      (db.prepare(`SELECT id FROM sales WHERE uuid = 'sa63'`).get() as { id: number }).id,
    );

    let counter = 0;
    try {
      for (const from of ORDER_STATUSES) {
        for (const to of ORDER_STATUSES) {
          counter += 1;
          const orderId = insertOrder(db, customerId, from, {
            saleId: from === "served" ? saleId : null,
            cancelReason: from === "cancelled" ? "stock épuisé" : null,
          });
          const allowed = from === to || ORDER_TRANSITIONS[from].includes(to);
          const apply = (): void => {
            // Passer à « servie » exige la vente liée (CHECK de FORME) : c'est
            // la VENTE qui livre la commande, jamais un simple UPDATE. Même
            // règle pour l'annulation : le MOTIF est obligatoire.
            db.prepare(
              `UPDATE client_orders SET status = ?, sale_id = ?, cancel_reason = ?, updated_at = ? WHERE id = ?`,
            ).run(
              to,
              to === "served" ? saleId : null,
              to === "cancelled" ? "stock épuisé" : null,
              "2026-11-11T11:00:00.000Z",
              orderId,
            );
          };
          if (allowed) {
            expect(apply, `${from} → ${to} doit être accepté`).not.toThrow();
          } else {
            expect(apply, `${from} → ${to} doit être refusé`).toThrow();
          }
        }
      }
      expect(counter).toBe(ORDER_STATUSES.length * ORDER_STATUSES.length);
    } finally {
      db.close();
    }
  });

  it("refuse une commande « livrée » sans vente (forme Inviolable)", () => {
    const db = openMigrated();
    const { customerId } = seedCustomerAndProduct(db);
    expect(() => insertOrder(db, customerId, "served", { saleId: null })).toThrow();
    db.close();
  });

  it("refuse une commande annulée sans motif", () => {
    const db = openMigrated();
    const { customerId } = seedCustomerAndProduct(db);
    expect(() => insertOrder(db, customerId, "cancelled", { cancelReason: null })).toThrow();
    db.close();
  });

  it("refuse un état inconnu", () => {
    const db = openMigrated();
    const { customerId } = seedCustomerAndProduct(db);
    expect(() => insertOrder(db, customerId, "livree")).toThrow();
    db.close();
  });

  it("la référence suit le format PRÉFIXE-ANNÉE-00001", () => {
    expect(formatOrderReference("CMD", 2026, 1)).toBe("CMD-2026-00001");
    expect(formatOrderReference("CMD", 2026, 42)).toBe("CMD-2026-00042");
    expect(() => formatOrderReference("CMD", 2026, 0)).toThrow();
  });

  it("les transitions du domaine sont celles du main (jumeau)", async () => {
    const main = await import("../../electron/ipc/handlers/client-order.repo.ts");
    expect(main.ORDER_STATUSES).toEqual(ORDER_STATUSES);
    for (const status of ORDER_STATUSES) {
      expect([...main.ORDER_TRANSITIONS[status]]).toEqual([...ORDER_TRANSITIONS[status]]);
    }
  });
});
