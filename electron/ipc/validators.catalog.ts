// Veloria PoS - Zod: catalogue + import CSV produits (extrait de validators.ts, deplacement pur).

import { z } from "zod";
import { moneyMinor, quantityNonNegative } from "./validators.common";
import { optionalOperationId } from "./validators.common";

export const productSearchSchema = z.object({
  query: z.string().max(200).default(""),
  categoryId: z.number().int().nullable().optional(),
  stockFilter: z.enum(["all", "in_stock", "low_stock", "out_of_stock"]).default("all"),
  includeArchived: z.boolean().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const barcodeSchema = z.object({ barcode: z.string().min(1).max(64) });

export const productCreateSchema = z.object({
  operationId: z.string().uuid(),
  name: z.string().min(2).max(200),
  categoryId: z.number().int().nullable().optional(),
  unitCode: z.string().max(20).default("PIECE"),
  // P7: même plafond moneyMinor que les lignes de vente (anti-overflow).
  purchasePriceMinor: moneyMinor,
  sellingPriceMinor: moneyMinor,
  quantity: quantityNonNegative,
  minStockLevel: quantityNonNegative.default(0),
  maxStockLevel: quantityNonNegative.default(0),
  expirationDate: z.string().nullable().optional(),
  supplierId: z.number().int().nullable().optional(),
  barcodes: z.array(z.string().min(1).max(64)).max(20).default([]),
});

// P18-RADICAL: la mise à jour accepte un operationId OPTIONNEL du caller.
// - Sans operationId (legacy) : idempotente par valeur (même SET = même état).
// - Avec operationId : rejouement protégé via idempotency_keys (pas de 2e audit,
//   pas de double couche FIFO au retry). Zod strip ignorait avant ; désormais le
//   repo l'honore quand il est fourni (contrat honnête + AGENTS.md §4).
// (optionnel du caller — voir `optionalOperationId` dans validators.common).

export const productUpdateSchema = productCreateSchema.omit({ operationId: true }).extend({
  id: z.number().int().positive(),
  operationId: optionalOperationId,
});

export const productsImportSchema = z.object({
  // M-2 caller-owned batch operation: same file retried replays stored result.
  operationId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        sellingPriceMinor: moneyMinor,
        purchasePriceMinor: moneyMinor.default(0),
        quantity: quantityNonNegative.default(0),
        barcode: z.string().max(64).default(""),
      }),
    )
    .min(1)
    .max(5000),
});

export const categoryCreateSchema = z.object({
  name: z.string().min(2).max(100),
  operationId: optionalOperationId,
});

export const productSuppliersSchema = z.object({
  productId: z.number().int().positive(),
  supplierIds: z.array(z.number().int().positive()).max(100).default([]),
  operationId: optionalOperationId,
});

// Appariement OCR par lot : UNE traversée IPC pour ≤ 150 lignes (au lieu de
// ~300 allers-retours barcode + recherche). Le main boucle en local, le
// renderer applique la logique floue sur les candidats retournés.
export const productsMatchBatchSchema = z.object({
  items: z
    .array(
      z.object({
        barcode: z.string().max(64).nullable().optional(),
        name: z.string().max(200).default(""),
      }),
    )
    .min(1)
    .max(150),
});

// étiquettes code-barres (formats thermiques + planche A4, rendu main déterministe).
