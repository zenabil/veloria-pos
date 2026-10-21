// Veloria PoS - Zod: stock + fournisseurs + commandes + OCR (extrait de validators.ts, deplacement pur).

import { z } from "zod";
import { moneyMinor, moneyMinorPositive } from "./validators.common";
import { businessDate, quantity, quantityNonNegative } from "./validators.common";
import { optionalOperationId } from "./validators.common";
import { paginationSchema } from "./validators.common";

export const stockAdjustSchema = z.object({
  operationId: z.string().uuid(),
  productId: z.number().int().positive(),
  newQuantity: quantityNonNegative,
  reason: z.string().min(2).max(300),
  reference: z.string().max(100).nullable().optional(),
});

export const stockProductsSchema = z.object({
  query: z.string().max(200).default(""),
  categoryId: z.number().int().nullable().optional(),
  stockStatus: z.enum(["all", "in_stock", "low_stock", "out_of_stock"]).default("all"),
  movementType: z
    .enum([
      "all",
      "sale_out",
      "sale_cancel_in",
      "intake_in",
      "adjust_in",
      "adjust_out",
      "return_in",
      "damage_out",
    ])
    .default("all"),
  sort: z
    .enum(["name_asc", "name_desc", "qty_asc", "qty_desc", "value_desc", "recent_desc"])
    .default("name_asc"),
  page: z.number().int().min(1).default(1),
  // P30: pagination unifiée (200 max partout — l'UI demande 20 ; 500
  // permettait un scrape mémoire via IPC forgé).
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const stockMovementsSchema = z.object({
  productId: z.number().int().positive(),
  from: businessDate.nullable().optional(),
  to: businessDate.nullable().optional(),
  types: z
    .array(
      z.enum([
        "sale_out",
        "sale_cancel_in",
        "intake_in",
        "adjust_in",
        "adjust_out",
        "return_in",
        "damage_out",
      ]),
    )
    .max(7)
    .default([]),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const inventoryApplySchema = z.object({
  operationId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        actualQty: quantityNonNegative,
      }),
    )
    .min(1)
    .max(500),
  reason: z.string().min(2).max(300),
  reference: z.string().max(100).nullable().optional(),
});

// Historique unifié (lecture seule).
// P06: pageSize aligné sur les autres listes (200 max) — 1000 contournait le Pager.

export const stockIntakeSchema = z.object({
  operationId: z.string().uuid(),
  supplierId: z.number().int().positive().nullable().optional(),
  invoiceNumber: z.string().max(100).nullable().optional(),
  invoiceDate: businessDate,
  shippingMinor: moneyMinor.default(0),
  notes: z.string().max(500).nullable().optional(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive().nullable(),
        productName: z.string().min(1).max(200),
        quantityReceived: quantity,
        quantityDamaged: quantityNonNegative.default(0),
        purchasePriceMinor: moneyMinor,
        // Prix de vente par ligne (optionnel) : null/omitted = conserver le prix
        // actuel du produit ; number (dont 0 explicite) = nouveau prix de vente.
        sellingPriceMinor: moneyMinor.nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const supplierSearchSchema = z.object({
  query: z.string().max(200).default(""),
  statusFilter: z.enum(["all", "active", "inactive"]).default("all"),
  paymentFilter: z.enum(["all", "with_debt", "settled"]).default("all"),
  sort: z
    .enum(["name_asc", "name_desc", "purchases_desc", "debt_desc", "recent_desc"])
    .default("name_asc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const supplierCreateSchema = z.object({
  operationId: z.string().uuid(),
  name: z.string().min(2).max(200),
  code: z.string().max(20).nullable().optional(),
  contact: z.string().max(100).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().max(100).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  taxNumber: z.string().max(50).nullable().optional(),
  commercialRegister: z.string().max(50).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const supplierUpdateSchema = supplierCreateSchema
  // M-3 RADICAL: operationId optionnel honoré par le repo (voir productUpdate).
  .omit({ operationId: true })
  .extend({
    id: z.number().int().positive(),
    operationId: optionalOperationId,
  });

export const supplierDeleteManySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
  // M-2 caller-owned operation: retry of the same user action replays the
  // stored result instead of failing on already-deleted rows.
  operationId: z.string().uuid(),
});

export const supplierPaySchema = z.object({
  operationId: z.string().uuid(),
  supplierId: z.number().int().positive(),
  amountMinor: moneyMinorPositive,
  method: z.enum(["cash", "cheque", "transfer"]),
  reference: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  paymentDate: businessDate,
});

// Phase 7 — proformas

export const purchaseLineSchema = z.object({
  productId: z.number().int().nullable(),
  productName: z.string().min(1).max(200),
  unitCode: z.string().max(20).default("PIECE"),
  quantityOrdered: quantity,
  unitCostMinor: moneyMinor,
});

export const purchaseCreateSchema = z.object({
  operationId: z.string().uuid(),
  supplierId: z.number().int().positive(),
  expectedDate: businessDate.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  lines: z.array(purchaseLineSchema).min(1).max(200),
});

export const purchaseListSchema = paginationSchema.extend({
  supplierId: z.number().int().positive().nullable().optional(),
  status: z
    .enum(["draft", "ordered", "partially_received", "received", "cancelled"])
    .nullable()
    .optional(),
});

export const purchaseReceiveSchema = z
  .object({
    operationId: z.string().uuid(),
    id: z.number().int().positive(),
    lines: z
      .array(
        z.object({
          itemId: z.number().int().positive(),
          quantityReceived: quantity,
        }),
      )
      .min(1)
      .max(200),
  })
  // M3 : lignes uniques — `quantity_received += ?` par ligne + contrôle sur
  // snapshot figé (avant UPDATE) permettait de recevoir 2× la même ligne et
  // de dépasser `quantity_ordered` (contournement du garde-fou monétaire).
  .superRefine((v, ctx) => {
    const seen = new Set<number>();
    for (let i = 0; i < v.lines.length; i++) {
      const id = v.lines[i]?.itemId;
      if (id == null) continue;
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ligne de commande en double.",
          path: ["lines", i, "itemId"],
        });
        return;
      }
      seen.add(id);
    }
  });
// P4 : brouillons paniers (persistance onglets, SQLite — jamais de LocalStorage).

export const ocrSelectFileSchema = z.object({});

// Accès clients APK (V1 lecture seule, miroir ADR-053) : activation QR/PIN,
// file de synchro vers le miroir, annonces magasin (1 ligne, 120 max).
// Le PIN reste en clair jusqu'au main qui le hache (jamais stocké ni loggé).

export const ocrAnalyzeSchema = z.object({
  fileId: z.string().uuid(),
  languages: z
    .array(z.enum(["fra", "eng", "ara"]))
    .min(1)
    .max(3)
    .default(["fra", "eng"]),
});

export const ocrCancelSchema = z.object({ fileId: z.string().uuid() });

export const ocrDisposeSchema = z.object({ fileId: z.string().uuid() });
