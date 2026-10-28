// Veloria PoS — Feature Stock : types partagés + helpers purs.
// Les montants restent en centimes (DZD), les quantités en décimal, jusqu'au formatage.

export interface StockRow {
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
  stock_status: string;
  is_active: number;
  primary_barcode: string | null;
  stock_value_minor: number;
  last_movement_at: string | null;
}

export interface StockMovement {
  id: number;
  movement_type: string;
  quantity_delta: number;
  quantity_after: number;
  quantity_before: number;
  unit_cost_minor: number | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  reason: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export type StockStatusFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";
export type StockMovementFilter =
  | "all"
  | "sale_out"
  | "sale_cancel_in"
  | "intake_in"
  | "adjust_in"
  | "adjust_out"
  | "return_in"
  | "damage_out";
export type StockSort =
  "name_asc" | "name_desc" | "qty_asc" | "qty_desc" | "value_desc" | "recent_desc";

export function stockStatusLabel(status: string): string {
  if (status === "low_stock") return "Stock bas";
  if (status === "out_of_stock") return "Rupture";
  return "En stock";
}

export function stockStatusTone(status: string): "green" | "amber" | "red" {
  if (status === "low_stock") return "amber";
  if (status === "out_of_stock") return "red";
  return "green";
}

export function maxStockLabel(maxLevel: number): string {
  return maxLevel > 0 ? String(maxLevel) : "—";
}

/**
 * Numéro de facture fournisseur suggéré à la sélection du fournisseur
 * (champ reste modifiable) : `BL-{CODE}-{AAAAMMJJ}`.
 * `invoice_number` n'a pas de contrainte d'unicité : la suggestion est
 * un confort de saisie, jamais une règle métier.
 */
export function suggestIntakeInvoiceNumber(
  supplierCode: string | null | undefined,
  at: Date = new Date(),
): string {
  const code = (supplierCode ?? "").trim().replace(/\s+/g, "-").toUpperCase() || "FRS";
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `BL-${code}-${y}${m}${d}`;
}
