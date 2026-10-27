// Veloria PoS — E-20 (régénération) : la CONVERSION d'un devis REMISÉ doit
// produire une vente au montant EXACT du devis (avant : échec systématique
// « Type de remise non pris en charge »).
// Repos RÉELS sur base migrée temporaire (node:sqlite).
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
          // Imitation fidèle de better-sqlite3 : une transaction imbriquée
          // devient un SAVEPOINT (la conversion devis→vente ouvre une tx
          // interne).
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
  convertProformaToSaleAtomic,
  createProformaAtomic,
} from "../../electron/ipc/handlers/proformas.repo";

const NOW = "2026-10-19T09:00:00.000Z";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "proforma.sqlite"));
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

function seedProforma(
  db: DatabaseSync,
  opts: { lines: { price: number; qty: number }[]; discount: number; delivery: number },
): number {
  const subtotal = opts.lines.reduce((a, l) => a + l.price * l.qty, 0);
  const total = subtotal - opts.discount + opts.delivery;
  const r = db
    .prepare(
      `INSERT INTO proforma_invoices (uuid, proforma_number, customer_id, subtotal_minor, discount_amount_minor, delivery_fee_minor, total_minor, status, created_at, updated_at)
       VALUES (?, 'DV-TEST-000001', NULL, ?, ?, ?, ?, 'sent', ?, ?)`,
    )
    .run(crypto.randomUUID(), subtotal, opts.discount, opts.delivery, total, NOW, NOW);
  const id = Number(r.lastInsertRowid);
  for (const l of opts.lines) {
    db.prepare(
      `INSERT INTO proforma_items (proforma_id, product_id, product_name_snapshot, unit_price_minor, quantity, line_total_minor)
       VALUES (?, NULL, 'Article test', ?, ?, ?)`,
    ).run(id, l.price, l.qty, l.price * l.qty);
  }
  return id;
}

describe("E-20 : conversion d'un devis remisé → vente au montant exact", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-proforma-conv-"));
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

  it("devis remisé : la vente est créée, total = devis, remise répartie", () => {
    const proformaId = seedProforma(db, {
      lines: [
        { price: 1000, qty: 2 },
        { price: 1500, qty: 1 },
      ],
      discount: 500,
      delivery: 200,
    });
    const res = convertProformaToSaleAtomic({
      proformaId,
      amountPaidMinor: 3200,
      paymentMethod: "cash",
      operationId: crypto.randomUUID(),
      now: NOW,
    });
    const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(res.saleId) as {
      subtotal_minor: number;
      discount_amount_minor: number;
      discount_type: string;
      delivery_fee_minor: number;
      total_minor: number;
      amount_paid_minor: number;
      remaining_balance_minor: number;
      payment_status: string;
    };
    // Montants EXACTS du devis : sous-total 3500, remise 500, livraison 200.
    expect(sale.subtotal_minor).toBe(3500);
    expect(sale.discount_amount_minor).toBe(500);
    expect(sale.delivery_fee_minor).toBe(200);
    expect(sale.total_minor).toBe(3200);
    expect(sale.amount_paid_minor).toBe(3200);
    expect(sale.remaining_balance_minor).toBe(0);
    expect(sale.payment_status).toBe("paid");
    // La remise est répartie sur les lignes, Σ exacte.
    const items = db
      .prepare("SELECT discount_minor, line_total_minor FROM sale_items WHERE sale_id = ?")
      .all(res.saleId) as { discount_minor: number; line_total_minor: number }[];
    expect(items).toHaveLength(2);
    expect(items.reduce((a, l) => a + l.discount_minor, 0)).toBe(500);
    // Les prix unitaires affichés restent ceux du devis (remise = ligne « Remise »).
    const price = db
      .prepare(
        "SELECT unit_price_minor, original_unit_price_minor FROM sale_items WHERE sale_id = ?",
      )
      .all(res.saleId) as { unit_price_minor: number; original_unit_price_minor: number }[];
    expect(price[0]?.unit_price_minor).toBe(1000);
    expect(price[0]?.original_unit_price_minor).toBe(1000);
  });

  it("devis remisé en PARTIE réglé (client au crédit) : reste exact", () => {
    const cust = db
      .prepare(
        `INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, credit_limit_minor, outstanding_balance_minor, debt_status, is_over_limit, created_at, updated_at)
         VALUES (?, 'Test', 'Client', 'test client', 1, 1000000, 0, 'none', 0, ?, ?)`,
      )
      .run(crypto.randomUUID(), NOW, NOW);
    const customerId = Number(cust.lastInsertRowid);
    const proformaId = seedProforma(db, {
      lines: [{ price: 1000, qty: 2 }],
      discount: 500,
      delivery: 200,
    });
    db.prepare("UPDATE proforma_invoices SET customer_id = ? WHERE id = ?").run(
      customerId,
      proformaId,
    );
    const res = convertProformaToSaleAtomic({
      proformaId,
      amountPaidMinor: 1000,
      paymentMethod: "cash",
      operationId: crypto.randomUUID(),
      now: NOW,
    });
    const sale = db
      .prepare(
        "SELECT total_minor, remaining_balance_minor, payment_status FROM sales WHERE id = ?",
      )
      .get(res.saleId) as {
      total_minor: number;
      remaining_balance_minor: number;
      payment_status: string;
    };
    expect(sale.total_minor).toBe(1700);
    expect(sale.remaining_balance_minor).toBe(700);
    expect(sale.payment_status).toBe("partial");
  });

  it("devis SANS remise : comportement inchangé (régression)", () => {
    const proformaId = seedProforma(db, {
      lines: [{ price: 1000, qty: 2 }],
      discount: 0,
      delivery: 0,
    });
    const res = convertProformaToSaleAtomic({
      proformaId,
      amountPaidMinor: 2000,
      paymentMethod: "cash",
      operationId: crypto.randomUUID(),
      now: NOW,
    });
    const sale = db
      .prepare("SELECT total_minor, discount_amount_minor FROM sales WHERE id = ?")
      .get(res.saleId) as { total_minor: number; discount_amount_minor: number };
    expect(sale.total_minor).toBe(2000);
    expect(sale.discount_amount_minor).toBe(0);
  });

  it("remise non représentable en centimes entiers : montant EXACT conservé", () => {
    // 1 centime de remise sur une ligne à 3 unités : la répartition reste
    // entière (Σ = 1) et le total de la vente = total du devis.
    const proformaId = seedProforma(db, {
      lines: [{ price: 1000, qty: 3 }],
      discount: 1,
      delivery: 0,
    });
    const res = convertProformaToSaleAtomic({
      proformaId,
      amountPaidMinor: 2999,
      paymentMethod: "cash",
      operationId: crypto.randomUUID(),
      now: NOW,
    });
    const sale = db
      .prepare("SELECT total_minor, discount_amount_minor FROM sales WHERE id = ?")
      .get(res.saleId) as { total_minor: number; discount_amount_minor: number };
    expect(sale.discount_amount_minor).toBe(1);
    expect(sale.total_minor).toBe(2999);
  });

  it("devis carton : total carton, conversion même si le tarif a changé, stock en unités de base", () => {
    const product = db
      .prepare(
        `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at)
         VALUES (?, 'Coca 1L', 'PIECE', 1500, 2000, 100, 0, 'in_stock', ?, ?)`,
      )
      .run(crypto.randomUUID(), NOW, NOW);
    const productId = Number(product.lastInsertRowid);
    db.prepare(
      `INSERT INTO inventory_layers (uuid, product_id, original_quantity, remaining_quantity, unit_cost_minor, purchase_date, reason, created_at)
       VALUES (?, ?, 100, 100, 1500, '2026-10-01', 'opening', ?)`,
    ).run(crypto.randomUUID(), productId, NOW);
    const pack = db
      .prepare(
        `INSERT INTO product_packagings (product_id, label_fr, factor, selling_price_minor, purchase_price_minor, auto_carton_pricing, is_active, created_at, updated_at)
         VALUES (?, 'Carton de 12', 12, 22000, 18000, 1, 1, ?, ?)`,
      )
      .run(productId, NOW, NOW);
    const packagingId = Number(pack.lastInsertRowid);

    const created = createProformaAtomic({
      customerId: null,
      lines: [
        {
          productId,
          productName: "Coca 1L",
          unitCode: "Carton de 12",
          unitPriceMinor: 22000,
          quantity: 1,
          packagingId,
          unitFactor: 12,
        },
        {
          productId,
          productName: "Coca 1L",
          unitCode: "PIECE",
          unitPriceMinor: 2000,
          quantity: 3,
          packagingId: null,
          unitFactor: 1,
        },
      ],
      discountMinor: 0,
      deliveryMinor: 0,
      dueDate: null,
      notes: null,
      terms: null,
      operationId: crypto.randomUUID(),
      now: NOW,
    });

    const quote = db
      .prepare("SELECT subtotal_minor, total_minor FROM proforma_invoices WHERE id = ?")
      .get(created.id) as { subtotal_minor: number; total_minor: number };
    expect(quote).toEqual({ subtotal_minor: 28000, total_minor: 28000 });
    const quoteItems = db
      .prepare(
        "SELECT quantity, unit_price_minor, unit_factor, packaging_id, unit_code FROM proforma_items WHERE proforma_id = ? ORDER BY id",
      )
      .all(created.id) as {
      quantity: number;
      unit_price_minor: number;
      unit_factor: number;
      packaging_id: number | null;
      unit_code: string;
    }[];
    expect(quoteItems).toHaveLength(2);
    expect(quoteItems[0]).toMatchObject({
      quantity: 1,
      unit_price_minor: 22000,
      unit_factor: 12,
      packaging_id: packagingId,
      unit_code: "Carton de 12",
    });

    // Le devis est une snapshot : tarif/désactivation ultérieurs ne changent
    // ni le total ni la conversion (stock déduit avec le facteur du devis).
    db.prepare(
      "UPDATE product_packagings SET selling_price_minor = 99999, is_active = 0 WHERE id = ?",
    ).run(packagingId);

    const res = convertProformaToSaleAtomic({
      proformaId: created.id,
      amountPaidMinor: 28000,
      paymentMethod: "cash",
      operationId: crypto.randomUUID(),
      now: NOW,
    });
    const sale = db
      .prepare("SELECT subtotal_minor, discount_amount_minor, total_minor FROM sales WHERE id = ?")
      .get(res.saleId) as {
      subtotal_minor: number;
      discount_amount_minor: number;
      total_minor: number;
    };
    expect(sale).toEqual({ subtotal_minor: 28000, discount_amount_minor: 0, total_minor: 28000 });
    const saleItems = db
      .prepare(
        "SELECT quantity, unit_factor, packaging_id, unit_price_minor, unit_code FROM sale_items WHERE sale_id = ? ORDER BY id",
      )
      .all(res.saleId) as {
      quantity: number;
      unit_factor: number;
      packaging_id: number | null;
      unit_price_minor: number;
      unit_code: string;
    }[];
    expect(saleItems).toHaveLength(2);
    expect(saleItems[0]).toMatchObject({
      quantity: 1,
      unit_factor: 12,
      packaging_id: packagingId,
      unit_price_minor: 22000,
      unit_code: "Carton de 12",
    });
    expect(saleItems[1]).toMatchObject({ quantity: 3, unit_factor: 1, unit_price_minor: 2000 });
    const stock = db.prepare("SELECT quantity FROM products WHERE id = ?").get(productId) as {
      quantity: number;
    };
    expect(Number(stock.quantity)).toBe(85);
    const movement = db
      .prepare(
        "SELECT COALESCE(SUM(quantity_delta),0) AS d FROM stock_movements WHERE related_entity_type = 'sale' AND related_entity_id = ?",
      )
      .get(String(res.saleId)) as { d: number };
    expect(Number(movement.d)).toBe(-15);
  });
});
