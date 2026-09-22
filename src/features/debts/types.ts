// Veloria PoS — Feature Dettes : types partagés + helpers purs.
// Grain : créances clients au document, dettes fournisseurs au compte (ADR-015).
// Les montants restent en centimes (DZD) jusqu'au formatage.

export type DebtType = "customer" | "supplier";
export type DebtStatus = "overdue" | "due";
export type DebtTypeFilter = "all" | DebtType;
export type DebtStatusFilter = "all" | DebtStatus;
export type DebtDueFilter = "all" | "today" | "overdue" | "upcoming";
export type DebtSettleFilter = "all" | "watch" | "overdue" | "soon";
export type DebtSettleBand = "overdue" | "soon" | "ok" | "none";
export type DebtSort = "due_asc" | "remaining_desc" | "date_desc";

export interface DebtRow {
  debt_type: DebtType;
  entity_id: number;
  ref: string;
  party_name: string;
  party_phone: string | null;
  original_minor: number;
  paid_minor: number;
  remaining_minor: number;
  due_date: string | null;
  created_at: string;
  status: DebtStatus;
  settlement_day: number | null;
  next_settle: string | null;
  settle_band: DebtSettleBand;
}

export function settleBandLabel(b: DebtSettleBand): string {
  if (b === "overdue") return "Règlement dépassé";
  if (b === "soon") return "Règlement proche";
  if (b === "ok") return "Règlement à venir";
  return "Sans échéance fixe";
}

export function settleBandTone(b: DebtSettleBand): "red" | "amber" | "grey" {
  if (b === "overdue") return "red";
  if (b === "soon") return "amber";
  return "grey";
}

export function debtTypeLabel(t: DebtType): string {
  return t === "customer" ? "Client" : "Fournisseur";
}

export function debtStatusLabel(s: string): string {
  return s === "overdue" ? "En retard" : "À régler";
}

export function debtStatusTone(s: string): "red" | "amber" {
  return s === "overdue" ? "red" : "amber";
}

export function dueLabel(due: string | null): string {
  if (!due) return "—";
  return due.slice(0, 10);
}

export function rowKey(r: DebtRow): string {
  return `${r.debt_type}:${r.entity_id}`;
}

/**
 * Bande de règlement mensuel côté écran (miroir de la formule SQL
 * `listDebtsUnified`) : jour effectif plafonné au dernier jour du mois.
 */
export function settleInfo(
  settlementDay: number | null,
  todayYmd: string,
): { band: DebtSettleBand; next: string | null } {
  if (settlementDay == null || todayYmd.length < 10) return { band: "none", next: null };
  const y = Number(todayYmd.slice(0, 4));
  const m = Number(todayYmd.slice(5, 7));
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    return { band: "none", next: null };
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const eff = Math.min(settlementDay, last);
  const mm = String(m).padStart(2, "0");
  const next = `${y}-${mm}-${String(eff).padStart(2, "0")}`;
  const today = todayYmd.slice(0, 10);
  if (today > next) return { band: "overdue", next };
  const diffDays = Math.round(
    (Date.parse(`${next}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (diffDays <= 7) return { band: "soon", next };
  return { band: "ok", next };
}

export { PAYMENT_METHOD_LABELS } from "@shared/formatters/format.ts";

/** Poste unique : voir CASHIER_LABEL partagé (P2 : DEBT_USER supprimé). */
