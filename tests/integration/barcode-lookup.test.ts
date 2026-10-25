// Veloria PoS — Codes-barres alphanumériques : la saisie/le scan ignore la
// casse (étiquettes Code 39 imprimées en majuscules, fiche parfois minuscule),
// et la correspondance à casse identique garde la priorité.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const db = (repoDb as { current: unknown }).current;
    if (!db) throw new Error("Base de test non ouverte.");
    return db;
  },
}));

vi.mock("../../electron/services/logger", () => ({
  log: () => {},
  initLogger: () => "",
  getLogFile: () => "",
}));

import { getProductByBarcode, searchProducts } from "../../electron/ipc/handlers/products.repo";

const NOW = "2026-10-25T10:00:00.000Z";

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "barcode-lookup.sqlite"));
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

function seedProduct(db: DatabaseSync, uuid: string, name: string, barcode: string): number {
  const ins = db
    .prepare(
      `INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, is_active, created_at, updated_at)
       VALUES (?, ?, 'PIECE', 1000, 2000, 5, 0, 'in_stock', 1, ?, ?)`,
    )
    .run(uuid, name, NOW, NOW);
  const pid = Number(ins.lastInsertRowid);
  db.prepare(
    `INSERT INTO product_barcodes (product_id, barcode, is_primary, created_at) VALUES (?, ?, 1, ?)`,
  ).run(pid, barcode, NOW);
  return pid;
}

describe("Recherche code-barres insensible à la casse", () => {
  let tmp: string;
  let db: DatabaseSync;
  let pid: number;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-barcode-"));
    db = openMigrated(tmp);
    (repoDb as { current: unknown }).current = db;
    pid = seedProduct(db, "p-letter", "Produit lettré", "abc-123");
  });

  afterEach(() => {
    (repoDb as { current: unknown }).current = null;
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("un scan en majuscules retrouve un code stocké en minuscules", () => {
    const hit = getProductByBarcode("ABC-123");
    expect(hit?.id).toBe(pid);
    expect(hit?.primary_barcode).toBe("abc-123");
  });

  it("la recherche texte (liste caisse) retrouve aussi le code à toute casse", () => {
    const res = searchProducts({ query: "ABC-123", page: 1, pageSize: 12 });
    expect(res.total).toBe(1);
    expect(res.rows[0]?.id).toBe(pid);
  });

  it("à casse identique, la fiche exacte garde la priorité", () => {
    const exact = seedProduct(db, "p-case", "Produit casse exacte", "ABC-123");
    expect(getProductByBarcode("ABC-123")?.id).toBe(exact);
    expect(getProductByBarcode("abc-123")?.id).toBe(pid);
  });

  it("les codes à symboles restent exacts (aucune fausse correspondance)", () => {
    seedProduct(db, "p-symbol", "Produit symbole", "AB/CD-12");
    expect(getProductByBarcode("AB/CD-12")?.uuid).toBe("p-symbol");
    expect(getProductByBarcode("AB-CD-12")).toBeNull();
  });
});
