// Veloria PoS — Caisse : vente au poids/volume/longueur (purs, testables — ADR-114).
// L'unité continue (KG/G/L/ML/CL/M) rend la quantité obligatoire : le vendeur
// la saisit au dialogue « quantité vendue » (poids OU montant), jamais « 1
// par défaut ». Le flux d'ajout (dialogue vs direct) vit dans sell-search.ts.
import { parseDzdInputStrict } from "@domain/money/money.ts";
import { computeLineTotal } from "@domain/sales/sale-rules.ts";
import { parseQuantityInput, quantityForAmountMinor } from "@domain/sales/weight-sale.ts";
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

/** Quantité FR sans zéros parasites : 1.5 → « 1,5 » ; 1.235 → « 1,235 ». */
export function formatQtyFr(q: number): string {
  return String(Math.round(q * 1000) / 1000).replace(".", ",");
}

export type WeightMode = "quantity" | "amount";

export interface WeightPreview {
  /** Quantité finale (≤ 3 décimales) — c'est ce nombre que reçoit la ligne. */
  qty: number;
  /** Total réellement facturé (centimes) à cette quantité (arrondi exact). */
  totalMinor: number;
}

/**
 * Aperçu du dialogue : mode poids → total facturé ; mode montant → quantité
 * calculée + total EXACT arrondi (l'UI affiche ce total, jamais le montant
 * brut). null = saisie vide/invalide/insuffisante (jamais de quantité 0).
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
    return { qty, totalMinor: computeLineTotal(unitPriceMinor, qty) };
  } catch {
    // Montant au-delà des bornes monétaires, quantité hors borne… : l'UI
    // affiche « saisie invalide » — jamais d'exception brute à l'écran.
    return null;
  }
}
