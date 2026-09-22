// Veloria PoS — Tests P3-c : bons de commande (domaine + miroir atomicité).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertPoTransition,
  computePoTotals,
  poStatusLabelFr,
} from "@/domain/suppliers/po-rules.ts";

describe("P3-c : po-rules", () => {
  it("totaux + transitions + libellés FR", () => {
    const t = computePoTotals([
      { productName: "Farine", quantityOrdered: 10, unitCostMinor: 5000 },
      { productName: "Sucre", quantityOrdered: 2.5, unitCostMinor: 12000 },
    ]);
    expect(t).toEqual({ subtotalMinor: 80000, totalMinor: 80000 });
    expect(() => assertPoTransition("draft", "ordered")).not.toThrow();
    expect(() => assertPoTransition("draft", "received")).toThrow("interdite");
    expect(() => assertPoTransition("received", "cancelled")).toThrow("interdite");
    expect(poStatusLabelFr("partially_received")).toBe("Partiellement reçue");
    expect(poStatusLabelFr("nope")).toBe("—");
    expect(() => computePoTotals([])).toThrow("vide");
  });
});

describe("P3-c : réception bornée + rejouable (miroir)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-po-"));
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

  it("réception au-delà du commandé refusée, retry idempotent", () => {
    const db = new DatabaseSync(path.join(tmp, "po.sqlite"));
    try {
      db.exec(`CREATE TABLE purchase_order_items (id INTEGER PRIMARY KEY, qty_ordered NUMERIC NOT NULL, qty_received NUMERIC NOT NULL DEFAULT 0);
        CREATE TABLE idempotency_keys (operation_id TEXT PRIMARY KEY, op_type TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
        INSERT INTO purchase_order_items (id, qty_ordered, qty_received) VALUES (1, 10, 4);`);
      const op = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
      const receive = (itemId: number, qty: number): { received: number } => {
        const hit = db
          .prepare("SELECT result_json FROM idempotency_keys WHERE operation_id = ?")
          .get(op) as { result_json: string } | undefined;
        if (hit && hit.result_json !== "{}")
          return JSON.parse(hit.result_json) as { received: number };
        const it = db
          .prepare(
            "SELECT qty_ordered AS o, qty_received AS r FROM purchase_order_items WHERE id = ?",
          )
          .get(itemId) as { o: number; r: number } | undefined;
        if (!it) throw new Error("Ligne introuvable.");
        if (!(qty > 0) || qty + it.r > it.o + 1e-9) throw new Error("Quantité reçue invalide.");
        db.exec("BEGIN;");
        try {
          db.prepare(
            "INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, 'purchase.receive', '{}', ?)",
          ).run(op, "2026-09-20T00:00:00.000Z");
          db.prepare(
            "UPDATE purchase_order_items SET qty_received = qty_received + ? WHERE id = ?",
          ).run(qty, itemId);
          const out = { received: it.r + qty };
          db.prepare("UPDATE idempotency_keys SET result_json = ? WHERE operation_id = ?").run(
            JSON.stringify(out),
            op,
          );
          db.exec("COMMIT;");
          return out;
        } catch {
          db.exec("ROLLBACK;");
          throw new Error("Échec simulé.");
        }
      };
      expect(() => receive(1, 7)).toThrow("invalide");
      expect(receive(1, 5)).toEqual({ received: 9 });
      expect(receive(1, 5)).toEqual({ received: 9 });
      const row = db
        .prepare("SELECT qty_received AS r FROM purchase_order_items WHERE id = 1")
        .get() as { r: number };
      expect(row.r).toBe(9);
    } finally {
      db.close();
    }
  });
});
