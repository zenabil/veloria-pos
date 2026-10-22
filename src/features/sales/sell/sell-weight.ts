// Veloria PoS — Caisse : vente au poids/volume/longueur (purs, testables — ADR-114).
// L'unité continue (KG/G/L/ML/CL/M) rend la quantité obligatoire : le vendeur
// la saisit au dialogue « quantité vendue » (poids OU montant), jamais « 1
// par défaut ». Le flux d'ajout (dialogue vs direct) vit dans sell-search.ts.
import { parseDzdInputStrict } from "@domain/money/money.ts";
import { computeLineTotal } from "@domain/sales/sale-rules.ts";
import { quantityForAmountMinor } from "@domain/sales/weight-sale.ts";
import { parseQuantityInput } from "@domain/common/quantity.ts";
import { isMeasuredUnit } from "@domain/units/units.ts";

/**
 * true si le dialogue « quantité vendue » est requis : unité continue ET le
 * vendeur n'a pas déjà tapé la quantité (`2,5*CODE` → sa saisie fait foi).
 */
export function needsQuantityDialog(unitCode: string, explicitQuantity: boolean): boolean {
  return !explicitQuantity && isMeasuredUnit(unitCode);
}

/** Libellé du champ selon l'unité : Poids (KG/G), Volume (L/ML/CL), Longueur (M). */
export function quantityNoun(unitCode: string): string {
  switch (unitCode.trim().toUpperCase()) {
    case "KG":
    case "G":
      return "Poids";
    case "L":
    case "ML":
    case "CL":
      return "Volume";
    case "M":
      return "Longueur";
    default:
      return "Quantité";
  }
}

/**
 * Accord FR du nom de quantité : « Longueur » est féminin (« longueur
 * vendue »), Poids/Volume/Quantité masculins (« poids vendu »).
 */
export function isFeminineQuantityUnit(unitCode: string): boolean {
  return unitCode.trim().toUpperCase() === "M";
}

/**
 * W7 (D-03) : le formatage de quantité est désormais
 * `formatQuantityFr` (`@domain/common/quantity.ts`) — source unique.
 * (La copie locale affichait « 1.5 » au lieu de « 1,5 ».)
 */

export type WeightMode = "quantity" | "amount";

export interface WeightPreview {
  /** Quantité finale (≤ 3 décimales) — c'est ce nombre que reçoit la ligne. */
  qty: number;
  /** Total réellement facturé (centimes).
   *  - mode « poids » : prix × quantité (arrondi exact) ;
   *  - mode « montant » : le MONTANT SAISI (exact) — le poids arrondi au
   *    gramme ne rogne plus la recette (50,00 DZD saisis ⇒ 50,00 DZD
   *    facturés, pas 49,70).
   */
  totalMinor: number;
}

/**
 * Aperçu du dialogue : mode poids → total facturé ; mode montant → quantité
 * calculée + le MONTANT SAISI comme total facturé (exact).
 * null = saisie vide/invalide/insuffisante (jamais de quantité 0).
 */
export function weightDialogPreview(
  mode: WeightMode,
  text: string,
  unitPriceMinor: number,
): WeightPreview | null {
  try {
    if (mode === "quantity") {
      const qty = parseQuantityInput(text);
      if (qty == null) return null;
      return { qty, totalMinor: computeLineTotal(unitPriceMinor, qty) };
    }
    const amountMinor = parseDzdInputStrict(text, "Montant");
    const qty = quantityForAmountMinor(amountMinor, unitPriceMinor);
    if (qty == null) return null;
    // Le montant SAISI est facturé tel quel (la quantité reste l'unité de
    // stock) — ADR-114 révisé : facturer le poids arrondi faisait perdre
    // jusqu'à 0,0005 × prix unitaire par ligne (0,35 DZD sur 700 DZD/kg).
    return { qty, totalMinor: amountMinor };
  } catch {
    // Montant au-delà des bornes monétaires, quantité hors borne… : l'UI
    // affiche « saisie invalide » — jamais d'exception brute à l'écran.
    return null;
  }
}
