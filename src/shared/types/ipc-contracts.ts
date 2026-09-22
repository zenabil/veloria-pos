// Veloria PoS — Shared: contrats de réponse IPC (renderer).
// Le pont `call<T>` ne vérifie rien (`res.data as T`) : `callChecked` valide
// la forme réelle avec Zod et lève un message FR en cas de dérive main/renderer.
// Schémas volontairement tolérants (`.passthrough()`) : ils garantissent les
// champs consommés par l'UI sans casser sur une colonne ajoutée côté main.

import { z } from "zod";
import { call } from "@shared/types/ipc-client.ts";

export async function callChecked<O>(
  fn: Parameters<typeof call>[0],
  schema: z.ZodType<O>,
): Promise<O> {
  const data = await call<unknown>(fn);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Réponse inattendue du moteur local. Réessayez.");
  }
  return parsed.data;
}

/** Ligne client enrichie (recherche + agrégats, 1 requête, migration 0020+). */
export const enrichedCustomerRowSchema = z
  .object({
    id: z.number().int().positive(),
    first_name: z.string(),
    last_name: z.string(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    // P2 : montants consommés bornés (int ≥ 0 — CHECK SQL miroir).
    credit_limit_minor: z.number().int().min(0),
    outstanding_balance_minor: z.number().int().min(0),
    debt_status: z.string(),
    is_over_limit: z.number(),
    credit_allowed: z.number(),
    settlement_day: z.number().nullable(),
    notes: z.string().nullable(),
    created_at: z.string(),
    deleted_at: z.string().nullable(),
    invoice_count: z.number().int().min(0),
    total_purchases_minor: z.number().int().min(0),
    last_sale_at: z.string().nullable(),
  })
  .passthrough();

export const enrichedCustomerSearchSchema = z.object({
  rows: z.array(enrichedCustomerRowSchema),
  total: z.number().int().min(0),
});

export type EnrichedCustomerRow = z.infer<typeof enrichedCustomerRowSchema>;
export type ProductHit = z.infer<typeof productHitSchema>;
export type ProductsMatchBatchResult = z.infer<typeof productsMatchBatchSchema>;

/** Produit (sous-ensemble consommé par l'UI, colonnes libres par ailleurs). */
export const productHitSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    // P2 : prix bornés (le stock `quantity` reste décimal : kg).
    selling_price_minor: z.number().int().min(0),
    purchase_price_minor: z.number().int().min(0),
    quantity: z.number(),
    unit_code: z.string(),
  })
  .passthrough();

/** Vente créée (sales.create / conversions) : id + numéro, jamais de cast. */
export const saleResultSchema = z
  .object({
    saleId: z.number().int().positive(),
    invoiceNumber: z.string().min(1),
  })
  .passthrough();

/** Réponse d'appariement OCR par lot (1 IPC, migration main matchBatch). */
export const productsMatchBatchSchema = z.object({
  results: z.array(
    z.object({
      barcodeHit: productHitSchema.nullable(),
      candidates: z.array(productHitSchema),
    }),
  ),
});

/** Accusé de paiement idempotent (client ou fournisseur, migration 0020). */
export const paymentAckSchema = z.object({ paymentId: z.number().int().positive() }).passthrough();

/** Clôture journalière Z (lignes `daily_closings`, montants en centimes). */
export const closingRowSchema = z
  .object({
    business_date: z.string(),
    // P2 : int (le solde de clôture peut être NÉGATIF — journée à perte :
    // pas de min(0) ici, contrairement aux montants clients/produits).
    opening_balance_minor: z.number().int(),
    cash_sales_minor: z.number().int().min(0),
    customer_collections_minor: z.number().int().min(0),
    expenses_minor: z.number().int().min(0),
    refunds_minor: z.number().int().min(0),
    closing_balance_minor: z.number().int(),
  })
  .passthrough();

export const closingsListSchema = z.object({ rows: z.array(closingRowSchema) });
