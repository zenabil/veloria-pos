// Veloria PoS — Feature Dashboard : types partagés.

export interface DashboardSummary {
  from: string;
  to: string;
  kpis: {
    salesMinor: number;
    salesCount: number;
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
  byMethod: { method: string; n: number; t: number }[];
  comparison: { prevSalesMinor: number; deltaPercent: number };
  fastMoving: { name: string; qty: number; total: number }[];
  stock: {
    low: number;
    out: number;
    lowRows: { id: number; name: string; quantity: number; min_stock_level: number }[];
  };
  overdue: { kind: string; ref: string; party: string; remaining: number; due: string }[];
  upcoming: { kind: string; ref: string; party: string; remaining: number; due: string }[];
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
  alerts: { integrity: string; lastBackup: string | null };
}

export { paymentMethodLabel } from "@shared/formatters/format.ts";
