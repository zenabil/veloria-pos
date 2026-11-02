// Veloria PoS — Feature Zakat : types partagés (le calcul vit dans le domaine).
// Les montants restent en centimes (DZD) jusqu'au formatage.
// P3 : computeZakatLocal a déménagé vers @domain/zakat/zakat-rules.ts
// (computeZakat) — la feature ne garde que le formulaire et l'UI.

import { businessDayOf } from "@domain/common/business-day.ts";

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

export const HIJRI_YEARS = hijriYearsWindow();

/**
 * Fenêtre glissante de 4 années hégiriennes autour de l'année courante
 * (approximation calendaire : an = jours/354,367 depuis le 16 juillet 622,
 * dérive possible de ±1 — l'éditeur valide l'année dans le dialogue).
 * Fin du tableau statique 1446–1449 figé (périmé par construction).
 */
function hijriYearsWindow(): string[] {
  const HIJRI_EPOCH_MS = Date.UTC(622, 6, 16);
  const HIJRI_YEAR_DAYS = 354.367;
  // E-35 : l'année hégirienne « courante » s'appuie sur le jour métier
  // (Africa/Algiers) — la zakat se détermine au coucher du soleil local, pas à minuit UTC.
  const today = businessDayOf(new Date());
  const current = Math.floor(
    (Date.parse(`${today}T00:00:00.000Z`) - HIJRI_EPOCH_MS) / 86400000 / HIJRI_YEAR_DAYS,
  );
  return [current - 1, current, current + 1, current + 2].map(String);
}

export function nisabMethodLabel(m: string): string {
  if (m === "silver") return "Argent";
  if (m === "other") return "Autre";
  return "Or";
}
