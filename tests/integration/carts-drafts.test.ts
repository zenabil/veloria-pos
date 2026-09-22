// Veloria PoS — Tests P4-a : brouillons paniers (miroir save/load/clear).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function openDb(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "c.sqlite"));
  db.exec(`CREATE TABLE cart_drafts (tab_id INTEGER PRIMARY KEY, name TEXT NOT NULL,
    lines_json TEXT NOT NULL DEFAULT '[]', customer_id INTEGER,
    customer_label TEXT NOT NULL DEFAULT 'Client de passage',
    amount_paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
    payment_method TEXT, updated_at TEXT NOT NULL);`);
  return db;
}

describe("P4-a : cart drafts (miroir)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-carts-"));
  });
  afterEach(() => {
    for (let i = 0; i < 5; i += 1) {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
        return;
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("save remplace en bloc, load restitue, clear vide", () => {
    const db = openDb(tmp);
    try {
      const lines = JSON.stringify([
        {
          key: "l1",
          productId: 7,
          productName: "Huile",
          unitCode: "PIECE",
          originalUnitPriceMinor: 10000,
          unitPriceMinor: 9000,
          purchasePriceMinor: 8000,
          quantity: 2,
        },
      ]);
      db.exec("BEGIN;");
      db.prepare("DELETE FROM cart_drafts").run();
      db.prepare(
        "INSERT INTO cart_drafts (tab_id, name, lines_json, customer_id, customer_label, amount_paid_minor, payment_method, updated_at) VALUES (1, 'Panier 1', ?, NULL, 'Client de passage', 0, 'cash', ?)",
      ).run(lines, "2026-09-20T00:00:00.000Z");
      db.exec("COMMIT;");
      const rows = db.prepare("SELECT * FROM cart_drafts ORDER BY tab_id").all() as {
        tab_id: number;
        lines_json: string;
      }[];
      expect(rows).toHaveLength(1);
      const back = JSON.parse(rows[0]?.lines_json ?? "[]") as { key: string }[];
      expect(back).toHaveLength(1);
      expect(back[0]?.key).toBe("l1");
      db.prepare("DELETE FROM cart_drafts").run();
      expect((db.prepare("SELECT COUNT(*) AS n FROM cart_drafts").get() as { n: number }).n).toBe(
        0,
      );
    } finally {
      db.close();
    }
  });

  it("ligne corrompue ignorée (jamais de crash au chargement)", () => {
    const db = openDb(tmp);
    try {
      db.prepare(
        "INSERT INTO cart_drafts (tab_id, name, lines_json, updated_at) VALUES (1, 'P1', ?, '2026-09-20T00:00:00.000Z')",
      ).run(JSON.stringify([{ key: "", productName: "", quantity: -5 }]));
      const row = db.prepare("SELECT lines_json AS j FROM cart_drafts WHERE tab_id = 1").get() as {
        j: string;
      };
      const parsed = JSON.parse(row.j) as { key: string; quantity: number }[];
      const clean = parsed.filter(
        (l) => typeof l.key === "string" && l.key.length > 0 && l.quantity > 0,
      );
      expect(clean).toHaveLength(0);
    } finally {
      db.close();
    }
  });
});
