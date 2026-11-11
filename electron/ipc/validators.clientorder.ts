// Veloria PoS - Zod: commandes clients (ADR-182, tranche C).
//
// La commande est une demande de RÉSERVATION : elle n'est jamais une vente.
// Le prix n'est pas envoyé par le renderer (le main le relit dans `products`),
// et l'état « servie » n'est PAS accessible par ce canal : c'est la VENTE
// encaissée qui livre la commande (migration 0063, `linkClientOrderToSale…`).

import { z } from "zod";

/** États modifiables par le commerçant (« servie » exclue : c'est la vente). */
export const clientOrderStatusSchema = z.enum(["preparing", "ready", "cancelled"]);

/** Ligne demandée : produit + quantité. Le PRIX est relu par le main. */
export const clientOrderCreateSchema = z.object({
  operationId: z.uuid(),
  customerId: z.number().int().positive(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(200),
  note: z.string().max(300).nullable().optional(),
  source: z.enum(["manual", "app", "auto"]).default("manual"),
});

/** Changement d'état (transition vérifiée par le domaine ET par le trigger). */
export const clientOrderSetStatusSchema = z.object({
  operationId: z.uuid(),
  orderId: z.number().int().positive(),
  status: clientOrderStatusSchema,
  cancelReason: z.string().max(200).nullable().optional(),
});

/** Filtres de la liste des commandes. */
export const clientOrderListSchema = z.object({
  status: z.enum(["nouvelle", "preparing", "ready", "served", "cancelled"]).nullable().optional(),
  customerId: z.number().int().positive().nullable().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

/** Une commande par identifiant. */
export const clientOrderIdSchema = z.object({
  id: z.number().int().positive(),
});
