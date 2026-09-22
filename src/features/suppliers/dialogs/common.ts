// Veloria PoS — Fournisseurs : helpers partagés des dialogues (P4).
// Totaux utilisés par le détail ET l'historique (source unique).
import type { SupplierStatement } from "../SuppliersScreen.tsx";

export function totalPurchases(st: SupplierStatement): number {
  return st.intakes.filter((i) => i.status !== "cancelled").reduce((a, i) => a + i.total_minor, 0);
}

export function totalPaid(st: SupplierStatement): number {
  return st.payments.reduce((a, p) => a + p.amount_minor, 0);
}
