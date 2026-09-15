// Veloria PoS — Domain: product rules.

import { DomainError } from "../common/errors.ts";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface ProductDraft {
  name: string;
  categoryId: number | null;
  unitCode: string;
  purchasePriceMinor: number;
  sellingPriceMinor: number;
  quantity: number;
  minStockLevel: number;
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
  if (!Number.isInteger(d.purchasePriceMinor) || d.purchasePriceMinor < 0) {
    throw new DomainError("PRODUCT_ERROR", "Prix d'achat invalide.");
  }
  if (!Number.isInteger(d.sellingPriceMinor) || d.sellingPriceMinor < 0) {
    throw new DomainError("PRODUCT_ERROR", "Prix de vente invalide.");
  }
  if (!Number.isFinite(d.quantity)) {
    throw new DomainError("PRODUCT_ERROR", "Quantité invalide.");
  }
  if (d.quantity < 0) {
    throw new DomainError("PRODUCT_ERROR", "Quantité négative interdite sauf paramètre explicite.");
  }
  if (!Number.isFinite(d.minStockLevel) || d.minStockLevel < 0) {
    throw new DomainError("PRODUCT_ERROR", "Seuil de stock invalide.");
  }
  const seen = new Set<string>();
  for (const b of d.barcodes) {
    const t = b.trim();
    if (t.length === 0) throw new DomainError("PRODUCT_ERROR", "Code-barres vide.");
    if (seen.has(t)) throw new DomainError("PRODUCT_ERROR", "Code-barres dupliqué.");
    seen.add(t);
  }
}

export function computeStockStatus(quantity: number, minLevel: number): StockStatus {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= minLevel) return "low_stock";
  return "in_stock";
}
