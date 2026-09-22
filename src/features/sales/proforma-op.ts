// Veloria PoS — M-1: stable proforma operation key (renderer, pur, testable).
// Même opération utilisateur (même panier) réessayée après échec/timeout =
// même operationId → le main rejoue le résultat stocké (idempotency_keys)
// au lieu de dupliquer le devis. Panier modifié = nouvelle opération.

export interface ProformaCartLine {
  productId: number | null;
  productName: string;
  unitPriceMinor: number;
  quantity: number;
}

/** Empreinte stable du contenu (client + lignes). */
export function proformaOperationKey(
  customerId: number | null,
  lines: readonly ProformaCartLine[],
): string {
  return JSON.stringify({
    c: customerId,
    l: lines.map((l) => [l.productId, l.productName, l.unitPriceMinor, l.quantity]),
  });
}
