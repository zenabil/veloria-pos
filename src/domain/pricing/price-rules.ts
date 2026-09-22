// Veloria PoS — Domain: règles de marge (framework-free).
// P3 : fini la perte silencieuse — `evaluateMargin` expose marge et alerte ;
// l'UI confirme explicitement sous coût (dialogue prix vente, fiche produit),
// le main audite. Le domaine ne REJETTE pas (promos/déstockage légitimes).

import { assertSafeMinor } from "../money/money.ts";

export interface MarginReport {
  marginMinor: number;
  /** % vs achat (null si achat = 0 : marge infinie, pas de sens). */
  marginPct: number | null;
  /** Vente sous le coût d'achat (coût connu > 0). */
  belowCost: boolean;
}

export function evaluateMargin(
  purchasePriceMinor: number,
  sellingPriceMinor: number,
): MarginReport {
  assertSafeMinor(purchasePriceMinor, { label: "Prix d'achat invalide" });
  assertSafeMinor(sellingPriceMinor, { label: "Prix de vente invalide" });
  const marginMinor = sellingPriceMinor - purchasePriceMinor;
  const belowCost = purchasePriceMinor > 0 && sellingPriceMinor < purchasePriceMinor;
  const marginPct =
    purchasePriceMinor > 0 ? Math.round((marginMinor / purchasePriceMinor) * 10000) / 100 : null;
  return { marginMinor, marginPct, belowCost };
}
