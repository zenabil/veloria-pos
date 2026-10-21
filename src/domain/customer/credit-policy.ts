// Veloria PoS — Domain: politique crédit client (framework-free).
// P3 : règle du jour de règlement + calcul du retard (E-30).
// Pur : les soldes viennent du main, la règle rend un verdict affichable.

import { DomainError } from "../common/errors.ts";
import { daysBetween } from "../common/dates.ts";

/**
 * Jours calendaires entre deux dates AAAA-MM-JJ (échéance → aujourd'hui).
 * W7 (D-06) : le calcul est désormais celui de `domain/common/dates.ts`
 * (source unique) — la copie locale était bornée à 0, la règle est donc
 * appliquée ici : un retard ne peut pas être négatif.
 */
export function daysOverdue(dueDate: string, today: string): number {
  const days = daysBetween(dueDate, today);
  if (!Number.isFinite(days)) {
    throw new DomainError("CUSTOMER_ERROR", "Dates d'échéance invalides.");
  }
  return Math.max(0, days);
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
