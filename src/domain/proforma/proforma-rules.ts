// Veloria PoS — Domain: règles proformas (Phase 7, framework-free).
// Statuts : draft -> sent -> converted | cancelled. Conversion = vente réelle
// créée par le repo main dans la même transaction (proforma + vente liées).

import { DomainError } from "../common/errors.ts";
import { assertValidQuantity } from "../common/quantity.ts";
import {
  assertSafeMinor,
  assertSafeTotal,
  multiplyMinorByQuantity,
  sumSafeMinors,
} from "../money/money.ts";

export type ProformaStatus = "draft" | "sent" | "converted" | "cancelled";

export interface ProformaLineDraft {
  productId: number | null;
  productName: string;
  unitPriceMinor: number;
  quantity: number;
}

export function computeProformaTotals(
  lines: ProformaLineDraft[],
  discountMinor: number,
  deliveryMinor: number,
): { subtotalMinor: number; totalMinor: number } {
  if (lines.length === 0) throw new DomainError("PROFORMA_ERROR", "Devis vide.");
  if (lines.length > 500)
    throw new DomainError("PROFORMA_ERROR", "Devis trop volumineux (max 500 lignes).");
  assertSafeMinor(discountMinor, { label: "Remise invalide" });
  assertSafeMinor(deliveryMinor, { label: "Frais de livraison invalides" });
  const lineTotals: number[] = [];
  for (const l of lines) {
    if (l.productName.trim().length === 0)
      throw new DomainError("PROFORMA_ERROR", "Ligne sans nom.");
    assertSafeMinor(l.unitPriceMinor, { label: "Prix de ligne invalide" });
    assertValidQuantity(l.quantity);
    lineTotals.push(multiplyMinorByQuantity(l.unitPriceMinor, l.quantity));
  }
  const subtotal = sumSafeMinors(lineTotals, "Sous-total devis invalide");
  if (discountMinor > subtotal) {
    throw new DomainError("PROFORMA_ERROR", "La remise dépasse le sous-total.");
  }
  const total = subtotal - discountMinor + deliveryMinor;
  assertSafeTotal(total, "Total devis invalide");
  return { subtotalMinor: subtotal, totalMinor: total };
}

const TRANSITIONS: Record<ProformaStatus, ProformaStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["converted", "cancelled"],
  converted: [],
  cancelled: [],
};

export function assertProformaTransition(from: ProformaStatus, to: ProformaStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError("PROFORMA_ERROR", `Transition interdite : ${from} → ${to}.`);
  }
}

/**
 * Répartition EXACTE d'une remise GLOBALE (montant DZD) sur les lignes d'un
 * devis (méthode du plus grand reste).
 *
 * Pourquoi : la remise d'un devis est GLOBALE (un montant), alors que le
 * modèle de vente porte la remise sur les LIGNES (P0-7). Répartir D sur les
 * totaux de lignes permet de conserver le montant exact du devis (Σ = D au
 * centime près) sans jamais toucher au prix unitaire affiché.
 *
 * Contrat :
 * - `lineTotalsMinor[i]` = total PLEIN de la ligne (prix × qté) ;
 * - le résultat `out[i]` est un entier ≥ 0, `out[i] ≤ lineTotalsMinor[i]` ;
 * - `Σ out[i] === discountMinor` (invariant exact, vérifié par le test) ;
 * - `discountMinor > Σ lineTotals` ⇒ refus (remise > sous-total).
 *
 * Miroir main : `electron/ipc/handlers/proforma-discount.ts` (electron/ ne
 * peut pas importer src/ — ADR-062/STRUCTURE §8.3) ; parité prouvée par
 * `tests/unit/proforma-discount-parity.test.ts`.
 */
export function allocateGlobalDiscount(
  lineTotalsMinor: readonly number[],
  discountMinor: number,
): number[] {
  if (lineTotalsMinor.length === 0) {
    throw new DomainError("PROFORMA_ERROR", "Devis vide.");
  }
  if (!Number.isSafeInteger(discountMinor) || discountMinor < 0) {
    throw new DomainError("PROFORMA_ERROR", "Remise invalide.");
  }
  const sum = sumSafeMinors(lineTotalsMinor, "Sous-total devis invalide");
  if (discountMinor > sum) {
    throw new DomainError("PROFORMA_ERROR", "La remise dépasse le sous-total.");
  }
  if (discountMinor === 0) return lineTotalsMinor.map(() => 0);
  // Ratio d'abord (produit ≤ 1e11 : jamais de débordement float), puis part
  // proportionnelle au plus grand reste ⇒ somme exacte.
  const ratio = discountMinor / sum;
  const exact = lineTotalsMinor.map((t) => ratio * t);
  const out = exact.map((e) => Math.floor(e));
  let rest = discountMinor - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    const weight = lineTotalsMinor[i];
    const current = out[i];
    if (weight === undefined || current === undefined) continue;
    if (current + 1 > weight) continue;
    out[i] = current + 1;
    rest -= 1;
  }
  if (rest !== 0) {
    // Théoriquement inatteignable (une part vaut au moins 1 centime tant
    // qu'il reste à distribuer) — fail-closed si l'invariant ne tient pas.
    throw new DomainError("PROFORMA_ERROR", "Remise impossible à répartir.");
  }
  return out;
}
