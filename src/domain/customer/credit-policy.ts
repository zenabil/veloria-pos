// Veloria PoS — Domain: politique crédit client (framework-free).
// P3 : tranches d'ancienneté (buckets) + règle du jour de règlement.
// Pur : les soldes viennent du main, la règle rend un verdict affichable.

import { DomainError } from "../common/errors.ts";

export type AgingBucket = "current" | "d30" | "d60" | "d90";

export function agingBucket(daysOverdue: number): AgingBucket {
  if (!Number.isInteger(daysOverdue) || daysOverdue < 0) {
    throw new DomainError("CUSTOMER_ERROR", "Ancienneté de dette invalide.");
  }
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  return "d90";
}

/** Jours calendaires entre deux dates AAAA-MM-JJ (échéance → aujourd'hui). */
export function daysOverdue(dueDate: string, today: string): number {
  const a = Date.UTC(
    Number(dueDate.slice(0, 4)),
    Number(dueDate.slice(5, 7)) - 1,
    Number(dueDate.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new DomainError("CUSTOMER_ERROR", "Dates d'échéance invalides.");
  }
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Le jour de règlement du mois est-il passé (relance à prévoir) ? */
export function settlementDueThisMonth(settlementDay: number | null, today: string): boolean {
  if (settlementDay === null) return false;
  if (!Number.isInteger(settlementDay) || settlementDay < 1 || settlementDay > 31) {
    throw new DomainError("CUSTOMER_ERROR", "Jour de règlement invalide.");
  }
  const day = Number(today.slice(8, 10));
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new DomainError("CUSTOMER_ERROR", "Date du jour invalide.");
  }
  return day >= settlementDay;
}
