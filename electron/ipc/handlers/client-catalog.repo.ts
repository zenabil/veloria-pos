// Veloria PoS — Dépôt catalogue client (ADR-182).
//
// Le catalogue est une PROJECTION de `products` vers la table miroir
// `store_catalog` (un projet Supabase = un magasin, ADR-182 §3). SQLite reste
// le master : les prix, les noms et les disponibilités sont relus ici, jamais
// crus ni renvoyés par le renderer.
//
// Les réglages de publication (activé, catégories exclues) vivent dans
// `app_settings` (`client_catalog`) : ce n'est pas un secret, ce n'est donc
// pas dans le document chiffré `client_sync`.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { log } from "../../services/logger";
import {
  auditOperationId,
  claimIdempotency,
  peekIdempotency,
  storeIdempotencyResult,
} from "./idempotency";
import {
  catalogRows,
  catalogVersionOf,
  selectPublishedProducts,
  toPreviewItems,
  type CatalogPreviewItem,
  type CatalogRow,
  type CatalogSkipped,
  type CatalogSourceProduct,
} from "../../sync/client-catalog";

const SETTINGS_KEY = "client_catalog";

export interface CatalogSettings {
  /** Publication activée : sans elle, rien n'est poussé au miroir. */
  enabled: boolean;
  /** Catégories retirées du catalogue client (identifiants `categories.id`). */
  excludedCategoryIds: number[];
  /** Dernière publication réussie (instant ISO) ou null. */
  lastPublishedAt: string | null;
  /** Version du dernier catalogue publié. */
  lastVersion: string | null;
  /** Nombre de produits au dernier catalogue publié. */
  lastProductCount: number;
  /** Le catalogue local a changé depuis la dernière publication. */
  dirty: boolean;
}

const DEFAULT_SETTINGS: CatalogSettings = {
  enabled: false,
  excludedCategoryIds: [],
  lastPublishedAt: null,
  lastVersion: null,
  lastProductCount: 0,
  dirty: false,
};

function readSettings(): CatalogSettings {
  const db = getDb();
  const row = db.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).get(SETTINGS_KEY) as
    { value_json: string } | undefined;
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(row.value_json) as Partial<CatalogSettings>;
    const excluded = Array.isArray(parsed.excludedCategoryIds)
      ? parsed.excludedCategoryIds.filter(
          (n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0,
        )
      : [];
    return {
      enabled: parsed.enabled === true,
      excludedCategoryIds: [...new Set(excluded)],
      lastPublishedAt: typeof parsed.lastPublishedAt === "string" ? parsed.lastPublishedAt : null,
      lastVersion: typeof parsed.lastVersion === "string" ? parsed.lastVersion : null,
      lastProductCount:
        typeof parsed.lastProductCount === "number" && parsed.lastProductCount >= 0
          ? parsed.lastProductCount
          : 0,
      dirty: parsed.dirty === true,
    };
  } catch {
    // Réglage corrompu : repli sur les défauts, mais jamais en silence (un
    // défaut invisible peut publier (ou ne pas publier) un catalogue faux).
    log("WARN", "catalog", "settings.corrupted", { key: SETTINGS_KEY });
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(value: CatalogSettings, now: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(SETTINGS_KEY, JSON.stringify(value), now);
}

export function getCatalogSettings(): CatalogSettings {
  return readSettings();
}

/**
 * Sauvegarde des réglages de publication (mutation idempotente).
 * `operationId` EXIGÉ : c'est une écriture (règle 4). Le rejeu rend le
 * résultat stocké au lieu de réécrire.
 */
export function saveCatalogSettingsAtomic(args: {
  enabled: boolean;
  excludedCategoryIds: number[];
  operationId: string;
  now: string;
}): CatalogSettings {
  const replay = peekIdempotency<CatalogSettings>(args.operationId, "catalog.saveSettings");
  if (replay) return replay;
  const db = getDb();
  const current = readSettings();
  const excluded = [...new Set(args.excludedCategoryIds)].sort((a, b) => a - b);
  const next: CatalogSettings = {
    ...current,
    enabled: args.enabled,
    excludedCategoryIds: excluded,
    // Un changement de réglage invalide la publication précédente : le
    // catalogue affiché ne serait plus celui qui est en ligne.
    dirty: true,
  };
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "catalog.saveSettings", args.now);
    writeSettings(next, args.now);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'catalog.settings_saved', 'settings', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      SETTINGS_KEY,
      auditOperationId(args.operationId, "catalog.settings_saved", SETTINGS_KEY, next),
      JSON.stringify({ enabled: next.enabled, excludedCategoryIds: next.excludedCategoryIds }),
      args.now,
    );
    storeIdempotencyResult(args.operationId, next);
    return next;
  });
  try {
    return tx();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<CatalogSettings>(args.operationId, "catalog.saveSettings");
      if (retry) return retry;
    }
    throw err;
  }
}

/**
 * Produits source : actifs ET archivés, pour que la page POS puisse
 * expliquer POURQUOI un produit n'est pas publié (le compteur d'exclusion
 * n'est jamais muet).
 */
export function readCatalogSource(): CatalogSourceProduct[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.category_id, c.name AS category_name, p.selling_price_minor,
              p.unit_code, p.quantity, p.stock_status, p.is_active
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.deleted_at IS NULL
       ORDER BY p.name COLLATE NOCASE ASC, p.id ASC`,
    )
    .all() as {
    id: number;
    name: string | null;
    category_id: number | null;
    category_name: string | null;
    selling_price_minor: number;
    unit_code: string | null;
    quantity: number | null;
    stock_status: string | null;
    is_active: number;
  }[];
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ""),
    categoryId: r.category_id == null ? null : Number(r.category_id),
    categoryName: r.category_name == null ? null : String(r.category_name),
    sellingPriceMinor: Number(r.selling_price_minor),
    unitCode: String(r.unit_code ?? "PIECE"),
    quantity: Number(r.quantity ?? 0),
    stockStatus: String(r.stock_status ?? "in_stock"),
    isActive: Number(r.is_active) === 1,
  }));
}

export interface CatalogBuild {
  rows: CatalogRow[];
  version: string;
  productCount: number;
  skipped: CatalogSkipped;
}

/** Catalogue effectif = ce que l'APK verra (mêmes règles que la publication). */
export function buildCatalog(batchId: string, publishedAt: string): CatalogBuild {
  const settings = readSettings();
  const { selected, skipped } = selectPublishedProducts(
    readCatalogSource(),
    settings.excludedCategoryIds,
  );
  const rows = catalogRows(selected, { batchId, publishedAt });
  return {
    rows,
    version: catalogVersionOf(rows),
    productCount: rows.length,
    skipped,
  };
}

export interface CatalogPreview {
  items: CatalogPreviewItem[];
  skipped: CatalogSkipped;
  settings: CatalogSettings;
}

/** Vue « produits publiés dans l'application » (écran POS). */
export function listCatalogPreview(): CatalogPreview {
  const settings = readSettings();
  const { selected, skipped } = selectPublishedProducts(
    readCatalogSource(),
    settings.excludedCategoryIds,
  );
  const rows = catalogRows(selected, { batchId: "preview", publishedAt: "" });
  return { items: toPreviewItems(rows), skipped, settings };
}

/**
 * Le catalogue local a-t-il changé depuis la dernière publication ?
 *
 * On compare l'EMPREINTE du catalogue courant à celle de la dernière
 * publication : pas d'horodatage, pas de drapeau à maintenir. Tout chemin
 * d'écriture produit est donc couvert (prix, activation, import, archivage)
 * sans rien câbler — c'est le but : un catalogue publié ne doit pas pouvoir
 * diverger du POS.
 */
export function isCatalogStale(): boolean {
  const settings = readSettings();
  if (!settings.enabled) return false;
  const build = buildCatalog("stale-check", "");
  return settings.lastVersion !== build.version;
}

/**
 * Marque le catalogue « à republier ». Appelé après toute écriture produit
 * (prix, activation, archivage) : la republication est faite par le timer
 * de synchro, PAS dans la transaction produit (une transaction ne fait
 * jamais d'appel réseau).
 */
export function markCatalogDirty(): void {
  try {
    const current = readSettings();
    if (current.dirty) return;
    writeSettings({ ...current, dirty: true }, new Date().toISOString());
  } catch (err) {
    log("WARN", "catalog", "dirty.failed", { error: String(err) });
  }
}

/** Mémorise la publication réussie (version + date + compteur). */
export function recordCatalogPublished(args: {
  version: string;
  productCount: number;
  now: string;
}): void {
  try {
    const current = readSettings();
    writeSettings(
      {
        ...current,
        lastPublishedAt: args.now,
        lastVersion: args.version,
        lastProductCount: args.productCount,
        dirty: false,
      },
      args.now,
    );
  } catch (err) {
    log("WARN", "catalog", "published.meta.failed", { error: String(err) });
  }
}
