// Veloria PoS - Zod: catalogue publié dans l'application client (ADR-182).
//
// Le catalogue est une PROJECTION de `products` vers la table miroir
// `store_catalog`. Les réglages portent sur la PUBLICATION (activé,
// catégories exclues) — jamais sur les prix : le prix est relu en base.

import { z } from "zod";

/**
 * Réglages de publication. `operationId` EXIGÉ (écriture, règle 4) : le
 * rejeu rend le résultat stocké au lieu de réécrire.
 */
export const clientCatalogSettingsSaveSchema = z.object({
  operationId: z.uuid(),
  enabled: z.boolean(),
  /** Catégories retirées du catalogue client (borné : un shop n'en a pas 500). */
  excludedCategoryIds: z.array(z.number().int().positive()).max(200).default([]),
  /** Surcharge par produit (publication + disponibilité). */
  productOverrides: z
    .record(
      z.string().regex(/^\d+$/),
      z.object({
        published: z.boolean().nullable().optional(),
        available: z.boolean().nullable().optional(),
      }),
    )
    .optional(),
});

/** Publication immédiate du catalogue vers le miroir. */
export const clientCatalogPublishSchema = z.object({
  operationId: z.uuid(),
});
