// Veloria PoS — Main: conditionnements produit (cartons).
// Un seul conditionnement actif par produit ; les versions désactivées restent
// en base pour les références historiques. Mutations atomiques + idempotentes.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { normalizeBarcodeText } from "./barcode-text";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";

export interface PackagingRow {
  id: number;
  product_id: number;
  label_fr: string;
  factor: number;
  selling_price_minor: number;
  purchase_price_minor: number;
  auto_carton_pricing: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function validate(input: {
  labelFr: string;
  factor: number;
  sellingPriceMinor: number;
  purchasePriceMinor: number;
  autoCartonPricing: boolean;
  cartonBarcodes: string[];
}): void {
  if (input.labelFr.trim().length < 2 || input.labelFr.trim().length > 40) {
    throw new Error("Libellé du conditionnement requis (2 à 40 caractères).");
  }
  if (!Number.isInteger(input.factor) || input.factor <= 1 || input.factor > 1_000_000) {
    throw new Error("Taille du carton invalide (entier supérieur à 1).");
  }
  for (const [value, label] of [
    [input.sellingPriceMinor, "Prix de vente du carton"],
    [input.purchasePriceMinor, "Prix d'achat du carton"],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 1_000_000_000) {
      throw new Error(`${label} invalide.`);
    }
  }
  // Un code de carton scanné à la caisse facture le tarif carton : sans tarif
  // automatique, le même scan sortirait le prix pièce (écart d'encaissement).
  if (input.cartonBarcodes.length > 0 && !input.autoCartonPricing) {
    throw new Error("Un code-barres de carton exige le tarif carton automatique.");
  }
}

/**
 * Lie les codes de carton au conditionnement `packagingId` et retire les
 * liaisons précédentes. Chaque code doit déjà exister sur CE produit : la
 * fiche reste la seule voie d'ajout d'un code-barres (pas de création
 * silencieuse depuis la section conditionnement).
 */
function bindCartonBarcodes(
  db: ReturnType<typeof getDb>,
  input: { productId: number; packagingId: number; cartonBarcodes: string[] },
): void {
  db.prepare(`UPDATE product_barcodes SET packaging_id = NULL WHERE packaging_id = ?`).run(
    input.packagingId,
  );
  for (const raw of input.cartonBarcodes) {
    const code = normalizeBarcodeText(raw);
    const row = db
      .prepare(`SELECT id, product_id FROM product_barcodes WHERE barcode = ? COLLATE NOCASE`)
      .get(code) as { id: number; product_id: number } | undefined;
    if (!row) {
      throw new Error(
        `Code-barres du carton introuvable : ajoutez « ${code} » aux codes-barres du produit.`,
      );
    }
    if (Number(row.product_id) !== input.productId) {
      throw new Error(`Code-barres « ${code} » déjà utilisé par un autre produit.`);
    }
    db.prepare(`UPDATE product_barcodes SET packaging_id = ? WHERE id = ?`).run(
      input.packagingId,
      Number(row.id),
    );
  }
}

export function listProductPackagings(productId: number): PackagingRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, product_id, label_fr, factor, selling_price_minor, purchase_price_minor, auto_carton_pricing, is_active, created_at, updated_at
       FROM product_packagings WHERE product_id = ? ORDER BY is_active DESC, id DESC`,
    )
    .all(productId) as PackagingRow[];
}

export function saveProductPackagingAtomic(input: {
  operationId: string;
  productId: number;
  labelFr: string;
  factor: number;
  sellingPriceMinor: number;
  purchasePriceMinor: number;
  autoCartonPricing: boolean;
  cartonBarcodes: string[];
  now: string;
  staffUserId?: number | null;
}): { id: number } {
  const db = getDb();
  const fast = peekIdempotency<{ id: number }>(input.operationId, "products.packaging.save");
  if (fast) return fast;
  validate(input);
  const tx = db.transaction(() => {
    claimIdempotency(input.operationId, "products.packaging.save", input.now);
    const product = db
      .prepare(`SELECT id, is_active FROM products WHERE id = ?`)
      .get(input.productId) as { id: number; is_active: number } | undefined;
    if (!product) throw new Error("Produit introuvable.");
    if (Number(product.is_active) !== 1) {
      throw new Error("Produit archivé : conditionnement non modifiable.");
    }
    const existing = db
      .prepare(
        `SELECT id FROM product_packagings WHERE product_id = ? ORDER BY is_active DESC, id DESC LIMIT 1`,
      )
      .get(input.productId) as { id: number } | undefined;
    let id: number;
    if (existing) {
      id = Number(existing.id);
      db.prepare(
        `UPDATE product_packagings
         SET label_fr = ?, factor = ?, selling_price_minor = ?, purchase_price_minor = ?,
             auto_carton_pricing = ?, is_active = 1, updated_at = ?
         WHERE id = ?`,
      ).run(
        input.labelFr.trim(),
        input.factor,
        input.sellingPriceMinor,
        input.purchasePriceMinor,
        input.autoCartonPricing ? 1 : 0,
        input.now,
        id,
      );
    } else {
      const r = db
        .prepare(
          `INSERT INTO product_packagings (product_id, label_fr, factor, selling_price_minor, purchase_price_minor, auto_carton_pricing, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          input.productId,
          input.labelFr.trim(),
          input.factor,
          input.sellingPriceMinor,
          input.purchasePriceMinor,
          input.autoCartonPricing ? 1 : 0,
          input.now,
          input.now,
        );
      id = Number(r.lastInsertRowid);
    }
    bindCartonBarcodes(db, {
      productId: input.productId,
      packagingId: id,
      cartonBarcodes: input.cartonBarcodes,
    });
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at, actor_user_id)
       VALUES (?, 'product.packaging_saved', 'product', ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(input.productId),
      input.operationId,
      JSON.stringify({
        packagingId: id,
        label: input.labelFr.trim(),
        factor: input.factor,
        selling: input.sellingPriceMinor,
        purchase: input.purchasePriceMinor,
        auto: input.autoCartonPricing ? 1 : 0,
        cartonBarcodes: input.cartonBarcodes,
      }),
      input.now,
      input.staffUserId ?? null,
    );
    const result = { id };
    storeIdempotencyResult(input.operationId, result);
    return result;
  });
  try {
    return (tx as unknown as () => { id: number })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ id: number }>(input.operationId, "products.packaging.save");
      if (retry) return retry;
    }
    // Course sur l'index partiel (un seul actif par produit) : relire l'actif.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: (product_packagings\.product_id|index 'ux_packaging_active')/i.test(
        err.message,
      )
    ) {
      const existing = db
        .prepare(`SELECT id FROM product_packagings WHERE product_id = ? AND is_active = 1 LIMIT 1`)
        .get(input.productId) as { id: number } | undefined;
      if (existing) return { id: Number(existing.id) };
    }
    throw err;
  }
}

export function deleteProductPackagingAtomic(input: {
  operationId: string;
  productId: number;
  now: string;
  staffUserId?: number | null;
}): { deleted: boolean } {
  const db = getDb();
  const fast = peekIdempotency<{ deleted: boolean }>(
    input.operationId,
    "products.packaging.delete",
  );
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(input.operationId, "products.packaging.delete", input.now);
    const product = db.prepare(`SELECT id FROM products WHERE id = ?`).get(input.productId) as
      | { id: number }
      | undefined;
    if (!product) throw new Error("Produit introuvable.");
    db.prepare(
      `UPDATE product_packagings SET is_active = 0, updated_at = ? WHERE product_id = ? AND is_active = 1`,
    ).run(input.now, input.productId);
    // Les codes de carton suivent le conditionnement : une liaison laissée en
    // base ressusciterait au prochain enregistrement (la ligne est réutilisée).
    db.prepare(
      `UPDATE product_barcodes SET packaging_id = NULL
       WHERE packaging_id IN (SELECT id FROM product_packagings WHERE product_id = ?)`,
    ).run(input.productId);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at, actor_user_id)
       VALUES (?, 'product.packaging_deleted', 'product', ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(input.productId),
      input.operationId,
      JSON.stringify({}),
      input.now,
      input.staffUserId ?? null,
    );
    const result = { deleted: true };
    storeIdempotencyResult(input.operationId, result);
    return result;
  });
  try {
    return (tx as unknown as () => { deleted: boolean })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ deleted: boolean }>(
        input.operationId,
        "products.packaging.delete",
      );
      if (retry) return retry;
    }
    throw err;
  }
}
