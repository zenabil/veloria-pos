// Veloria PoS — M-1: stable proforma operation key (renderer, pur, testable).
// Même opération utilisateur (même panier) réessayée après échec/timeout =
// même operationId → le main rejoue le résultat stocké (idempotency_keys)
// au lieu de dupliquer le devis. Panier modifié = nouvelle opération.

export interface ProformaCartLine {
  productId: number | null;
  productName: string;
  unitPriceMinor: number;
  quantity: number;
  billedTotalMinor?: number | null;
  packagingId?: number | null;
  packagingFactor?: number | null;
  packagingSellingPriceMinor?: number | null;
  packagingPriceOverridden?: boolean | null;
}

/**
 * Empreinte stable du contenu (client + lignes). Le conditionnement fait
 * partie de l'identité : un panier dont le tarif carton a changé ne doit pas
 * rejouer l'ancien devis via un operationId identique.
 */
export function proformaOperationKey(
  customerId: number | null,
  lines: readonly ProformaCartLine[],
): string {
  return JSON.stringify({
    c: customerId,
    l: lines.map((l) => [
      l.productId,
      l.productName,
      l.unitPriceMinor,
      l.quantity,
      l.billedTotalMinor ?? null,
      l.packagingId ?? null,
      l.packagingFactor ?? null,
      l.packagingSellingPriceMinor ?? null,
      l.packagingPriceOverridden === true,
    ]),
  });
}
