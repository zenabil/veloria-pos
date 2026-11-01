// Veloria PoS — Main: allocation exacte d'un coût d'achat sur des unités de
// base (miroir du domaine `src/domain/packaging/packaging-rules.ts`, électrons
// ne pouvant pas importer src/ — parité verrouillée par test).
//
// Méthode du plus grand reste compacte : au plus deux paliers de coût
// unitaire (centimes entiers) dont la somme des quantités × coût reproduit
// EXACTEMENT le total payé.
// ADR-167 : le wrapper `allocateUnitCosts` (sans appelant) a été retiré ;
// seule l'allocation par paliers est exécutée et testée.

export interface UnitCostTier {
  quantity: number;
  unitCostMinor: number;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

export function allocateUnitCostLayers(totalMinor: number, baseQty: number): UnitCostTier[] {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) {
    throw new Error("Total d'achat invalide.");
  }
  if (!Number.isFinite(baseQty) || baseQty <= 0) {
    throw new Error("Quantité nette d'achat invalide.");
  }
  const qty = round3(baseQty);
  const unitCost = Math.floor(totalMinor / qty);
  const residualMinor = round3(totalMinor - unitCost * qty);
  const tiers: UnitCostTier[] = [];
  const lowQty = round3(qty - residualMinor);
  if (lowQty > 0) tiers.push({ quantity: lowQty, unitCostMinor: unitCost });
  if (residualMinor > 0) tiers.push({ quantity: residualMinor, unitCostMinor: unitCost + 1 });
  const check = Math.round(tiers.reduce((a, t) => a + t.quantity * t.unitCostMinor, 0));
  if (check !== totalMinor) {
    throw new Error("Répartition du coût d'achat incohérente.");
  }
  return tiers;
}
