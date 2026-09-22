// Veloria PoS — Feature Pain : types partagés + helpers purs.
// Les montants restent en centimes (DZD) jusqu'au formatage.

export type BreadOrderStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";
export type BreadStatusFilter = "all" | BreadOrderStatus;
export type BreadSort = "pickup_asc" | "pickup_desc" | "date_desc" | "amount_desc";

export interface BreadOrder {
  id: number;
  uuid: string;
  order_number: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  custom_name: string | null;
  custom_phone: string | null;
  bread_type: string;
  order_name: string | null;
  is_recurring: number | null;
  order_date: string;
  pickup_date: string;
  pickup_time: string | null;
  quantity: number;
  unit_price_minor: number;
  total_amount_minor: number;
  amount_paid_minor: number;
  remaining_amount_minor: number;
  payment_status: string;
  payment_method: string | null;
  pickup_status: string;
  order_status: BreadOrderStatus;
  is_delivered: number;
  is_paid: number;
  notes: string | null;
  transferred_to_customer_account: number;
  transferred_at: string | null;
  sale_id: number | null;
  created_at: string;
  updated_at: string;
}

export type BreadRecurringFilter = "all" | "recurring" | "once";

export function orderCustomerName(o: BreadOrder): string {
  return o.customer_name ?? o.custom_name ?? "—";
}

export function orderDisplayName(o: BreadOrder): string {
  const n = (o.order_name ?? "").trim();
  if (n.length > 0) return n;
  return o.bread_type || "Pain";
}

export function isRecurringOrder(o: BreadOrder): boolean {
  return Number(o.is_recurring ?? 0) === 1;
}

export function orderStatusLabel(s: string): string {
  if (s === "new") return "Nouvelle";
  if (s === "confirmed") return "Confirmée";
  if (s === "preparing") return "En préparation";
  if (s === "ready") return "Prête";
  if (s === "delivered") return "Livrée";
  if (s === "cancelled") return "Annulée";
  return s;
}

export function orderStatusTone(s: string): "grey" | "blue" | "amber" | "green" | "red" {
  if (s === "ready") return "amber";
  if (s === "delivered") return "green";
  if (s === "cancelled") return "red";
  if (s === "new") return "grey";
  return "blue";
}

export function paymentStatusLabel(s: string): string {
  if (s === "paid") return "Payée";
  if (s === "partial") return "Partielle";
  return "Impayée";
}

export const NEXT_STATUSES: Record<string, BreadOrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};
