// Veloria PoS — Domain: vente au poids/volume (pur, sans framework — ADR-114).
// Pour une unité continue (KG/G/L/ML/CL/M), le vendeur saisit le POIDS ou le
// MONTANT de la quantité vendue ; ces règles de conversion sont la source
// unique (testée), la couche UI n'en contient aucune.

import { MAX_QUANTITY, roundQuantity } from "../common/quantity.ts";

/**
 * Parse une quantité saisie (virgule FR acceptée, ex. « 1,5 »), arrondie à
 * 3 décimales (précision g/kg — même règle que `assertValidQuantity`).
 * null si vide, non numérique, ≤ 0 ou > 1 000 000 : jamais de quantité 0
 * silencieuse (l'appelant affiche un message FR).
 */
export function parseQuantityInput(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(",", ".").trim();
  // Décimal simple uniquement : rejette « 1e3 », « 0x10 », « +5 »… (Number()
  // les accepterait — jamais voulu pour une saisie de caisse).
  if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_QUANTITY) return null;
  const qty = roundQuantity(n);
  return qty > 0 ? qty : null;
}

/**
 * Quantité vendue correspondant à un montant saisi : `quantité = montant ÷
 * prix unitaire`, arrondie à 3 décimales. null si le montant ou le prix n'est
 * pas un entier de centimes strictement positif, si la quantité arrondie tombe
 * à 0 (montant trop petit, ex. 1 centime à 450,00 DZD/kg) ou dépasse la borne
 * des quantités. Le total réellement facturé = `computeLineTotal(prix, qty)` ;
 * il peut différer du montant saisi de ≤ 0,0005 × prix unitaire (arrondi de la
 * quantité à 3 décimales) — l'UI affiche TOUJOURS ce total exact, jamais le
 * montant brut.
 */
export function quantityForAmountMinor(amountMinor: number, unitPriceMinor: number): number | null {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return null;
  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor <= 0) return null;
  const qty = roundQuantity(amountMinor / unitPriceMinor);
  if (qty <= 0 || qty > MAX_QUANTITY) return null;
  return qty;
}
