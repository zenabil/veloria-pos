// Veloria PoS — Feature Dépenses : types partagés + helpers purs.
// Les montants restent en centimes (DZD) jusqu'au formatage.

export type ExpenseStatus = "paid" | "pending";
export type ExpenseStatusFilter = "all" | ExpenseStatus;
export type ExpenseMethodFilter = "all" | "cash" | "cheque" | "transfer";
export type ExpenseSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export interface Expense {
  id: number;
  uuid: string;
  description: string;
  category: string;
  amount_minor: number;
  expense_date: string;
  supplier_id: number | null;
  supplier_name: string | null;
  payment_method: string | null;
  status: ExpenseStatus;
  reference: string | null;
  notes: string | null;
  receipt_path: string | null;
  created_at: string;
  updated_at: string;
}

export function expenseNumber(id: number): string {
  return `DEP-${String(id).padStart(5, "0")}`;
}

export function expenseStatusLabel(status: string): string {
  return status === "pending" ? "En attente" : "Payée";
}

export function expenseStatusTone(status: string): "green" | "amber" {
  return status === "pending" ? "amber" : "green";
}

export { paymentMethodLabel } from "@shared/formatters/format.ts";
