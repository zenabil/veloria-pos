// Veloria PoS — Feature Historique : types partagés + helpers purs.
// Miroir local des 17 sortes (frontière renderer/main : pas d'import electron/).
// Les montants restent en centimes (DZD) jusqu'au formatage.

export type HistoryKind =
  | "sale"
  | "purchase"
  | "payment_in"
  | "payment_out"
  | "stock_in"
  | "stock_out"
  | "stock_correct"
  | "stock_inventory"
  | "product_create"
  | "product_update"
  | "product_delete"
  | "customer_create"
  | "customer_update"
  | "customer_delete"
  | "supplier_create"
  | "supplier_update"
  | "supplier_delete";

export type HistoryOpFilter =
  | "all"
  | "sale"
  | "purchase"
  | "payment_in"
  | "payment_out"
  | "stock_in"
  | "stock_out"
  | "stock_correct"
  | "stock_inventory"
  | "product_create"
  | "product_update"
  | "product_delete"
  | "customer_create"
  | "customer_update"
  | "customer_delete"
  | "supplier_create"
  | "supplier_update"
  | "supplier_delete";

export type HistorySort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
export type HistoryUserFilter = "all" | "caisse";

export interface HistoryRow {
  kind: HistoryKind;
  entity_id: number;
  ref: string;
  label: string;
  entity_type: string;
  entity_name: string | null;
  amount_minor: number | null;
  method: string | null;
  status: string;
  created_at: string;
  stock_before: number | null;
  stock_delta: number | null;
  stock_after: number | null;
}

export interface HistoryDetail {
  kind: HistoryKind;
  title: string;
  reference: string;
  createdAt: string;
  status: string;
  user: string;
  info: { label: string; value: string }[];
  entity: { type: string; name: string; id: number } | null;
  financial: { amount: number; method: string | null; extra: string | null } | null;
  stock: { before: number; delta: number; after: number } | null;
  ticketSaleId: number | null;
}

export const KIND_LABELS: Record<HistoryKind, string> = {
  sale: "Vente",
  purchase: "Achat",
  payment_in: "Paiement client",
  payment_out: "Paiement fournisseur",
  stock_in: "Entrée stock",
  stock_out: "Sortie stock",
  stock_correct: "Correction stock",
  stock_inventory: "Inventaire",
  product_create: "Création produit",
  product_update: "Modification produit",
  product_delete: "Suppression produit",
  customer_create: "Création client",
  customer_update: "Modification client",
  customer_delete: "Suppression client",
  supplier_create: "Création fournisseur",
  supplier_update: "Modification fournisseur",
  supplier_delete: "Suppression fournisseur",
};

export const OP_FILTERS: { value: HistoryOpFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "sale", label: "Vente" },
  { value: "purchase", label: "Achat" },
  { value: "payment_in", label: "Paiement client" },
  { value: "payment_out", label: "Paiement fournisseur" },
  { value: "stock_in", label: "Entrée stock" },
  { value: "stock_out", label: "Sortie stock" },
  { value: "stock_correct", label: "Correction stock" },
  { value: "stock_inventory", label: "Inventaire" },
  { value: "product_create", label: "Création produit" },
  { value: "product_update", label: "Modification produit" },
  { value: "product_delete", label: "Suppression produit" },
  { value: "customer_create", label: "Création client" },
  { value: "customer_update", label: "Modification client" },
  { value: "customer_delete", label: "Suppression client" },
  { value: "supplier_create", label: "Création fournisseur" },
  { value: "supplier_update", label: "Modification fournisseur" },
  { value: "supplier_delete", label: "Suppression fournisseur" },
];

export function kindTone(kind: HistoryKind): "green" | "amber" | "red" | "grey" | "blue" {
  if (kind === "sale" || kind === "payment_in") return "green";
  if (kind === "purchase" || kind === "payment_out") return "amber";
  if (kind === "stock_out") return "red";
  if (kind.endsWith("_delete")) return "red";
  if (kind === "stock_in" || kind === "stock_inventory") return "blue";
  return "grey";
}

export function rowKey(r: HistoryRow): string {
  return `${r.kind}:${r.entity_id}`;
}

export function splitDateTime(iso: string): { date: string; time: string } {
  if (iso.length >= 16 && iso[10] === "T") {
    return { date: iso.slice(0, 10), time: iso.slice(11, 16).replace(":", "h") };
  }
  return { date: iso.slice(0, 10), time: "—" };
}

/** Poste unique : voir CASHIER_LABEL partagé (P2 : HISTORY_USER supprimé). */
