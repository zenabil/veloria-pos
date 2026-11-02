// Veloria PoS — Shared: contrats de réponse IPC (renderer).
// Le pont `call<T>` ne vérifie rien (`res.data as T`) : `callChecked` valide
// la forme réelle avec Zod et lève un message FR en cas de dérive main/renderer.
// Schémas volontairement tolérants (`.loose()`) : ils garantissent les
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
const enrichedCustomerRowSchema = z
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
  .loose();

export const enrichedCustomerSearchSchema = z.object({
  rows: z.array(enrichedCustomerRowSchema),
  total: z.number().int().min(0),
});

export type EnrichedCustomerRow = z.infer<typeof enrichedCustomerRowSchema>;

/** Produit (sous-ensemble consommé par l'UI, colonnes libres par ailleurs). */
const productHitSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    // P2 : prix bornés (le stock `quantity` reste décimal : kg).
    selling_price_minor: z.number().int().min(0),
    purchase_price_minor: z.number().int().min(0),
    quantity: z.number(),
    unit_code: z.string(),
  })
  .loose();

/** Vente créée (sales.create / conversions) : id + numéro, jamais de cast. */
export const saleResultSchema = z
  .object({
    saleId: z.number().int().positive(),
    invoiceNumber: z.string().min(1),
  })
  .loose();

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
export const paymentAckSchema = z.object({ paymentId: z.number().int().positive() }).loose();

/** Clôture journalière Z (lignes `daily_closings`, montants en centimes). */
const closingRowSchema = z
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
  .loose();

export const closingsListSchema = z.object({ rows: z.array(closingRowSchema) });

/**
 * Session de caisse (migration 0059) : attentes et fonds en centimes signés
 * (une session à perte rend un `expectedMinor` négatif), écart dérivé du
 * comptage et jamais stocké.
 */
const cashSessionRowSchema = z
  .object({
    id: z.number().int().positive(),
    uuid: z.string(),
    post: z.string(),
    label: z.string(),
    staffUserId: z.number().int().nullable(),
    status: z.enum(["open", "closed"]),
    openingFloatMinor: z.number().int().min(0),
    countedMinor: z.number().int().min(0).nullable(),
    expectedMinor: z.number().int(),
    varianceMinor: z.number().int().nullable(),
    note: z.string().nullable(),
    openedAt: z.string(),
    closedAt: z.string().nullable(),
  })
  .loose();

/** Vue renderer d'une session de caisse (montants en centimes, écart signé). */
export type CashSessionRowView = z.infer<typeof cashSessionRowSchema>;

export const cashSessionResultSchema = cashSessionRowSchema;
export const cashSessionCurrentResultSchema = cashSessionRowSchema.nullable();
export const cashSessionListResultSchema = z.object({ rows: z.array(cashSessionRowSchema) });

/** Activation APK (le QR s'affiche une fois pour la carte d'activation). */
export const accessActivateResultSchema = z
  .object({ activated: z.boolean(), activationCode: z.string().min(16) })
  .loose();

/** QR d'activation scannable (ADR-054) : SVG N&B, "" = repli texte. */
export const accessQrSvgResultSchema = z
  .object({ svg: z.string().max(200_000), payload: z.string().min(1).max(800) })
  .loose();

/** État d'accès APK (jamais de condensats vers le renderer). */
export const accessStatusResultSchema = z
  .object({
    status: z
      .object({
        active: z.boolean(),
        revokedAt: z.string().nullable(),
        failedAttempts: z.number().int().min(0),
        lockedUntil: z.string().nullable(),
      })
      .loose(),
  })
  .loose();

/** Mise en file d'un cliché vers le miroir. */
export const syncEnqueueResultSchema = z
  .object({ queued: z.boolean(), existed: z.boolean() })
  .loose();

/** Poussée miroir (compteurs, rejouable par operationId). */
export const syncPushResultSchema = z
  .object({ pushed: z.number().int().min(0), access: z.number().int().min(0) })
  .loose();

/** Configuration de synchro (clé service toujours masquée). */
export const syncConfigViewSchema = z
  .object({
    enabled: z.boolean(),
    supabaseUrl: z.string(),
    hasKey: z.boolean(),
    hasAnonKey: z.boolean().optional().default(false),
    intervalMinutes: z.number().int().min(5),
    lastPushAt: z.string().nullable(),
    lastError: z.string().nullable(),
    pendingCount: z.number().int().min(0),
    ownerEmail: z.string().nullable().optional(),
    ownerUpdatedAt: z.string().nullable().optional(),
  })
  .loose();
