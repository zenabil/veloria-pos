// Veloria PoS - Zod: ventes + paniers (extrait de validators.ts, deplacement pur).

import { z } from "zod";
import { moneyMinor } from "./validators.common";
import { moneyMinorPositive } from "./validators.common";
import { moneyTotal } from "./validators.common";
import { quantity } from "./validators.common";
import { optionalOperationId } from "./validators.common";
import { businessDate } from "./validators.common";

export const saleItemSchema = z.object({
  productId: z.number().int().nullable(),
  productName: z.string().min(1).max(200),
  unitCode: z.string().max(20).default("PIECE"),
  // P0-7 : prix d'origine (référence remise) + prix facturé. original ≥ 0,
  // final ≥ 0 ; la remise = (original − final) × qty, calculée côté main.
  originalUnitPriceMinor: moneyMinor,
  unitPriceMinor: moneyMinor,
  purchasePriceMinor: moneyMinor.default(0),
  quantity,
  // ADR-114 (mode « Montant ») : montant facturé EXACT de la ligne. Validé
  // côté main (entier > 0 + borne d'arrondi de la quantité) — le renderer
  // ne peut pas gonfler un total.
  billedTotalMinor: moneyMinorPositive.nullable().optional(),
  // Conditionnement : facteur et tarif carton revalidés en DB côté main.
  packagingId: z.number().int().positive().nullable().optional(),
  unitFactor: z.number().int().positive().max(1_000_000).default(1),
});

export const saleCreateSchema = z.object({
  operationId: z.uuid(),
  customerId: z.number().int().nullable().optional(),
  limitOverrideApproved: z.boolean().default(false),
  // Aligné sur le domaine (`sale-rules.ts`) et les brouillons (500).
  lines: z.array(saleItemSchema).min(1).max(500),
  // P0-7 : AUCUN discountType/discountValue au niveau vente (supprimés) — la
  // remise vit dans les prix unitaires de lignes. Zod ignore les clés
  // inconnues : les anciens appelants restent compatibles.
  deliveryFeeMinor: moneyMinor.default(0),
  // Un paiement peut couvrir un total > 10M DZD (MAX_MINOR_TOTAL).
  amountPaidMinor: moneyTotal,
  paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
  dueDate: businessDate.nullable().optional(),
});

export const cartLineSchema = z.object({
  key: z.string().min(1).max(64),
  productId: z.number().int().nullable(),
  productName: z.string().min(1).max(200),
  unitCode: z.string().max(20).default("PIECE"),
  originalUnitPriceMinor: moneyMinor,
  unitPriceMinor: moneyMinor,
  purchasePriceMinor: moneyMinor.default(0),
  quantity,
  // Montant facturé exact (mode « Montant » ADR-114) — persisté avec le
  // brouillon pour que la facture au montant reste exacte après redémarrage.
  billedTotalMinor: moneyMinorPositive.nullable().optional(),
  // Conditionnement : persisté pour que le tarif carton survive au redémarrage.
  packagingId: z.number().int().positive().nullable().optional(),
  packagingLabelFr: z.string().max(40).nullable().optional(),
  packagingFactor: z.number().int().min(2).max(1_000_000).nullable().optional(),
  packagingSellingPriceMinor: moneyMinor.nullable().optional(),
  packagingAutoCartonPricing: z.boolean().default(false),
  packagingPriceOverridden: z.boolean().default(false),
});

export const cartsSaveSchema = z.object({
  operationId: optionalOperationId,
  tabs: z
    .array(
      z.object({
        tabId: z.number().int().positive(),
        name: z.string().min(1).max(40),
        lines: z.array(cartLineSchema).max(500),
        customerId: z.number().int().positive().nullable().optional(),
        customerLabel: z.string().max(100).default("Client de passage"),
        amountPaidMinor: moneyTotal.default(0),
        paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
        deliveryFeeMinor: moneyMinor.default(0),
        // Identité de la tentative d'encaissement (reprise après crash).
        saleOperationId: z.uuid().nullable().optional(),
      }),
    )
    .max(20),
});
// Phase 9 — pain (simplifié : nom commande + client + quantité, récurrence quotidienne).
