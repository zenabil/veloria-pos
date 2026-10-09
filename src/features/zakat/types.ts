// Veloria PoS — Feature Zakat : types partagés (le calcul vit dans le domaine).
// Les montants restent en centimes (DZD) jusqu'au formatage.
// P3 : computeZakatLocal a déménagé vers @domain/zakat/zakat-rules.ts
// (computeZakat) — la feature ne garde que le formulaire et l'UI.

export interface ZakatSources {
  cash: { paid: number; total: number };
  inventory: { v: number };
  customerDebts: { d: number };
  supplierDebts: { d: number };
  params: {
    ratePercent: number;
    nisabMinor: number;
    hawlDate: string | null;
    nisabMethod: string;
  };
}

export interface ZakatCalculation {
  id: number;
  hijri_year: string;
  calc_date: string;
  cash_minor: number;
  bank_minor: number;
  stock_minor: number;
  receivables_minor: number;
  other_minor: number;
  liabilities_minor: number;
  net_minor: number;
  nisab_minor: number;
  rate_percent: number;
  zakat_minor: number;
  status: string;
  notes: string | null;
  created_at: string;
}

export const HIJRI_YEARS = ["1446", "1447", "1448", "1449"];

export function nisabMethodLabel(m: string): string {
  if (m === "silver") return "Argent";
  if (m === "other") return "Autre";
  return "Or";
}
