// Veloria PoS — Feature Fournisseurs : types partagés + helpers purs.
// Les montants restent en centimes (DZD) jusqu'au formatage.

export interface Supplier {
  id: number;
  uuid: string;
  code: string | null;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  commercial_register: string | null;
  notes: string | null;
  is_active: number;
  initial_balance_minor: number;
  outstanding_balance_minor: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Ligne enrichie par la recherche (totaux calculés côté main). */
export interface EnrichedSupplier extends Supplier {
  total_purchases_minor: number;
  total_paid_minor: number;
  last_intake_at: string | null;
  intake_count: number;
}

export interface StatementIntake {
  id: number;
  uuid: string;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal_minor: number;
  shipping_cost_minor: number;
  total_minor: number;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface StatementIntakeItem {
  stock_intake_id: number;
  product_id: number | null;
  product_name_snapshot: string;
  quantity_received: number;
  quantity_damaged: number;
  purchase_price_minor: number;
  landing_cost_minor: number;
}

export interface StatementPayment {
  id: number;
  amount_minor: number;
  method: string;
  reference: string | null;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export type SupplierStatusFilter = "all" | "active" | "inactive";
export type SupplierPaymentFilter = "all" | "with_debt" | "settled";
export type SupplierSort =
  | "name_asc"
  | "name_desc"
  | "purchases_desc"
  | "debt_desc"
  | "recent_desc";

export function isSupplierActive(s: Supplier): boolean {
  return s.is_active === 1;
}

export function hasSupplierDebt(s: Supplier): boolean {
  return s.outstanding_balance_minor > 0;
}

export function supplierCode(s: Supplier): string {
  return s.code?.trim() !== "" && s.code != null ? s.code : `FOU-${String(s.id).padStart(5, "0")}`;
}

export function supplierStatusLabel(s: Supplier): string {
  if (!isSupplierActive(s)) return "Inactif";
  if (hasSupplierDebt(s)) return "Dette en cours";
  return "Actif";
}

export function supplierStatusTone(s: Supplier): "green" | "amber" | "grey" {
  if (!isSupplierActive(s)) return "grey";
  if (hasSupplierDebt(s)) return "amber";
  return "green";
}

export { PAYMENT_METHOD_LABELS } from "@shared/formatters/format.ts";

export function intakeStatusLabel(status: string): string {
  if (status === "committed") return "Validée";
  if (status === "draft") return "Brouillon";
  if (status === "cancelled") return "Annulée";
  return status;
}

export function intakeStatusTone(status: string): "green" | "amber" | "grey" {
  if (status === "committed") return "green";
  if (status === "draft") return "amber";
  return "grey";
}

export function intakeNumber(i: StatementIntake): string {
  if (i.invoice_number?.trim()) return i.invoice_number;
  return `BON-${String(i.id).padStart(5, "0")}`;
}
