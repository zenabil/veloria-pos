// ADR-182 — Catalogue client : règles pures + CONTRAT à trois parties.
//
// Le catalogue traverse trois implémentations indépendantes :
//   1. `electron/sync/client-catalog.ts`  (POS → lignes `store_catalog`)
//   2. `cloud/supabase/functions/client-sync` (lecture → `catalog`)
//   3. `mobile/src/views.ts` (`toCatalog` → view-model APK)
//
// Un écart de NOM DE CHAMP entre elles ne casse rien à la compilation : il
// casse à l'exécution (catalogue vide chez le client). Ce test verrouille les
// trois côtés sur le MÊME jeu de colonnes, extrait de la source de vérité
// (le SQL de la table).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CATALOG_MAX_PRICE_MINOR,
  catalogRows,
  catalogVersionOf,
  isAvailable,
  selectPublishedProducts,
  type CatalogSourceProduct,
} from "../../electron/sync/client-catalog.ts";
import { toCatalog, toCatalogProduct } from "../../mobile/src/views.ts";

const ROOT = resolve(__dirname, "../..");

function read(relative: string): string {
  return readFileSync(resolve(ROOT, relative), "utf8");
}

/** Colonnes de la table `store_catalog` (source de vérité : le SQL). */
function sqlColumns(): string[] {
  return sqlColumnLines().map((c) => c.name);
}

/** Colonnes que le PUBLISHEUR doit fournir (NOT NULL sans DEFAULT + PK). */
function sqlRequiredColumns(): string[] {
  return sqlColumnLines()
    .filter((c) => c.required)
    .map((c) => c.name);
}

function sqlColumnLines(): { name: string; hasDefault: boolean; required: boolean }[] {
  const sql = read("cloud/supabase/catalog.sql");
  const block = sql.slice(
    sql.indexOf("CREATE TABLE IF NOT EXISTS public.store_catalog ("),
    sql.indexOf("CREATE INDEX IF NOT EXISTS idx_store_catalog_published"),
  );
  const out: { name: string; hasDefault: boolean; required: boolean }[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("--")) continue;
    const m = /^([a-z_]+)\s+(?:INTEGER|TEXT|BIGINT|TIMESTAMPTZ)\b/.exec(line);
    const column = m?.[1];
    if (m && column !== undefined && column !== "constraint" && column !== "primary") {
      const hasDefault = /\bDEFAULT\b/i.test(line);
      const notNull = /\bNOT NULL\b/i.test(line);
      const isPk = /\bPRIMARY KEY\b/i.test(line);
      out.push({ name: column, hasDefault, required: isPk || (notNull && !hasDefault) });
    }
  }
  return out;
}

/** Colonnes demandées par la fonction Edge (`select("…")`). */
function edgeColumns(): string[] {
  const src = read("cloud/supabase/functions/client-sync/index.ts");
  const m = /from\("store_catalog"\)\s*\.select\(\s*"([^"]+)"/s.exec(src);
  const list = m?.[1];
  if (list === undefined) throw new Error("La fonction Edge ne sélectionne plus store_catalog.");
  return list
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "");
}

/** Clés lues par le mapper de l'APK (`r["…"]`). */
function apkReadKeys(): string[] {
  const src = read("mobile/src/views.ts");
  const start = src.indexOf("export function toCatalogProduct");
  const end = src.indexOf("export function toCatalog(");
  if (start < 0 || end < 0) throw new Error("Mapper catalogue absent de l'APK.");
  const body = src.slice(start, end);
  const out = new Set<string>();
  for (const m of body.matchAll(/r\["([a-z_]+)"\]/g)) {
    const key = m[1];
    if (key !== undefined) out.add(key);
  }
  return [...out];
}

function product(over: Partial<CatalogSourceProduct> = {}): CatalogSourceProduct {
  return {
    id: 1,
    name: "Huile d'olive 1 L",
    categoryId: 2,
    categoryName: "Huiles",
    sellingPriceMinor: 85_000,
    unitCode: "PIECE",
    quantity: 12,
    stockStatus: "in_stock",
    isActive: true,
    ...over,
  };
}

describe("ADR-182 — sélection des produits publiables", () => {
  it("publie un produit actif, priced et hors exclusion", () => {
    const { selected, skipped } = selectPublishedProducts([product()], []);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.name).toBe("Huile d'olive 1 L");
    expect(skipped.excludedCategory).toBe(0);
    expect(skipped.invalidPrice).toBe(0);
  });

  it("écarte le produit archivé et le COMPTE (jamais muet)", () => {
    const { selected, skipped } = selectPublishedProducts(
      [product({ isActive: false }), product({ id: 2 })],
      [],
    );
    expect(selected).toHaveLength(1);
    expect(skipped.inactive).toBe(1);
  });

  it("écarte la catégorie exclue par le commerçant", () => {
    const { selected, skipped } = selectPublishedProducts([product()], [2]);
    expect(selected).toHaveLength(0);
    expect(skipped.excludedCategory).toBe(1);
  });

  it("écarte le prix nul (erreur de saisie) et le prix hors plafond", () => {
    const { selected, skipped } = selectPublishedProducts(
      [product({ id: 1, sellingPriceMinor: 0 }), product({ id: 2, sellingPriceMinor: 10 })],
      [],
    );
    expect(selected).toHaveLength(1);
    expect(skipped.invalidPrice).toBe(1);
    const over = selectPublishedProducts(
      [product({ sellingPriceMinor: CATALOG_MAX_PRICE_MINOR + 1 })],
      [],
    );
    expect(over.selected).toHaveLength(0);
    expect(over.skipped.priceOverCap).toBe(1);
  });

  it("écarte le nom illisible", () => {
    const { selected, skipped } = selectPublishedProducts(
      [product({ name: "   " }), product({ id: 2, name: "x".repeat(121) })],
      [],
    );
    expect(selected).toHaveLength(0);
    expect(skipped.invalidName).toBe(2);
  });

  it("la disponibilité est un indice : statut ET quantité", () => {
    expect(isAvailable(product())).toBe(true);
    expect(isAvailable(product({ stockStatus: "out_of_stock" }))).toBe(false);
    expect(isAvailable(product({ quantity: 0 }))).toBe(false);
  });
});

describe("ADR-182 — lignes et version", () => {
  it("les lignes portent EXACTEMENT les colonnes que la table attend du publiant", () => {
    const rows = catalogRows([product()], { batchId: "op-1", publishedAt: "2026-11-11T10:00:00Z" });
    const first = rows[0];
    if (!first) throw new Error("aucune ligne produite");
    // 1) aucune colonne étrangère à la table (PostgREST la refuserait) ;
    // 2) toute colonne obligatoire (NOT NULL sans DEFAULT, ou PK) est fournie.
    for (const key of Object.keys(first)) {
      expect(sqlColumns(), `colonne inconnue de la table : ${key}`).toContain(key);
    }
    for (const key of sqlRequiredColumns()) {
      expect(Object.keys(first), `colonne obligatoire absente : ${key}`).toContain(key);
    }
  });

  it("la version change avec le contenu et PAS avec l'horodatage", () => {
    const a = catalogRows([product()], { batchId: "op-1", publishedAt: "2026-11-11T10:00:00Z" });
    const b = catalogRows([product()], { batchId: "op-2", publishedAt: "2026-11-11T18:30:00Z" });
    expect(catalogVersionOf(a)).toBe(catalogVersionOf(b));
    const c = catalogRows([product({ sellingPriceMinor: 86_000 })], {
      batchId: "op-1",
      publishedAt: "2026-11-11T10:00:00Z",
    });
    expect(catalogVersionOf(a)).not.toBe(catalogVersionOf(c));
    expect(catalogVersionOf(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("le retrait est un drapeau (is_published), jamais une suppression de ligne", () => {
    const rows = catalogRows([product()], { batchId: "op-1", publishedAt: "2026-11-11T10:00:00Z" });
    const first = rows[0];
    if (!first) throw new Error("aucune ligne produite");
    expect(first.is_published).toBe(1);
    expect(first.image_url).toBeNull();
  });
});

describe("ADR-182 — CONTRAT trois parties (SQL ↔ Edge ↔ APK)", () => {
  it("l'Edge ne demande que des colonnes qui existent", () => {
    const cols = sqlColumns();
    for (const c of edgeColumns()) {
      expect(cols, `colonne Edge absente de la table : ${c}`).toContain(c);
    }
  });

  it("l'APK ne lit que des colonnes servies par l'Edge", () => {
    const served = new Set(edgeColumns());
    for (const k of apkReadKeys()) {
      expect(served, `clé lue par l'APK mais pas servie : ${k}`).toContain(k);
    }
  });

  it("les colonnes essentielles sont bien servies ET lues", () => {
    const served = new Set(edgeColumns());
    const read = new Set(apkReadKeys());
    for (const k of ["product_id", "name", "price_minor", "unit_code", "available"]) {
      expect(served).toContain(k);
      expect(read).toContain(k);
    }
  });

  it("l'Edge renvoie bien le catalogue et sa version", () => {
    const src = read("cloud/supabase/functions/client-sync/index.ts");
    expect(src).toContain("catalogVersion");
    expect(src).toContain("catalogPublishedAt");
    expect(src).toContain('.eq("is_published", 1)');
  });
});

describe("ADR-182 — mapper APK", () => {
  it("mappe une ligne du miroir en view-model", () => {
    const p = toCatalogProduct({
      product_id: 11,
      name: "زيت زيتون 1 لتر",
      category_id: 2,
      category_name: "زيوت",
      price_minor: 85_000,
      unit_code: "PIECE",
      available: 1,
      image_url: null,
    });
    expect(p).toEqual({
      id: 11,
      name: "زيت زيتون 1 لتر",
      categoryId: 2,
      categoryName: "زيوت",
      priceMinor: 85_000,
      unitCode: "PIECE",
      available: true,
    });
  });

  it("écarte une entrée corrompue (fail-closed) au lieu d'afficher un prix faux", () => {
    expect(toCatalogProduct({ product_id: 11, name: "x", price_minor: -5 })).toBeNull();
    expect(toCatalogProduct({ product_id: 11, name: "", price_minor: 100 })).toBeNull();
    expect(toCatalogProduct({ product_id: 0, name: "x", price_minor: 100 })).toBeNull();
    expect(toCatalogProduct(null)).toBeNull();
  });

  it("le catalogue vide n'est pas une erreur", () => {
    expect(toCatalog(null)).toEqual([]);
    expect(toCatalog([{ produit: "inconnu" }])).toEqual([]);
  });
});
