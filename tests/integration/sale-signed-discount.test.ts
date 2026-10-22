// Veloria PoS — Intégration : vente du panier MIXTE avec majoration + montant
// facturé exact (régression des bugs caisse du 2026-10-21, §23 handoff).
//
// AVANT : une ligne facturée au-dessus de son prix d'origine (majoration)
// produisait une remise NÉGATIVE ⇒ la base refusait la vente :
//   « CHECK constraint failed: discount_amount_minor >= 0 »
// ⇒ rollback total + message générique à l'écran (« Une erreur inattendue
// est survenue »). C'est l'erreur que le propriétaire a vue 7 fois dans le
// journal du 2026-10-21 (canal `sales.create`).
//
// Repos RÉELS sur base migrée temporaire (node:sqlite), comme
// `sale-discount-type-guard.test.ts`.
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

import { createSaleAtomic, type CreateSaleInput } from "../../electron/ipc/handlers/sales.repo";
import { priceLine } from "../../electron/ipc/money-guard.ts";

const NOW = "2026-10-22T08:00:00.000Z";

function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "signed.sqlite"));
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

interface Line {
  productId: number | null;
  productName: string;
  unitCode: string;
  originalUnitPriceMinor: number;
  unitPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
  billedTotalMinor?: number | null;
}

/** Panier mixte : article libre + poids (montant saisi) + catalogue + remise + majoration. */
const MIXED: Line[] = [
  {
    productId: null,
    productName: "Sachet plastique",
    unitCode: "PIECE",
    originalUnitPriceMinor: 10000,
    unitPriceMinor: 10000,
    purchasePriceMinor: 0,
    quantity: 1,
  },
  {
    productId: null,
    productName: "Bil au KG (montant saisi)",
    unitCode: "KG",
    originalUnitPriceMinor: 70000,
    unitPriceMinor: 70000,
    purchasePriceMinor: 43000,
    quantity: 0.071,
    billedTotalMinor: 5000,
  },
  {
    productId: null,
    productName: "Sucre (remise)",
    unitCode: "PIECE",
    originalUnitPriceMinor: 5000,
    unitPriceMinor: 4000,
    purchasePriceMinor: 3000,
    quantity: 1,
  },
  {
    productId: null,
    productName: "Karan (majoration)",
    unitCode: "PIECE",
    originalUnitPriceMinor: 500,
    unitPriceMinor: 50000,
    purchasePriceMinor: 0,
    quantity: 1,
  },
];

function saleInput(lines: Line[], over: Record<string, unknown> = {}): CreateSaleInput {
  const priced = lines.map((l) => {
    const p = priceLine({
      unitPriceMinor: l.unitPriceMinor,
      originalUnitPriceMinor: l.originalUnitPriceMinor,
      quantity: l.quantity,
      billedTotalMinor: l.billedTotalMinor ?? null,
    });
    return { line: l, ...p };
  });
  const subtotal = priced.reduce((a, p) => a + p.original, 0);
  const discountAmount = priced.reduce((a, p) => a + p.discount, 0);
  const total = subtotal - discountAmount + 0;
  return {
    operationId: "11111111-1111-4111-8111-111111111111",
    uuid: "22222222-2222-4222-8222-222222222222",
    invoiceNumber: "",
    customerId: null,
    limitOverrideApproved: false,
    subtotalMinor: subtotal,
    discountType: "none",
    discountValueMinor: 0,
    discountAmountMinor: discountAmount,
    deliveryFeeMinor: 0,
    totalMinor: total,
    amountPaidMinor: total,
    remainingMinor: 0,
    paymentStatus: "paid",
    paymentMethod: "cash",
    dueDate: null,
    lines: lines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      unitCode: l.unitCode,
      originalUnitPriceMinor: l.originalUnitPriceMinor,
      unitPriceMinor: l.unitPriceMinor,
      purchasePriceMinor: l.purchasePriceMinor,
      quantity: l.quantity,
      billedTotalMinor: l.billedTotalMinor ?? null,
    })),
    lineTotals: priced.map((p) => p.charged),
    now: NOW,
    allowNegativeStock: false,
    ...over,
  };
}

describe("vente MIXTE : majoration + montant exact (régression 2026-10-21)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-signed-"));
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

  it("la vente passe : remise signée + montant facturé exact", () => {
    const res = createSaleAtomic(saleInput(MIXED));
    const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(res.saleId) as {
      subtotal_minor: number;
      discount_amount_minor: number;
      total_minor: number;
      amount_paid_minor: number;
      remaining_balance_minor: number;
    };
    // sous-total = 10000 + 4970 + 5000 + 500 = 20470
    expect(sale.subtotal_minor).toBe(20470);
    // remise = 0 + (4970-5000) + 1000 + (500-50000) = -48530
    expect(sale.discount_amount_minor).toBe(-48530);
    // total = Σ facturé = 10000 + 5000 + 4000 + 50000 = 69000
    expect(sale.total_minor).toBe(69000);
    expect(sale.amount_paid_minor).toBe(69000);
    expect(sale.remaining_balance_minor).toBe(0);

    const items = db
      .prepare(
        "SELECT product_name_snapshot, line_total_minor, discount_minor FROM sale_items WHERE sale_id = ? ORDER BY id",
      )
      .all(res.saleId) as {
      product_name_snapshot: string;
      line_total_minor: number;
      discount_minor: number;
    }[];
    expect(items).toHaveLength(4);
    // Le montant SAISI est facturé tel quel (50,00 DZD, pas 49,70).
    expect(items[1]?.line_total_minor).toBe(5000);
    // La majoration porte une remise NÉGATIVE (tracée).
    expect(items[3]?.discount_minor).toBe(-49500);
  });

  it("montant facturé incohérent (gonflement) → refus FR, aucune vente", () => {
    const lines: Line[] = [
      {
        productId: null,
        productName: "Gonflé",
        unitCode: "KG",
        originalUnitPriceMinor: 70000,
        unitPriceMinor: 70000,
        purchasePriceMinor: 0,
        quantity: 0.071,
        billedTotalMinor: 90000,
      },
    ];
    let msg = "";
    try {
      createSaleAtomic(saleInput(lines));
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/Montant facturé de ligne incohérent/);
    // Message FR (jamais un CHECK SQL brut) + rollback complet.
    expect(msg).not.toMatch(/CHECK constraint/i);
    expect((db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number }).c).toBe(0);
  });

  it("prix d'origine négatif → refus FR avant toute écriture", () => {
    const lines: Line[] = [
      {
        productId: null,
        productName: "Prix invalide",
        unitCode: "PIECE",
        originalUnitPriceMinor: -1,
        unitPriceMinor: 100,
        purchasePriceMinor: 0,
        quantity: 1,
      },
    ];
    expect(() => createSaleAtomic(saleInput(lines))).toThrow(/Prix d'origine invalide/);
    expect((db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number }).c).toBe(0);
  });
});
