// Veloria PoS — Clients : types partagés des dialogues + onglets de la fiche 360.
// Extrait de `ClientDialogs.tsx` (découpage sans changement de comportement).
// Relevé via `customers.statement` ; retours / dettes / historique via les
// canaux existants, rapprochés côté renderer (nom normalisé FR) avec repli
// « toutes les lignes » quand aucun rapprochement n'est possible.
import { KIND_LABELS, type HistoryKind } from "@features/history/types.ts";
import type { Notify } from "@shared/ui/primitives.tsx";
import type { Customer, EnrichedCustomer, StatementSale } from "../types.ts";

export type ClientTabId = "factures" | "paiements" | "retours" | "dettes" | "historique";

export const CLIENT_TABS: { id: ClientTabId; label: string }[] = [
  { id: "factures", label: "Factures" },
  { id: "paiements", label: "Paiements" },
  { id: "retours", label: "Retours" },
  { id: "dettes", label: "Dettes-Solde" },
  { id: "historique", label: "Historique" },
];

export interface StatementPayment {
  id: number;
  sale_id: number | null;
  amount_minor: number;
  method: string;
  reference: string | null;
  payment_date: string;
  created_at: string;
}

export interface ClientReturnItem {
  kind: string;
  entity_id: number;
  number: string | null;
  created_at: string;
  ref: string;
  party_name: string;
  total_minor: number;
  settled_minor: number;
  status: string;
}

export interface ClientDebtItem {
  debt_type: string;
  entity_id: number;
  ref: string;
  party_name: string;
  original_minor: number;
  paid_minor: number;
  remaining_minor: number;
  due_date: string | null;
  created_at: string;
  status: string;
}

export interface ClientHistoryItem {
  kind: string;
  entity_id: number;
  ref: string;
  label: string;
  entity_name: string | null;
  amount_minor: number | null;
  created_at: string;
  status: string;
}

export type LazyState = "idle" | "loading" | "ready" | "error";

/** Bon de retour d'une ligne retours (aperçu ticket + impression). */
export interface SlipState {
  payload: Record<string, unknown>;
  text80: string;
  title: string;
}

export function historyKindOf(raw: string): HistoryKind | null {
  return Object.keys(KIND_LABELS).includes(raw) ? (raw as HistoryKind) : null;
}

/** Compteurs affichés dans les libellés d'onglets (repli : libellé sans compteur). */
export interface ClientTabCounts {
  sales: number;
  payments: number;
  returns: number;
  returnsReady: boolean;
  debts: number;
  debtsReady: boolean;
  history: number;
  historyReady: boolean;
}

export function clientTabLabel(t: ClientTabId, counts: ClientTabCounts): string {
  const base = CLIENT_TABS.find((x) => x.id === t)?.label ?? t;
  if (t === "factures") return `${base} (${counts.sales})`;
  if (t === "paiements") return `${base} (${counts.payments})`;
  if (t === "retours" && counts.returnsReady) return `${base} (${counts.returns})`;
  if (t === "dettes" && counts.debtsReady) return `${base} (${counts.debts})`;
  if (t === "historique" && counts.historyReady) return `${base} (${counts.history})`;
  return base;
}

export interface ClientDetailsDrawerProps {
  customer: EnrichedCustomer;
  sales: StatementSale[];
  onClose: () => void;
  onEdit: (c: EnrichedCustomer) => void;
  onChanged: () => void;
  notify: Notify;
}

export interface ClientFormDialogProps {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}

export interface PaymentDialogProps {
  customer: EnrichedCustomer;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}
