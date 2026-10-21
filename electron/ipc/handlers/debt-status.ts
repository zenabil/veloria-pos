// Veloria PoS — Main : statut de dette client (E-30).
//
// SOURCE UNIQUE de la règle « en retard ».
//
// AVANT (E-30) : les quatre écritures du solde client n'écrivaient que
// 'none' | 'due' | 'over_limit'. La valeur 'overdue' — celle que l'APK
// affiche « En retard » (mobile/src/tokens.ts) et que le POS affiche
// « En retard » (features/customers/types.ts) — n'était JAMAIS produite :
// un état mort, affiché par deux clients (APK + POS) et atteint par aucun.
//
// RÈGLE : un client est « en retard » si l'une de ses ventes OUVERTES
// (non annulée, reste > 0) a dépassé son échéance (`due_date` < aujourd'hui).
// C'est la MÊME notion que le statut 'overdue' de `debts.list`
// (electron/ipc/handlers/finance.repo.ts) : un document échu, pas une
// estimation.
//
// DEUX COUCHES, UNE SEULE RÈGLE :
// 1. ÉCRITURE — la colonne `customers.debt_status` porte l'état au dernier
//    mouvement (les 4 écritures du solde) ;
// 2. LECTURE — le statut affiché est RÉCALCULÉ à la lecture, car l'échéance
//    dépend du TEMPS : une vente échue hier peut le devenir aujourd'hui sans
//    qu'aucun mouvement ne soit passé par la base. Une colonne matérialisée
//    ne peut pas suivre le temps ; seul un état dérivé le peut.
//
// L'expression SQL est unique (`overdueSalesSql`) : les écritures et les
// lectures l'emploient, donc elles ne peuvent pas diverger.

/** Le client a-t-il une vente ouverte dont l'échéance est dépassée ? */
export function overdueSalesSql(customerIdExpr: string): string {
  return `EXISTS (SELECT 1 FROM sales s WHERE s.customer_id = ${customerIdExpr} AND s.is_cancelled = 0 AND s.remaining_balance_minor > 0 AND s.due_date IS NOT NULL AND substr(s.due_date, 1, 10) < date('now'))`;
}

/**
 * Fragment SQL du statut de dette (partagé par les écritures).
 * `balanceExpr` : expression du solde APRÈS application du mouvement
 * (ex. `outstanding_balance_minor + ?`).
 * `customerIdExpr` : expression de l'identifiant client de la ligne visée.
 * `limitExpr` : expression du plafond de crédit — le PARAMÈTRE `?` quand
 * l'écriture CHANGE le plafond (SQL lit l'ANCIENNE valeur de la colonne
 * dans un SET : le statut doit être calculé avec le NOUVEAU plafond), la
 * colonne sinon.
 */
export function debtStatusSql(
  balanceExpr: string,
  customerIdExpr: string,
  limitExpr = "credit_limit_minor",
): string {
  return `CASE WHEN ${balanceExpr} <= 0 THEN 'none' WHEN ${limitExpr} > 0 AND ${balanceExpr} > ${limitExpr} THEN 'over_limit' WHEN ${overdueSalesSql(customerIdExpr)} THEN 'overdue' ELSE 'due' END`;
}

/**
 * Statut affiché (temps réel). Le statut stocké est un plan :
 * 'due' devient 'overdue' si une vente ouverte a dépassé son échéance.
 * Les autres valeurs ('none', 'over_limit', 'overdue') sont conservées.
 */
export function liveDebtStatus(stored: unknown, hasOverdueSale: boolean): string {
  const s = typeof stored === "string" ? stored : "";
  if (s === "due" && hasOverdueSale) return "overdue";
  return s;
}
