// Veloria PoS — Main: répartition exacte d'un MONTANT sur des poids (centimes).
// Méthode du plus grand reste : Σ des parts = montant, au centime près.
//
// Usages :
//  - remise GLOBALE d'un devis répartie sur ses lignes (conversion devis→vente) ;
//  - frais de livraison (fret) répartis sur les lignes d'une réception, pour
//    capitaliser le coût rendu dans la valeur du stock (E-27).
//
// MIROIR du domaine pour la remise de devis :
// `src/domain/proforma/proforma-rules.ts` (allocateGlobalDiscount) —
// electron/ ne peut pas importer src/ (rootDir — ADR-062, STRUCTURE §8.3).
// Parité prouvée par `tests/unit/proforma-discount-parity.test.ts`.

export class AmountAllocationError extends Error {}

/**
 * Répartit `amount` (entier ≥ 0) sur `weights` (entiers ≥ 0) au plus proche de
 * la proportion, avec la méthode du plus grand reste.
 *
 * Contrat :
 * - résultat : entiers ≥ 0, `out[i] ≤ weights[i]`, `Σ out[i] === amount` ;
 * - `amount > Σ weights` ⇒ refus (le montant dépasse la base) ;
 * - précision : le ratio est calculé AVANT la multiplication (produit borné
 *   à 1e11 : jamais de débordement float ni de perte de centime).
 */
export function allocateAmountByWeights(weights: readonly number[], amount: number): number[] {
  if (weights.length === 0) {
    throw new AmountAllocationError("Aucune ligne à répartir.");
  }
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new AmountAllocationError("Montant à répartir invalide.");
  }
  let total = 0;
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) {
      throw new AmountAllocationError("Poids de répartition invalide.");
    }
    total += w;
    if (!Number.isSafeInteger(total)) {
      throw new AmountAllocationError("Poids de répartition invalide.");
    }
  }
  if (amount > total) {
    throw new AmountAllocationError("Le montant dépasse la base à répartir.");
  }
  if (amount === 0) return weights.map(() => 0);
  const ratio = amount / total;
  const exact = weights.map((w) => ratio * w);
  const out = exact.map((e) => Math.floor(e));
  let rest = amount - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    const weight = weights[i];
    const current = out[i];
    if (weight === undefined || current === undefined) continue;
    if (current + 1 > weight) continue;
    out[i] = current + 1;
    rest -= 1;
  }
  if (rest !== 0) {
    // Inatteignable en pratique (une part vaut au moins 1 centime tant qu'il
    // reste à distribuer) — fail-closed si l'invariant ne tient pas.
    throw new AmountAllocationError("Répartition impossible.");
  }
  return out;
}
