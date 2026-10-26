// Veloria PoS — Domain: conversion prix pièce ↔ prix carton (framework-free).
// Le formulaire produit utilise ces règles pour que la saisie d'un côté
// recalcule automatiquement l'autre, sans jamais dépasser un montant sûr.

import { MAX_MINOR_SINGLE } from "../money/money.ts";

function validMinor(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MINOR_SINGLE;
}

function validFactor(factor: number): boolean {
  return Number.isSafeInteger(factor) && factor > 1;
}

/** Prix carton = prix pièce × facteur (centimes, exact). */
export function cartonPriceFromUnit(unitPriceMinor: number, factor: number): number | null {
  if (!validMinor(unitPriceMinor) || !validFactor(factor)) return null;
  const total = unitPriceMinor * factor;
  return validMinor(total) ? total : null;
}

/**
 * Prix pièce = prix carton ÷ facteur, arrondi au centime le plus proche.
 * Le résultat est une valeur d'affichage/saisie : le total carton reste la
 * référence commerciale saisie par l'utilisateur.
 */
export function unitPriceFromCarton(cartonPriceMinor: number, factor: number): number | null {
  if (!validMinor(cartonPriceMinor) || !validFactor(factor)) return null;
  const unit = Math.round(cartonPriceMinor / factor);
  return validMinor(unit) ? unit : null;
}
