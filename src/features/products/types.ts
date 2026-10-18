// Veloria PoS — Feature Catalogue : types partagés (lignes produit + statuts).
// Les montants restent en centimes (DZD) jusqu'au formatage.
// P3 : les unités viennent du domaine (source unique @domain/units/units.ts).

import { UNIT_CODES } from "@domain/units/units.ts";

export interface Product {
  id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
  unit_code: string;
  purchase_price_minor: number;
  selling_price_minor: number;
  quantity: number;
  min_stock_level: number;
  max_stock_level: number;
  expiration_date: string | null;
  stock_status: string;
  is_active: number;
  primary_barcode: string | null;
}

export interface Category {
  id: number;
  name: string;
}

export type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

export type ProductSort =
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc"
  | "stock_asc"
  | "stock_desc";

export const UNIT_OPTIONS: readonly string[] = UNIT_CODES;

// ADR-114 : les libellés FR vivent dans le domaine (source unique, utilisée
// aussi par le dialogue « quantité vendue » de la Caisse) — ré-exportés ici
// pour compatibilité des imports existants du Catalogue.
export { unitLabel } from "@domain/units/units.ts";

export function isArchived(p: Product): boolean {
  return p.is_active !== 1;
}

export function stockLabel(p: Product): string {
  if (isArchived(p)) return "Archivé";
  if (p.stock_status === "out_of_stock" || p.quantity <= 0) return "Rupture";
  if (p.stock_status === "low_stock") return "Stock bas";
  return "En stock";
}

export function stockTone(p: Product): "green" | "amber" | "red" | "grey" {
  if (isArchived(p)) return "grey";
  if (p.stock_status === "out_of_stock" || p.quantity <= 0) return "red";
  if (p.stock_status === "low_stock") return "amber";
  return "green";
}

export function sortProducts(rows: Product[], sort: ProductSort): Product[] {
  const copy = [...rows];
  switch (sort) {
    case "name_desc":
      return copy.sort((a, b) => b.name.localeCompare(a.name, "fr"));
    case "price_asc":
      return copy.sort((a, b) => a.selling_price_minor - b.selling_price_minor);
    case "price_desc":
      return copy.sort((a, b) => b.selling_price_minor - a.selling_price_minor);
    case "stock_asc":
      return copy.sort((a, b) => a.quantity - b.quantity);
    case "stock_desc":
      return copy.sort((a, b) => b.quantity - a.quantity);
    case "name_asc":
    default:
      return copy.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }
}
