// Veloria PoS — Domain: unités de mesure (framework-free).
// P3 : table de conversion métrique (KG↔G, L↔ML/CL). Les unités logistiques
// (CARTON/PAQUET/PIECE…) n'ont pas de facteur fixe → null (jamais deviné).
// `validateProductDraft` exige un code connu ; la conversion sert aux
// affichages/rapports (pas de mutation silencieuse).

import { DomainError } from "../common/errors.ts";

export const UNIT_CODES = [
  "PIECE",
  "KG",
  "G",
  "L",
  "ML",
  "CL",
  "M",
  "CARTON",
  "PAQUET",
  "AUTRE",
] as const;
export type UnitCode = (typeof UNIT_CODES)[number];

/**
 * ADR-114 : unités de mesure CONTINUES (poids/volume/longueur) — vendues au
 * poids exact : la quantité décimale est saisie par le vendeur, jamais « 1
 * par défaut » à la caisse.
 */
export const MEASURED_UNIT_CODES = ["KG", "G", "L", "ML", "CL", "M"] as const;

/** true si l'unité est continue (kg, g, l, ml, cl, m) — casse/espaces tolérés. */
export function isMeasuredUnit(code: string): boolean {
  const v = code.trim().toUpperCase();
  return (MEASURED_UNIT_CODES as readonly string[]).includes(v);
}

/**
 * Libellés FR des unités — SOURCE UNIQUE (le Catalogue `products/types.ts` la
 * ré-exporte pour compatibilité). Utilisée par les écrans et le dialogue
 * « quantité vendue » (ADR-114).
 */
export const UNIT_LABELS: Record<string, string> = {
  PIECE: "Pièce",
  KG: "Kilogramme",
  G: "Gramme",
  L: "Litre",
  ML: "Millilitre",
  CL: "Centilitre",
  M: "Mètre",
  CARTON: "Carton",
  PAQUET: "Paquet",
  AUTRE: "Autre",
};

export function unitLabel(code: string): string {
  return UNIT_LABELS[code] ?? code;
}

/** Facteur vers l'unité de base (G pour masses, ML pour volumes, 1 sinon) — null si inconvertible. */
const TO_BASE: Record<string, { base: string; factor: number } | null> = {
  KG: { base: "G", factor: 1000 },
  G: { base: "G", factor: 1 },
  L: { base: "ML", factor: 1000 },
  CL: { base: "ML", factor: 10 },
  ML: { base: "ML", factor: 1 },
  PIECE: null,
  M: null,
  CARTON: null,
  PAQUET: null,
  AUTRE: null,
};

export function normalizeUnitCodeStrict(raw: string): UnitCode {
  const v = raw.trim().toUpperCase();
  const found = (UNIT_CODES as readonly string[]).find((u) => u === v);
  if (!found) throw new DomainError("PRODUCT_ERROR", "Unité invalide.");
  return found as UnitCode;
}

/** Convertit une quantité entre deux unités compatibles (null si impossible). */
export function convertQuantity(qty: number, from: string, to: string): number | null {
  if (!Number.isFinite(qty) || qty < 0) return null;
  let f: { base: string; factor: number } | null = null;
  let t: { base: string; factor: number } | null = null;
  try {
    const fc = normalizeUnitCodeStrict(from);
    const tc = normalizeUnitCodeStrict(to);
    f = TO_BASE[fc] ?? null;
    t = TO_BASE[tc] ?? null;
  } catch {
    return null;
  }
  if (!f || !t || f.base !== t.base) return null;
  const out = Math.round(((qty * f.factor) / t.factor) * 1000) / 1000;
  return Number.isFinite(out) ? out : null;
}
