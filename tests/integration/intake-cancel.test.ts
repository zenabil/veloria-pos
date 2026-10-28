// Veloria PoS — ADR-139 : annulation d'une facture fournisseur (réception).
// Restaure stock + couches FIFO + dette fournisseur, et refuse tout cas déjà
// consommé/retourné/réglé ou issu d'un bon de commande.
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
  cancelStockIntakeAtomic,
  getStockIntakeDetail,
  receiveStockAtomic,
} from "../../electron/ipc/handlers/inventory.repo";

const NOW = "2026-10-26T10:00:00.000Z";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "intake-cancel.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  return db;
}

function seed(db: DatabaseSync): { pid: number; supplierId: number } {
  db.prepare(
    `INSERT INTO suppliers (uuid, code, name, created_at, updated_at) VALUES ('sup-1', 'SUP-1', 'Fournisseur Test', ?, ?)`,
  ).run(NOW, NOW);
  const supplierId = Number(
    (db.prepare("SELECT id FROM suppliers WHERE uuid = 'sup-1'").get() as { id: number }).id,
  );
  db.prepare(
    `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at)
     VALUES ('p-intake', 'Sucre 50kg', 'PIECE', 0, 12000, 0, 0, 'out_of_stock', 1, ?, ?)`,
  ).run(NOW, NOW);
  const pid = Number(
    (db.prepare("SELECT id FROM products WHERE uuid = 'p-intake'").get() as { id: number }).id,
  );
  return { pid, supplierId };
}

function receive(
  pid: number,
  supplierId: number | null,
  op: string,
  invoice = `FAC-${op}`,
): { intakeId: number } {
  return receiveStockAtomic({
    supplierId,
    invoiceNumber: invoice,
    invoiceDate: "2026-10-26",
    shippingMinor: 0,
    notes: null,
    lines: [
      {
        productId: pid,
        productName: "Sucre 50kg",
        quantityReceived: 5,
        quantityDamaged: 0,
        purchasePriceMinor: 1000,
        sellingPriceMinor: null,
      },
    ],
    operationId: op,
    now: NOW,
  });
}

describe("Annulation facture fournisseur (ADR-139)", () => {
  let tmp: string;
  let db: DatabaseSync;
  let pid: number;
  let supplierId: number;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-intake-cancel-"));
    db = openMigrated(tmp);
    repoDb.current = db;
    repoDb.depth = 0;
    ({ pid, supplierId } = seed(db));
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

  it("annule une réception intacte : stock, couche, dette, statut et mouvement", () => {
    const { intakeId } = receive(pid, supplierId, "intake-1");
    const detail = getStockIntakeDetail(intakeId);
    expect(detail.canCancel).toBe(true);
    expect(detail.items[0]).toMatchObject({
      product_id: pid,
      quantity_received: 5,
      quantity_net: 5,
      purchase_price_minor: 1000,
    });
    expect(
      (
        db
          .prepare("SELECT outstanding_balance_minor FROM suppliers WHERE id = ?")
          .get(supplierId) as {
          outstanding_balance_minor: number;
        }
      ).outstanding_balance_minor,
    ).toBe(5000);

    cancelStockIntakeAtomic({
      id: intakeId,
      now: NOW,
      operationId: "cancel-intake-1",
      staffUserId: null,
    });

    expect(
      (db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as { quantity: number })
        .quantity,
    ).toBe(0);
    expect(
      (
        db
          .prepare("SELECT remaining_quantity FROM inventory_layers WHERE stock_intake_id = ?")
          .all(intakeId) as { remaining_quantity: number }[]
      ).every((l) => Number(l.remaining_quantity) === 0),
    ).toBe(true);
    expect(
      (
        db
          .prepare("SELECT outstanding_balance_minor FROM suppliers WHERE id = ?")
          .get(supplierId) as {
          outstanding_balance_minor: number;
        }
      ).outstanding_balance_minor,
    ).toBe(0);
    expect(
      (
        db.prepare("SELECT status FROM stock_intakes WHERE id = ?").get(intakeId) as {
          status: string;
        }
      ).status,
    ).toBe("cancelled");
    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM stock_movements WHERE related_entity_type = 'intake_cancel' AND related_entity_id = ?",
          )
          .get(String(intakeId)) as { n: number }
      ).n,
    ).toBe(1);
    expect(getStockIntakeDetail(intakeId).canCancel).toBe(false);
  });

  it("rejouer le même operationId ne retire pas le stock deux fois", () => {
    const { intakeId } = receive(pid, supplierId, "intake-idem");
    const op = "cancel-intake-idem";
    cancelStockIntakeAtomic({ id: intakeId, now: NOW, operationId: op, staffUserId: null });
    cancelStockIntakeAtomic({ id: intakeId, now: NOW, operationId: op, staffUserId: null });
    expect(
      (db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as { quantity: number })
        .quantity,
    ).toBe(0);
  });

  it("refuse une réception dont le stock a été consommé", () => {
    const { intakeId } = receive(pid, supplierId, "intake-consumed");
    // Simule une vente : une couche n'est plus intacte.
    db.prepare(
      "UPDATE inventory_layers SET remaining_quantity = remaining_quantity - 2 WHERE stock_intake_id = ?",
    ).run(intakeId);
    expect(() =>
      cancelStockIntakeAtomic({
        id: intakeId,
        now: NOW,
        operationId: "cancel-intake-consumed",
        staffUserId: null,
      }),
    ).toThrow(/consommé/i);
  });

  it("refuse une réception avec retour fournisseur vivant", () => {
    const { intakeId } = receive(pid, supplierId, "intake-return");
    db.prepare(
      `INSERT INTO supplier_returns (uuid, return_number, stock_intake_id, intake_invoice_number, supplier_id, total_return_value_minor, status, created_at, updated_at)
       VALUES ('sret-1', 'RET-F-1', ?, 'FAC-intake-return', ?, 1000, 'validated', ?, ?)`,
    ).run(intakeId, supplierId, NOW, NOW);
    expect(() =>
      cancelStockIntakeAtomic({
        id: intakeId,
        now: NOW,
        operationId: "cancel-intake-return",
        staffUserId: null,
      }),
    ).toThrow(/retours fournisseur/i);
  });

  it("refuse une facture déjà réglée (solde fournisseur insuffisant)", () => {
    const { intakeId } = receive(pid, supplierId, "intake-paid");
    db.prepare("UPDATE suppliers SET outstanding_balance_minor = 0 WHERE id = ?").run(supplierId);
    expect(() =>
      cancelStockIntakeAtomic({
        id: intakeId,
        now: NOW,
        operationId: "cancel-intake-paid",
        staffUserId: null,
      }),
    ).toThrow(/réglée/i);
  });

  it("refuse une réception issue d'un bon de commande réceptionné", () => {
    const { intakeId } = receive(pid, supplierId, "intake-po", "CMD-2026-00001");
    db.prepare(
      `INSERT INTO purchase_orders (uuid, order_number, supplier_id, status, subtotal_minor, total_minor, created_at, updated_at)
       VALUES ('po-1', 'CMD-2026-00001', ?, 'received', 5000, 5000, ?, ?)`,
    ).run(supplierId, NOW, NOW);
    expect(() =>
      cancelStockIntakeAtomic({
        id: intakeId,
        now: NOW,
        operationId: "cancel-intake-po",
        staffUserId: null,
      }),
    ).toThrow(/bon de commande/i);
  });

  it("restitue le stock sans toucher à la dette si la réception est sans fournisseur", () => {
    const { intakeId } = receive(pid, null, "intake-cash");
    cancelStockIntakeAtomic({
      id: intakeId,
      now: NOW,
      operationId: "cancel-intake-cash",
      staffUserId: null,
    });
    expect(
      (db.prepare("SELECT quantity FROM products WHERE id = ?").get(pid) as { quantity: number })
        .quantity,
    ).toBe(0);
  });
});
