// Veloria PoS — Code-barres carton (Phase 3 d'ADR-136) : la liaison code ↔
// conditionnement, la lecture au scan et l'enchaînement caisse → stock → retour.
// Le carton garde sa vérité dans `product_packagings` : le code ne porte ni le
// facteur ni le prix.
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
              /* déjà annulée */
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
  createProduct,
  getProductBarcodes,
  getProductByBarcode,
  updateProduct,
} from "../../electron/ipc/handlers/products.repo";
import {
  deleteProductPackagingAtomic,
  saveProductPackagingAtomic,
} from "../../electron/ipc/handlers/packagings.repo";
import { createSaleAtomic } from "../../electron/ipc/handlers/sales.repo";
import { createReturnAtomic } from "../../electron/ipc/handlers/returns.repo";
import { buildSalePayload, type CartLine } from "@/application/sales/create-sale.ts";
import { cartonScanUnits } from "@domain/packaging/carton-barcodes.ts";

const NOW = "2026-10-27T10:00:00.000Z";
const CARTON_CODE = "CARTON16";
const PIECE_CODE = "6191000000016";
/** Jben : 1 000 centimes la pièce, carton de 16 facturé 15 000 (150 DZD). */
const PIECE_PRICE = 1_000;
const PIECE_COST = 844;
const FACTOR = 16;
const CARTON_PRICE = 15_000;

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "carton-barcode.sqlite"));
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

function state(): { current: unknown; depth: number } {
  return repoDb;
}

let productId = 0;

function createJben(opSuffix: string): number {
  return createProduct({
    uuid: `p-${opSuffix}`,
    operationId: `9fffffff-ffff-4fff-8fff-${opSuffix.repeat(4)}`,
    name: "Jben",
    categoryId: null,
    unitCode: "PIECE",
    purchasePriceMinor: PIECE_COST,
    sellingPriceMinor: PIECE_PRICE,
    quantity: 100,
    minStockLevel: 0,
    maxStockLevel: 0,
    expirationDate: null,
    supplierId: null,
    barcodes: [PIECE_CODE, CARTON_CODE],
    now: NOW,
  });
}

function savePackaging(operationId: string, over: Record<string, unknown> = {}): number {
  return saveProductPackagingAtomic({
    operationId,
    productId,
    labelFr: "Carton ×16",
    factor: FACTOR,
    sellingPriceMinor: CARTON_PRICE,
    purchasePriceMinor: PIECE_COST * FACTOR,
    autoCartonPricing: true,
    cartonBarcodes: [CARTON_CODE],
    now: NOW,
    ...over,
  }).id;
}

/** Ligne telle que la caisse la construit après un scan du code carton. */
function scannedCartonLine(): CartLine {
  const row = scanRow(CARTON_CODE);
  const units = cartonScanUnits({
    barcodePackagingId: row["barcode_packaging_id"] as number | null,
    packagingFactor: row["packaging_factor"] as number | null,
  });
  return {
    key: "l-scan",
    productId,
    productName: "Jben",
    unitCode: "PIECE",
    originalUnitPriceMinor: PIECE_PRICE,
    unitPriceMinor: PIECE_PRICE,
    purchasePriceMinor: PIECE_COST,
    // La quantité caisse reste en unités de base : un scan = un carton.
    quantity: units,
    stockQty: 100,
    packagingId: Number(row["packaging_id"]),
    packagingLabelFr: "Carton ×16",
    packagingFactor: FACTOR,
    packagingSellingPriceMinor: CARTON_PRICE,
    packagingAutoCartonPricing: Number(row["packaging_auto_carton_pricing"]) === 1,
    packagingPriceOverridden: false,
  };
}

function sellCartons(count: number): ReturnType<typeof createSaleAtomic> {
  const line = scannedCartonLine();
  const payload = buildSalePayload({
    lines: [{ ...line, quantity: line.quantity * count }],
    deliveryFeeMinor: 0,
    amountPaidMinor: CARTON_PRICE * count,
    customerId: null,
    paymentMethod: "cash",
    operationId: `33333333-3333-4333-8333-${String(count).padStart(4, "0")}`,
  });
  return createSaleAtomic({
    operationId: payload.operationId,
    uuid: `s-${count}`,
    invoiceNumber: `FAC-2026-0000${count}`,
    customerId: null,
    subtotalMinor: payload.totals.subtotalMinor,
    discountType: "none",
    discountValueMinor: 0,
    discountAmountMinor: payload.totals.discountAmountMinor,
    deliveryFeeMinor: 0,
    totalMinor: payload.totals.totalMinor,
    amountPaidMinor: CARTON_PRICE * count,
    remainingMinor: payload.totals.remainingMinor,
    paymentStatus: payload.totals.paymentStatus,
    paymentMethod: "cash",
    dueDate: null,
    lines: payload.lines,
    lineTotals: payload.totals.lineTotalsMinor,
    now: NOW,
    allowNegativeStock: false,
  });
}

function stock(): number {
  return Number(
    (
      db.prepare("SELECT quantity FROM products WHERE id = ?").get(productId) as {
        quantity: number;
      }
    ).quantity,
  );
}

/** Ligne de `products.getByBarcode` lue comme une trame IPC (clés dynamiques). */
function scanRow(barcode: string): Record<string, unknown> {
  return getProductByBarcode(barcode) as unknown as Record<string, unknown>;
}

let tmp = "";
let db: DatabaseSync;

describe("Code-barres carton (liaison scan)", () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-carton-barcode-"));
    db = openMigrated(tmp);
    state().current = db;
    state().depth = 0;
    productId = createJben("0001");
  });

  afterEach(() => {
    state().current = null;
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("pose la liaison sur le seul code de carton et la laisse absente sur le code pièce", () => {
    const packagingId = savePackaging("44444444-4444-4444-8444-000000000001");

    const carton = scanRow(CARTON_CODE);
    expect(carton["barcode_packaging_id"]).toBe(packagingId);
    expect(carton["packaging_factor"]).toBe(FACTOR);
    // Douchette sans Verr. Maj : la liaison suit la correspondance insensible.
    expect(scanRow("carton16")["barcode_packaging_id"]).toBe(packagingId);

    const piece = scanRow(PIECE_CODE);
    expect(piece["barcode_packaging_id"]).toBeNull();

    const rows = getProductBarcodes(productId) as {
      barcode: string;
      packaging_id: number | null;
    }[];
    expect(rows.find((r) => r.barcode === CARTON_CODE)?.packaging_id).toBe(packagingId);
    expect(rows.find((r) => r.barcode === PIECE_CODE)?.packaging_id).toBeNull();
  });

  it("refuse un code inconnu, un code d'un autre produit et un carton sans tarif auto", () => {
    const other = createProduct({
      uuid: "p-other",
      operationId: "9fffffff-ffff-4fff-8fff-0002",
      name: "Lait",
      categoryId: null,
      unitCode: "PIECE",
      purchasePriceMinor: 100,
      sellingPriceMinor: 200,
      quantity: 10,
      minStockLevel: 0,
      maxStockLevel: 0,
      expirationDate: null,
      supplierId: null,
      barcodes: ["LAIT-CARTON"],
      now: NOW,
    });
    expect(() =>
      savePackaging("44444444-4444-4444-8444-000000000002", { cartonBarcodes: ["INCONNU"] }),
    ).toThrow(/introuvable/);
    expect(() =>
      savePackaging("44444444-4444-4444-8444-000000000003", { cartonBarcodes: ["LAIT-CARTON"] }),
    ).toThrow(/autre produit/);
    expect(
      (getProductBarcodes(other) as { packaging_id: number | null }[])[0]?.packaging_id,
    ).toBeNull();
    expect(() =>
      savePackaging("44444444-4444-4444-8444-000000000004", { autoCartonPricing: false }),
    ).toThrow(/tarif carton automatique/);
  });

  it("rejoue le même operationId sans dupliquer et réécrit la liste à chaque save", () => {
    const op = "44444444-4444-4444-8444-000000000005";
    const first = savePackaging(op);
    expect(savePackaging(op)).toBe(first);
    const rows = db
      .prepare("SELECT id FROM product_packagings WHERE product_id = ?")
      .all(productId) as { id: number }[];
    expect(rows).toHaveLength(1);

    // Relié au nouveau code : l'ancienne liaison est retirée (liste exacte).
    db.prepare("UPDATE product_barcodes SET barcode = ? WHERE barcode = ?").run(
      "JB-CARTON2",
      CARTON_CODE,
    );
    savePackaging("44444444-4444-4444-8444-000000000006", { cartonBarcodes: ["JB-CARTON2"] });
    const links = (
      getProductBarcodes(productId) as { barcode: string; packaging_id: number }[]
    ).map((r) => r.barcode);
    expect(links).toEqual(["6191000000016", "JB-CARTON2"]);
    expect(scanRow("JB-CARTON2")["barcode_packaging_id"]).toBe(first);
  });

  it("conserve la liaison quand la fiche réécrit ses codes, la coupe à la suppression", () => {
    savePackaging("44444444-4444-4444-8444-000000000007");
    updateProduct({
      id: productId,
      name: "Jben",
      categoryId: null,
      unitCode: "PIECE",
      purchasePriceMinor: PIECE_COST,
      sellingPriceMinor: PIECE_PRICE,
      quantity: 100,
      minStockLevel: 0,
      maxStockLevel: 0,
      expirationDate: null,
      supplierId: null,
      barcodes: [PIECE_CODE, CARTON_CODE],
      now: NOW,
    });
    expect(scanRow(CARTON_CODE)["barcode_packaging_id"]).not.toBeNull();

    deleteProductPackagingAtomic({
      operationId: "44444444-4444-4444-8444-000000000008",
      productId,
      now: NOW,
    });
    expect(scanRow(CARTON_CODE)["barcode_packaging_id"]).toBeNull();
    expect(stock()).toBe(100);
  });

  it("scanne un carton : 150 DZD exacts, 16 pièces sorties, puis le retour rend 16 pièces", () => {
    savePackaging("44444444-4444-4444-8444-000000000009");
    const sale = sellCartons(1);

    const items = db
      .prepare(
        "SELECT quantity, unit_factor, packaging_id, unit_price_minor, line_total_minor, unit_code FROM sale_items ORDER BY id",
      )
      .all() as {
      quantity: number;
      unit_factor: number;
      packaging_id: number | null;
      unit_price_minor: number;
      line_total_minor: number;
      unit_code: string;
    }[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      quantity: 1,
      unit_factor: FACTOR,
      unit_price_minor: CARTON_PRICE,
      line_total_minor: CARTON_PRICE,
    });
    // Le ticket garde le libellé du conditionnement, pas « PIÈCE × 16 ».
    expect(items[0]?.unit_code).toBe("Carton ×16");
    expect(stock()).toBe(100 - FACTOR);

    const layer = db
      .prepare("SELECT remaining_quantity FROM inventory_layers WHERE product_id = ?")
      .get(productId) as { remaining_quantity: number };
    expect(Number(layer.remaining_quantity)).toBe(100 - FACTOR);

    const returned = createReturnAtomic({
      operationId: "55555555-5555-4555-8555-000000000001",
      originalSaleId: sale.saleId,
      // Le scan du code carton dans le retour vise la ligne carton (1 unité).
      items: [{ productId, quantity: 1, restocked: true, condition: "good", unitFactor: FACTOR }],
      refundMinor: CARTON_PRICE,
      refundMethod: "cash",
      reason: "Carton invendu",
      notes: null,
      createdAt: NOW,
      now: NOW,
    });
    expect(returned.totalReturnMinor).toBe(CARTON_PRICE);
    expect(stock()).toBe(100);
  });

  it("deux cartons scannés facturent 300 DZD et sortent 32 pièces", () => {
    savePackaging("44444444-4444-4444-8444-000000000010");
    sellCartons(2);
    const total = db
      .prepare("SELECT COALESCE(SUM(line_total_minor),0) AS t FROM sale_items")
      .get() as { t: number };
    expect(Number(total.t)).toBe(2 * CARTON_PRICE);
    expect(stock()).toBe(100 - 2 * FACTOR);
  });
});
