// Veloria PoS — Feature Retours : types partagés + helpers purs.
// Les montants restent en centimes (DZD) jusqu'au formatage.

export type ReturnKind = "customer" | "supplier";
export type ReturnStatus = "validated" | "partially_refunded" | "refunded" | "cancelled";
export type ReturnTypeFilter = "all" | "customer" | "supplier";
export type ReturnStatusFilter = "all" | ReturnStatus;
export type ReturnSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
export type ItemCondition = "good" | "defective";

export interface ReturnRow {
  kind: ReturnKind;
  entity_id: number;
  number: string | null;
  created_at: string;
  ref: string;
  party_name: string;
  total_minor: number;
  settled_minor: number;
  status: ReturnStatus;
  stock_qty: number;
}

export interface ReturnLine {
  product_id: number | null;
  product_name_snapshot: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  restocked?: number;
  condition: ItemCondition;
  stock_before: number | null;
  stock_after: number | null;
}

export interface ReturnDetailData {
  header: Record<string, string | number | null>;
  items: ReturnLine[];
  party: Record<string, string | number | null> | null;
}

export function returnKindLabel(kind: ReturnKind): string {
  return kind === "customer" ? "Retour client" : "Retour fournisseur";
}

export function returnStatusLabel(status: string): string {
  if (status === "partially_refunded") return "Partiellement remboursé";
  if (status === "refunded") return "Remboursé";
  if (status === "cancelled") return "Annulé";
  return "Validé";
}

export function returnStatusTone(status: string): "green" | "amber" | "red" | "grey" {
  if (status === "refunded") return "green";
  if (status === "partially_refunded") return "amber";
  if (status === "cancelled") return "red";
  return "grey";
}

export function conditionLabel(condition: string): string {
  return condition === "defective" ? "Défectueux" : "Bon état";
}

export function returnNumber(kind: ReturnKind, n: string | null, id: number): string {
  if (n) return n;
  return `${kind === "customer" ? "RET-C" : "RET-S"}-${String(id).padStart(5, "0")}`;
}

export function rowKey(r: ReturnRow): string {
  return `${r.kind}:${r.entity_id}`;
}
