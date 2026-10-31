// Veloria — file miroir APK : le détail d'une facture part à la vente/paiement.
// Régression : `sales.create` ne poussait que les trois clichés de listes, donc
// toute facture créée après l'activation restait sans `invoice_detail` dans le
// miroir et l'APK affichait « Détail indisponible » (404).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const demoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const raw = demoDb.current;
    if (!raw) throw new Error("Base de test non ouverte.");
    // better-sqlite3 expose `transaction(fn)` ; node:sqlite non — shim minimal
    // BEGIN/COMMIT/ROLLBACK pour exercer le vrai service de file.
    return {
      prepare: (sql: string) => raw.prepare(sql),
      exec: (sql: string) => raw.exec(sql),
      transaction: (fn: () => unknown) => () => {
        raw.exec("BEGIN");
        try {
          const result = fn();
          raw.exec("COMMIT");
          return result;
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

import {
  enqueueAnnouncementRefresh,
  enqueueInvoiceDetailRefresh,
  enqueueSaleRefresh,
} from "../../electron/sync/sync.service";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "sync-queue.sqlite"));
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

interface QueueRow {
  kind: string;
  status: string;
  saleId: number | null;
}

function queueRows(db: DatabaseSync): QueueRow[] {
  return db
    .prepare(
      `SELECT kind, status, json_extract(payload_json, '$.sale.id') AS saleId
       FROM sync_outbox WHERE customer_id = 1 ORDER BY id ASC`,
    )
    .all() as unknown as QueueRow[];
}

function seed(db: DatabaseSync): number {
  db.prepare(
    "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('csync','Karim','Ziani','karim ziani',1,'2026-01-01','2026-01-01')",
  ).run();
  db.prepare(
    "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, created_at, updated_at) VALUES (1, 'ph', 'pin', '2026-01-01', '2026-01-01')",
  ).run();
  db.prepare(
    `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, is_cancelled, created_at, updated_at)
     VALUES ('s-sync', 'FAC-2026-9001', 1, 9000, 9000, 0, 9000, 'unpaid', 0, '2026-01-05', '2026-01-05')`,
  ).run();
  const saleId = (db.prepare("SELECT id FROM sales WHERE uuid = 's-sync'").get() as { id: number })
    .id;
  db.prepare(
    `INSERT INTO sale_items (sale_id, product_name_snapshot, unit_code, unit_price_minor, purchase_price_minor, quantity, line_total_minor)
     VALUES (?, 'Sucre 1kg', 'PIECE', 9000, 0, 1, 9000)`,
  ).run(saleId);
  return saleId;
}

/** Deuxième client actif (aucune vente) pour l'annonce magasin. */
function seedSecondCustomer(db: DatabaseSync): number {
  db.prepare(
    "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('csync2','Sara','Merah','sara merah',1,'2026-01-01','2026-01-01')",
  ).run();
  const id = (db.prepare("SELECT id FROM customers WHERE uuid = 'csync2'").get() as { id: number })
    .id;
  db.prepare(
    "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, created_at, updated_at) VALUES (?, 'ph2', 'pin2', '2026-01-01', '2026-01-01')",
  ).run(id);
  return id;
}

describe("file miroir : détail de facture", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-sync-queue-"));
    db = openMigrated(tmp);
    demoDb.current = db;
  });
  afterEach(() => {
    demoDb.current = null;
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("une vente rafraîchit les listes ET pousse le détail", () => {
    const saleId = seed(db);
    enqueueSaleRefresh(saleId);
    const rows = queueRows(db);
    expect(rows.map((r) => r.kind)).toEqual([
      "customer_snapshot",
      "invoice_list",
      "payment_list",
      "invoice_detail",
    ]);
    expect(rows[3]).toMatchObject({ status: "pending", saleId });
  });

  it("le détail seul ne duplique pas les trois listes (ventilation FIFO)", () => {
    const saleId = seed(db);
    enqueueInvoiceDetailRefresh(saleId);
    expect(queueRows(db).map((r) => r.kind)).toEqual(["invoice_detail"]);
    expect(queueRows(db)[0]).toMatchObject({ saleId });
  });

  it("accès révoqué = aucun nouveau cliché", () => {
    const saleId = seed(db);
    db.prepare(`UPDATE customer_access SET revoked_at = '2026-01-06' WHERE customer_id = 1`).run();
    enqueueSaleRefresh(saleId);
    enqueueInvoiceDetailRefresh(saleId);
    expect(queueRows(db)).toHaveLength(0);
  });

  it("annonce magasin : un snapshot par accès ACTIF, annonce incluse", () => {
    seed(db);
    const second = seedSecondCustomer(db);
    db.prepare(
      "INSERT INTO announcements (text, is_active, created_at) VALUES ('Promo test', 1, '2026-01-06')",
    ).run();

    enqueueAnnouncementRefresh();
    const snapshots = db
      .prepare(
        `SELECT customer_id, json_extract(payload_json, '$.announcement') AS announcement
         FROM sync_outbox WHERE kind = 'customer_snapshot' ORDER BY customer_id ASC`,
      )
      .all() as unknown as { customer_id: number; announcement: string }[];
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((s) => s.customer_id)).toEqual([1, second]);
    for (const row of snapshots) expect(row.announcement).toBe("Promo test");

    // Un accès révoqué ne reçoit plus de cliché d'annonce.
    db.prepare(`UPDATE customer_access SET revoked_at = '2026-01-07' WHERE customer_id = ?`).run(
      second,
    );
    enqueueAnnouncementRefresh();
    const after = db
      .prepare(
        `SELECT customer_id FROM sync_outbox WHERE kind = 'customer_snapshot' ORDER BY id ASC`,
      )
      .all() as unknown as { customer_id: number }[];
    expect(after).toHaveLength(3);
    expect(after.filter((r) => r.customer_id === second)).toHaveLength(1);
  });
});
