// Veloria PoS — Feature Rapports : types partagés.
// Les montants restent en centimes (DZD) jusqu'au formatage.

export type ReportSection =
  | "all"
  | "sales"
  | "purchases"
  | "profit"
  | "expenses"
  | "stock"
  | "customerDebt"
  | "supplierDebt"
  | "payments"
  | "returns"
  | "closings";

export interface ReportBucket {
  date: string;
  sales: number;
  purchases: number;
  expenses: number;
  profit: number;
}

export interface ReportTop {
  name: string;
  total: number;
  qty?: number;
}

export interface ReportSummary {
  from: string;
  to: string;
  weekly: boolean;
  kpis: {
    salesMinor: number;
    salesCount: number;
    purchasesMinor: number;
    purchasesCount: number;
    expensesMinor: number;
    profitMinor: number;
    customerDebtMinor: number;
    supplierDebtMinor: number;
  };
  buckets: ReportBucket[];
  tops: {
    customers: ReportTop[];
    suppliers: ReportTop[];
    products: ReportTop[];
  };
  payments: { inMinor: number; outMinor: number };
  returns: { count: number; amountMinor: number };
}

export const REPORT_SECTIONS: { value: ReportSection; label: string }[] = [
  { value: "all", label: "Tout le rapport" },
  { value: "sales", label: "Ventes" },
  { value: "purchases", label: "Achats" },
  { value: "profit", label: "Bénéfices" },
  { value: "expenses", label: "Dépenses" },
  { value: "stock", label: "Stock" },
  { value: "customerDebt", label: "Dettes clients" },
  { value: "supplierDebt", label: "Dettes fournisseurs" },
  { value: "payments", label: "Paiements" },
  { value: "returns", label: "Retours" },
  { value: "closings", label: "Clôtures (Z)" },
];

/** Clôture journalière Z (lecture `closings.get`, création `closings.create`). */
export interface ClosingRow {
  business_date: string;
  opening_balance_minor: number;
  cash_sales_minor: number;
  customer_collections_minor: number;
  expenses_minor: number;
  refunds_minor: number;
  closing_balance_minor: number;
}

export function monthStartUtc(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
