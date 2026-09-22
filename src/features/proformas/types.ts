// Veloria PoS — Feature Proformas : types partagés + helpers purs.
// Les montants restent en centimes (DZD) jusqu'au formatage.

export type ProformaStatus = "draft" | "sent" | "converted" | "cancelled";
export type ProformaStatusFilter = "all" | ProformaStatus;
export type ProformaSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export interface Proforma {
  id: number;
  uuid: string;
  proforma_number: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal_minor: number;
  discount_amount_minor: number;
  delivery_fee_minor: number;
  total_minor: number;
  status: ProformaStatus;
  due_date: string | null;
  notes: string | null;
  terms: string | null;
  converted_sale_id: number | null;
  created_at: string;
  updated_at: string;
}

export function proformaStatusLabel(s: string): string {
  if (s === "draft") return "Brouillon";
  if (s === "sent") return "Envoyé";
  if (s === "converted") return "Converti";
  if (s === "cancelled") return "Annulé";
  return s;
}

export function proformaStatusTone(s: string): "grey" | "blue" | "green" | "red" {
  if (s === "sent") return "blue";
  if (s === "converted") return "green";
  if (s === "cancelled") return "red";
  return "grey";
}

export function isProformaEditable(s: string): boolean {
  return s === "draft";
}

export function isProformaConvertible(s: string): boolean {
  return s === "draft" || s === "sent";
}
