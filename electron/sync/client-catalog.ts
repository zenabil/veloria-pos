// Veloria — catalogue publié à l'application client (ADR-182).
//
// Règles PURES : ni base, ni réseau, ni Electron. Le SQL vit dans
// `electron/ipc/handlers/catalog.repo.ts`, la poussée dans
// `electron/sync/sync.service.ts`.
//
// Ce module est le **côté main** d'un contrat à trois parties :
//   1. ce builder (POS)         → lignes `store_catalog`
//   2. la fonction Edge         → `catalog` + `catalogVersion` (JSON)
//   3. l'APK                    → `mobile/src/views.ts` (`toCatalog`)
// Toute divergence de NOM DE CHAMP est un bug de contrat : le test
// `tests/unit/catalog-contract.test.ts` verrouille les trois côtés.
//
// Le catalogue est une PROJECTION : les prix sont lus dans SQLite
// (`products.selling_price_minor`), jamais dans le nuage (ADR-053).

import { createHash } from "node:crypto";

/** Plafond de produits publiés (borne de charge utile et de mémoire). */
export const CATALOG_MAX_PRODUCTS = 1000;
/** Longueur maximale du nom publié (miroir du CHECK SQL `store_catalog`). */
export const CATALOG_MAX_NAME = 120;
/** Longueur maximale du code d'unité publié (miroir du CHECK SQL). */
export const CATALOG_MAX_UNIT = 24;
/**
 * Plafond unitaire du prix — MIROIR de `MAX_MINOR_SINGLE` (veloria-money).
 * Un produit au-dessus n'est pas publié (le CHECK SQL le refuserait).
 */
export const CATALOG_MAX_PRICE_MINOR = 1_000_000_000;

/** Produit source, déjà lu en base (quantité en unités de base). */
export interface CatalogSourceProduct {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  sellingPriceMinor: number;
  unitCode: string;
  /** Quantité en base : seule la comparaison « > 0 » est utilisée. */
  quantity: number;
  stockStatus: string;
  isActive: boolean;
}

/** Ligne prête à publier (colonnes de `store_catalog`). */
export interface CatalogRow {
  product_id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
  price_minor: number;
  unit_code: string;
  available: 0 | 1;
  image_url: null;
  is_published: 0 | 1;
  batch_id: string;
  published_at: string;
}

/** Motifs d'exclusion — la page POS doit les justifier au commerçant. */
export interface CatalogSkipped {
  /** Produit archivé (`is_active = 0` ou `deleted_at` renseigné). */
  inactive: number;
  /** Catégorie exclue par le commerçant. */
  excludedCategory: number;
  /** Prix nul ou négatif : erreur de saisie, jamais publié. */
  invalidPrice: number;
  /** Prix au-dessus du plafond unitaire. */
  priceOverCap: number;
  /** Produit tronqué (nom illisible). */
  invalidName: number;
  /** Dépassement du plafond de produits publiés. */
  overLimit: number;
}

export interface CatalogSelection {
  selected: CatalogSourceProduct[];
  skipped: CatalogSkipped;
}

function emptySkipped(): CatalogSkipped {
  return {
    inactive: 0,
    excludedCategory: 0,
    invalidPrice: 0,
    priceOverCap: 0,
    invalidName: 0,
    overLimit: 0,
  };
}

/**
 * Sélection des produits publiables (ADR-182 §5).
 *
 * Publié SI : produit actif **ET** catégorie non exclue **ET** prix > 0
 * **ET** prix ≤ plafond **ET** nom lisible. Tout le reste est écarté et
 * COMPTÉ : un écart invisible est un catalogue faux.
 */
export function selectPublishedProducts(
  products: readonly CatalogSourceProduct[],
  excludedCategoryIds: readonly number[],
): CatalogSelection {
  const excluded = new Set(excludedCategoryIds);
  const skipped = emptySkipped();
  const selected: CatalogSourceProduct[] = [];
  for (const p of products) {
    if (!p.isActive) {
      skipped.inactive += 1;
      continue;
    }
    if (p.categoryId != null && excluded.has(p.categoryId)) {
      skipped.excludedCategory += 1;
      continue;
    }
    if (!Number.isInteger(p.sellingPriceMinor) || p.sellingPriceMinor <= 0) {
      skipped.invalidPrice += 1;
      continue;
    }
    if (p.sellingPriceMinor > CATALOG_MAX_PRICE_MINOR) {
      skipped.priceOverCap += 1;
      continue;
    }
    const name = p.name.trim();
    if (name.length === 0 || name.length > CATALOG_MAX_NAME) {
      skipped.invalidName += 1;
      continue;
    }
    selected.push({ ...p, name });
    if (selected.length > CATALOG_MAX_PRODUCTS) {
      selected.pop();
      skipped.overLimit += 1;
    }
  }
  return { selected, skipped };
}

/**
 * Disponibilité publiée : un INDICE, jamais la quantité.
 * `stock_status` est dénormalisé par l'ajustement d'inventaire (0037) ;
 * la quantité (millièmes) est la seconde garde.
 */
export function isAvailable(product: CatalogSourceProduct): boolean {
  if (product.stockStatus === "out_of_stock") return false;
  return Number.isFinite(product.quantity) && product.quantity > 0;
}

/** Lignes `store_catalog` (ordre stable par id : la version en dépend). */
export function catalogRows(
  selected: readonly CatalogSourceProduct[],
  options: { batchId: string; publishedAt: string },
): CatalogRow[] {
  return [...selected]
    .sort((a, b) => a.id - b.id)
    .map((p) => ({
      product_id: p.id,
      name: p.name,
      category_id: p.categoryId,
      category_name: p.categoryName,
      price_minor: p.sellingPriceMinor,
      unit_code: (p.unitCode.trim() || "PIECE").slice(0, CATALOG_MAX_UNIT),
      available: isAvailable(p) ? 1 : 0,
      image_url: null,
      is_published: 1,
      batch_id: options.batchId,
      published_at: options.publishedAt,
    }));
}

/**
 * Empreinte de version du catalogue : SHA-256 d'une projection CANONIQUE
 * (id, nom, prix, unité, disponibilité) triée par id. Elle change si le
 * catalogue change, et **seulement** si : une réédition du même contenu
 * (horodatage) ne la fait PAS bouger (l'APK ne re-télécharge pas pour rien).
 */
export function catalogVersionOf(rows: readonly CatalogRow[]): string {
  const canonical = [...rows]
    .sort((a, b) => a.product_id - b.product_id)
    .map((r) => [r.product_id, r.name, r.price_minor, r.unit_code, r.available]);
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

/** Vue « ce que l'APK verra » (page POS) — même projection que le client. */
export interface CatalogPreviewItem {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  priceMinor: number;
  unitCode: string;
  available: boolean;
}

export function toPreviewItems(rows: readonly CatalogRow[]): CatalogPreviewItem[] {
  return rows.map((r) => ({
    id: r.product_id,
    name: r.name,
    categoryId: r.category_id,
    categoryName: r.category_name,
    priceMinor: r.price_minor,
    unitCode: r.unit_code,
    available: r.available === 1,
  }));
}
