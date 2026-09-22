// Veloria PoS — Domain: product rules.

import { DomainError } from "../common/errors.ts";
import { assertValidQuantity } from "../common/quantity.ts";
import { assertSafeMinor } from "../money/money.ts";
import { isRealCalendarDate } from "../common/dates.ts";
import { normalizeUnitCodeStrict } from "../units/units.ts";
import { validateBarcode } from "../barcode/barcode-rules.ts";

export interface ProductDraft {
  name: string;
  categoryId: number | null;
  unitCode: string;
  purchasePriceMinor: number;
  sellingPriceMinor: number;
  quantity: number;
  minStockLevel: number;
  /** 0 = aucun plafond (optionnel, page Stock). */
  maxStockLevel?: number;
  expirationDate: string | null;
  supplierId: number | null;
  barcodes: string[];
}

const UNIT_CODES = ["PIECE", "KG", "G", "L", "ML", "M", "CARTON", "PAQUET", "AUTRE"] as const;
export type UnitCode = (typeof UNIT_CODES)[number];

export function normalizeUnitCode(raw: string): string {
  const v = raw.trim().toUpperCase();
  if (v.length === 0) return "PIECE";
  if (!UNIT_CODES.includes(v as UnitCode)) {
    throw new DomainError("PRODUCT_ERROR", "Unité invalide.");
  }
  return v;
}

export function validateProductDraft(d: ProductDraft): void {
  if (d.name.trim().length < 2) {
    throw new DomainError("PRODUCT_ERROR", "Le nom du produit est requis (2 caractères min).");
  }
  if (d.name.trim().length > 200) {
    throw new DomainError("PRODUCT_ERROR", "Le nom du produit est trop long.");
  }
  // P3 : unité connue (jamais de code libre silencieux).
  normalizeUnitCodeStrict(d.unitCode);
  assertSafeMinor(d.purchasePriceMinor, { label: "Prix d'achat invalide" });
  assertSafeMinor(d.sellingPriceMinor, { label: "Prix de vente invalide" });
  // P3 : péremption calendaire réelle ou null (jamais de date impossible).
  if (d.expirationDate !== null && !isRealCalendarDate(d.expirationDate)) {
    throw new DomainError("PRODUCT_ERROR", "Date de péremption invalide.");
  }
  // M-7: unified quantity limits (MAX 1M + 3 decimals, same as sales/intake).
  assertValidQuantity(d.quantity, { allowZero: true });
  assertValidQuantity(d.minStockLevel, { allowZero: true });
  const maxLevel = d.maxStockLevel ?? 0;
  assertValidQuantity(maxLevel, { allowZero: true });
  if (maxLevel > 0 && maxLevel < d.minStockLevel) {
    throw new DomainError("PRODUCT_ERROR", "Stock maximum incohérent (sous le seuil).");
  }
  const seen = new Set<string>();
  for (const b of d.barcodes) {
    const t = b.trim();
    if (t.length === 0) throw new DomainError("PRODUCT_ERROR", "Code-barres vide.");
    if (t.length > 64) throw new DomainError("PRODUCT_ERROR", "Code-barres trop long (max 64).");
    if (seen.has(t)) throw new DomainError("PRODUCT_ERROR", "Code-barres dupliqué.");
    // P3 : contrôle EAN-8/13 quand applicable (autres formats acceptés).
    validateBarcode(t);
    seen.add(t);
  }
}
