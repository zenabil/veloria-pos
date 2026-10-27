// Veloria PoS — Domain: codes-barres portant un conditionnement (carton).
// Le code ne porte JAMAIS le facteur ni le prix : il désigne le conditionnement
// actif du produit (`product_barcodes.packaging_id`), lu et revalidé en base.

import { DomainError } from "../common/errors.ts";
import { validateBarcode } from "../barcode/barcode-rules.ts";

/** Codes-barres maximum pour un même carton (garde aussi côté IPC). */
export const CARTON_BARCODE_MAX = 20;

/** Plafond du facteur (identique à `packaging-rules` / validation main). */
const MAX_FACTOR = 1_000_000;

/** Liste propre : trim, majuscules (étiquettes Code 39), doublons ignorés. */
export function normalizeCartonBarcodes(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const code = (raw ?? "").trim().toUpperCase();
    if (code === "" || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/** Validation FR d'une liste de codes de carton (déjà normalisée). */
export function validateCartonBarcodes(codes: readonly string[]): void {
  if (codes.length > CARTON_BARCODE_MAX) {
    throw new DomainError("BARCODE_ERROR", `${CARTON_BARCODE_MAX} codes-barres de carton maximum.`);
  }
  for (const code of codes) validateBarcode(code);
}

/**
 * Unités de base ajoutées par UN scan.
 *
 * `barcodePackagingId` est posé par le main UNIQUEMENT quand le code scanné est
 * lié au conditionnement actif du même produit : un code pièce, un code lié à un
 * conditionnement désactivé ou un code étranger renvoient donc 1 unité.
 *
 * Les champs viennent d'une trame IPC (clés éventuellement absentes) : ils
 * acceptent donc `undefined` en plus de `null`.
 */
export function cartonScanUnits(scan: {
  barcodePackagingId?: number | null | undefined;
  packagingFactor?: number | null | undefined;
}): number {
  const bound = scan.barcodePackagingId;
  if (typeof bound !== "number" || !Number.isInteger(bound) || bound <= 0) return 1;
  const factor = Number(scan.packagingFactor);
  if (!Number.isInteger(factor) || factor <= 1 || factor > MAX_FACTOR) return 1;
  return factor;
}
