// Veloria PoS — Feature Dashboard : types partagés.

export interface DashboardSummary {
  from: string;
  to: string;
  kpis: {
    salesMinor: number;
    salesCount: number;
    /** Valeur des retours non annulés de la période (déjà déduite de salesMinor). */
    returnsMinor: number;
    returnsCount: number;
    purchasesMinor: number;
    purchasesCount: number;
    expensesMinor: number;
    expensesCount: number;
    profitMinor: number;
    customerDebtMinor: number;
    supplierDebtMinor: number;
    stockValueMinor: number;
    cashMinor: number;
  };
  daily: { d: string; t: number; n: number }[];
  /** Encaissements réels − remboursements réels, par moyen de paiement. */
  byMethod: { method: string; n: number; t: number }[];
  /** Ventes nettes et marge par catégorie (catégorie figée dans la ligne). */
  byCategory: {
    id: number | null;
    name: string;
    salesMinor: number;
    profitMinor: number;
    returnsMinor: number;
  }[];
  comparison: { prevSalesMinor: number; deltaPercent: number };
  fastMoving: { name: string; qty: number; total: number }[];
  stock: {
    low: number;
    out: number;
    lowRows: { id: number; name: string; quantity: number; min_stock_level: number }[];
  };
  overdue: { kind: string; ref: string; party: string; remaining: number; due: string }[];
  /** Total réel, indépendant du Top 5 renvoyé dans overdue. */
  overdueCount: number;
  upcoming: { kind: string; ref: string; party: string; remaining: number; due: string }[];
  /** Total réel, indépendant du Top 5 renvoyé dans upcoming. */
  upcomingCount: number;
  recent: {
    sales: {
      id: number;
      invoice_number: string;
      total_minor: number;
      created_at: string;
      party: string;
    }[];
    payments: {
      dir: string;
      amount_minor: number;
      method: string;
      payment_date: string;
      party: string;
    }[];
    purchases: {
      id: number;
      ref: string;
      party: string;
      total_minor: number;
      created_at: string;
    }[];
    returns: { kind: string; ref: string; total: number; created_at: string }[];
    expenses: {
      id: number;
      description: string;
      category: string;
      amount_minor: number;
      expense_date: string;
    }[];
  };
  alerts: { integrity: string; integrityAt: string | null; lastBackup: string | null };
}

export { paymentMethodLabel } from "@shared/formatters/format.ts";
