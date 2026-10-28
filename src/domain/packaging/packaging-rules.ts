// Veloria PoS — Domain: tarification carton + conversion en unités de base.
// Le stock, le FIFO et les rapports restent TOUJOURS en unités de base
// (pièces). Le conditionnement ne change que le découpage des lignes de vente
// et l'allocation du coût d'achat.

import { DomainError } from "../common/errors.ts";
import { roundQuantity } from "../common/quantity.ts";
import {
  assertSafeMinor,
  assertSafeTotal,
  multiplyMinorByQuantity,
  sumSafeMinors,
} from "../money/money.ts";

export interface QuantitySplit {
  cartons: number;
  pieces: number;
}

export interface PackagingPricedLine {
  quantity: number;
  unitFactor: number;
  unitPriceMinor: number;
  originalUnitPriceMinor: number;
  billedTotalMinor: null;
  isCarton: boolean;
}

export interface PackagingPriceResult {
  lines: PackagingPricedLine[];
  cartons: number;
  pieces: number;
  cartonApplied: boolean;
  savingsMinor: number;
  pieceTotalMinor: number;
  totalMinor: number;
}

export interface UnitCostTier {
  quantity: number;
  unitCostMinor: number;
}

function assertFactor(factor: number): void {
  if (!Number.isInteger(factor) || factor <= 1) {
    throw new DomainError("PRODUCT_ERROR", "Taille du carton invalide (entier supérieur à 1).");
  }
}

function assertQty(qty: number): void {
  if (!Number.isFinite(qty) || qty < 0) {
    throw new DomainError("QUANTITY_ERROR", "Quantité invalide.");
  }
}

/**
 * Découpe une quantité en unités de base en cartons complets + reste.
 * `15` avec un facteur `12` → `{ cartons: 1, pieces: 3 }`.
 */
export function splitQuantityByCarton(qty: number, factor: number): QuantitySplit {
  assertFactor(factor);
  assertQty(qty);
  const rounded = roundQuantity(qty);
  if (rounded <= 0) return { cartons: 0, pieces: 0 };
  const cartons = Math.floor(rounded / factor);
  let pieces = roundQuantity(rounded - cartons * factor);
  // Garde d'arrondi : un reste négatif ou égal au facteur ne doit jamais fuir.
  if (pieces < 0) pieces = 0;
  if (pieces >= factor) {
    return { cartons: cartons + 1, pieces: 0 };
  }
  return { cartons, pieces };
}

/**
 * Tarification d'une ligne caisse. Une ligne carton utilise :
 * - `unitPriceMinor = prix carton` ;
 * - `originalUnitPriceMinor = prix pièce × facteur` (référence remise) ;
 * - `quantity = nombre de cartons`, `unitFactor = facteur`.
 * Le reste éventuel est facturé au prix pièce.
 *
 * Le tarif carton s'applique dès que la quantité atteint le facteur et que le
 * carton est STRICTEMENT moins cher que `factor × prix pièce`. L'ancien
 * plancher `(factor−1) × prix pièce` est supprimé (ADR-141) : un tarif de gros
 * réel peut créer une baisse au seuil (ex. 29 pièces = 725 DZD, 1 carton de 30
 * = 650 DZD). Un carton plus cher qu'un plein au prix pièce reste ignoré.
 */
export function priceSaleLine(input: {
  qty: number;
  unitPriceMinor: number;
  cartonPriceMinor: number;
  factor: number;
  auto: boolean;
}): PackagingPriceResult {
  assertQty(input.qty);
  assertFactor(input.factor);
  assertSafeMinor(input.unitPriceMinor, { label: "Prix unitaire invalide" });
  assertSafeMinor(input.cartonPriceMinor, { label: "Prix carton invalide" });
  const qty = roundQuantity(input.qty);
  if (qty <= 0) {
    throw new DomainError("QUANTITY_ERROR", "La quantité doit être supérieure à zéro.");
  }

  const pieceTotalMinor = multiplyMinorByQuantity(input.unitPriceMinor, qty);
  const pieceLine: PackagingPricedLine = {
    quantity: qty,
    unitFactor: 1,
    unitPriceMinor: input.unitPriceMinor,
    originalUnitPriceMinor: input.unitPriceMinor,
    billedTotalMinor: null,
    isCarton: false,
  };
  const packTotalMinor = multiplyMinorByQuantity(input.unitPriceMinor, input.factor);
  // Seule borne conservée : le carton doit être une remise sur le plein au
  // prix pièce. Le plancher (facteur−1) est volontairement retiré (ADR-141).
  const cartonAdvantageous = input.cartonPriceMinor < packTotalMinor;
  if (!input.auto || qty < input.factor || !cartonAdvantageous) {
    return {
      lines: [pieceLine],
      cartons: 0,
      pieces: qty,
      cartonApplied: false,
      savingsMinor: 0,
      pieceTotalMinor,
      totalMinor: pieceTotalMinor,
    };
  }

  const { cartons, pieces } = splitQuantityByCarton(qty, input.factor);
  const lines: PackagingPricedLine[] = [
    {
      quantity: cartons,
      unitFactor: input.factor,
      unitPriceMinor: input.cartonPriceMinor,
      originalUnitPriceMinor: packTotalMinor,
      billedTotalMinor: null,
      isCarton: true,
    },
  ];
  if (pieces > 0) {
    lines.push({
      quantity: pieces,
      unitFactor: 1,
      unitPriceMinor: input.unitPriceMinor,
      originalUnitPriceMinor: input.unitPriceMinor,
      billedTotalMinor: null,
      isCarton: false,
    });
  }
  const totalMinor = sumSafeMinors(
    lines.map((l) => multiplyMinorByQuantity(l.unitPriceMinor, l.quantity)),
    "Total de ligne invalide",
  );
  return {
    lines,
    cartons,
    pieces,
    cartonApplied: true,
    savingsMinor: pieceTotalMinor - totalMinor,
    pieceTotalMinor,
    totalMinor,
  };
}

/**
 * Coûts unitaires (centimes entiers) pour répartir un total sur des unités de
 * base. Méthode du plus grand reste compacte : au plus DEUX paliers.
 *
 * Ex. 10 000 centimes sur 3 pièces → `[3333, 3334]` (2 pièces à 3333 et
 * 1 pièce à 3334). `allocateUnitCostLayers` porte les quantités associées et
 * garantit Σ(quantité × coût) = total.
 */
export function allocateUnitCosts(totalMinor: number, baseQty: number): number[] {
  const tiers = allocateUnitCostLayers(totalMinor, baseQty);
  return [...new Set(tiers.map((t) => t.unitCostMinor))].sort((a, b) => a - b);
}

export function allocateUnitCostLayers(totalMinor: number, baseQty: number): UnitCostTier[] {
  assertSafeTotal(totalMinor, "Total d'achat invalide");
  if (!Number.isFinite(baseQty) || baseQty <= 0) {
    throw new DomainError("QUANTITY_ERROR", "Quantité nette d'achat invalide.");
  }
  const qty = roundQuantity(baseQty);
  const unitCost = Math.floor(totalMinor / qty);
  const residualMinor = Math.round((totalMinor - unitCost * qty) * 1000) / 1000;
  const tiers: UnitCostTier[] = [];
  const lowQty = roundQuantity(qty - residualMinor);
  if (lowQty > 0) tiers.push({ quantity: lowQty, unitCostMinor: unitCost });
  if (residualMinor > 0) tiers.push({ quantity: residualMinor, unitCostMinor: unitCost + 1 });
  // Invariant de répartition : la somme des paliers reproduit le total payé.
  const check = Math.round(tiers.reduce((a, t) => a + t.quantity * t.unitCostMinor, 0));
  if (check !== totalMinor) {
    throw new DomainError("MONEY_ERROR", "Répartition du coût d'achat incohérente.");
  }
  return tiers;
}
