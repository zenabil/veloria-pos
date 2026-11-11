// Veloria PoS — Domaine : commandes clients (ADR-182, tranche C).
//
// Règles PURES : ni base, ni IPC, ni framework. Ce module est la référence
// unique côté renderer ; le main en porte un **jumeau** (`electron/ipc/
// handlers/client-order.repo.ts`) parce que `electron/` ne peut pas importer
// `src/` — la parité est prouvée par `tests/unit/client-order-parity.test.ts`
// (même principe que `money-guard-parity`).
//
// Ce que le domaine fixe :
//   - la machine d'états d'une commande (et ses transitions interdites) ;
//   - le format de la référence `CMD-AAAA-NNNNNN` (générée par le POS) ;
//   - le calcul du total (centimes DZD, borne du domaine argent) ;
//   - les libellés français affichés au commerçant.
/** États possibles d'une commande (miroir du CHECK SQL de 0063). */
export const ORDER_STATUSES = ["nouvelle", "preparing", "ready", "served", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Préfixe des références de commande (numéro de séquence `client_order`). */
export const ORDER_REFERENCE_PREFIX = "CMD";

/**
 * Transitions autorisées — MIROIR EXACT du trigger
 * `trg_client_orders_status_transition` (migration 0063). Une commande
 * livrée ou annulée est TERMINALE : on ne remonte pas le flux.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  nouvelle: ["preparing", "ready", "served", "cancelled"],
  preparing: ["ready", "served", "cancelled"],
  ready: ["served", "cancelled"],
  served: [],
  cancelled: [],
};

/** Une transition est-elle autorisée ? (un changement d'état identique est un no-op permis) */
export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Libellé FR d'un état (affiché dans l'écran « Commandes »). */
export function orderStatusLabelFr(status: OrderStatus): string {
  switch (status) {
    case "nouvelle":
      return "Nouvelle";
    case "preparing":
      return "En préparation";
    case "ready":
      return "Prête pour le retrait";
    case "served":
      return "Livrée";
    case "cancelled":
      return "Annulée";
  }
}

/**
 * Format de référence : `CMD-AAAA-NNNNNN` (même forme que les factures).
 * Le compteur est alloué DANS la transaction de création.
 */
export function formatOrderReference(prefix: string, year: number, nextValue: number): string {
  const clean = prefix.trim() || ORDER_REFERENCE_PREFIX;
  if (!Number.isInteger(nextValue) || nextValue <= 0) {
    throw new Error("Compteur de commande invalide.");
  }
  return `${clean}-${year}-${String(nextValue).padStart(5, "0")}`;
}
