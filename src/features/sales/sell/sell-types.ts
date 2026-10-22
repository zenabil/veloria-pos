// Veloria PoS — Vente : types partagés de l'écran caisse (extrait de SellScreen, zéro logique).
// Source unique pour les lignes de recherche, les clients, l'aperçu et le devis.

export interface SearchRow {
  id: number;
  name: string;
  selling_price_minor: number;
  purchase_price_minor: number;
  quantity: number;
  unit_code: string;
  primary_barcode: string | null;
}

export interface CustomerRow {
  id: number;
  first_name: string;
  last_name: string;
  outstanding_balance_minor: number;
  credit_allowed: number;
  /** Plafond du client (centimes). Absent = inconnu (relevé à relire). */
  credit_limit_minor?: number;
}

export interface PreviewLine {
  name: string;
  qty: number;
  unit: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  ref: string;
  /**
   * ADR-131/132 : montant facturé tel que SAISI (mode « Montant »). Quand il
   * est présent, le document affiche « Montant saisi » au lieu de la
   * multiplication quantité × prix unitaire (arithmétiquement fausse dès que
   * la quantité est arrondie). Absent = facturation prix × quantité.
   */
  billedTotalMinor?: number | null | undefined;
}

export interface LastSale {
  invoice: string;
  date: string;
  lines: PreviewLine[];
  subtotalMinor: number;
  discountMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  paidMinor: number;
  customerLabel: string;
  /** Nom imprimé sur le ticket, figé au moment de la vente. */
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCode: string;
  paymentMethod: "cash" | "cheque" | "transfer" | null;
  balances?: { prev: number; current: number } | undefined;
}

export interface ProformaDoc {
  number: string;
  date: string;
  htmlA4: string;
  payload: Record<string, unknown>;
}
