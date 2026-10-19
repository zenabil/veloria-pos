// Veloria PoS — Domain: bons de commande fournisseurs (framework-free).
// P3 : cycle draft → ordered → partially_received → received (+ cancelled).
// La réception crée du stock (via receiveStockAtomic côté main) — jamais de
// stock sans traçabilité commande. Montants en centimes (DZD).

import { DomainError } from "../common/errors.ts";
import { assertSafeMinor, assertSafeTotal, multiplyMinorByQuantity } from "../money/money.ts";
import { assertValidQuantity } from "../common/quantity.ts";

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ["ordered", "cancelled"],
  ordered: ["partially_received", "received", "cancelled"],
  partially_received: ["received"],
  received: [],
  cancelled: [],
};

export function assertPoTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): void {
  // RADICAL-FIX lint: accès direct (Record exhaustif — pas de `?? []` mort).
  const allowed: readonly PurchaseOrderStatus[] = PO_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new DomainError("SUPPLIER_ERROR", `Transition commande interdite : ${from} → ${to}.`);
  }
}

export interface PoLineInput {
  productName: string;
  quantityOrdered: number;
  unitCostMinor: number;
}

/** Total commandé (sommes gardées, quantités fractionnaires admises). */
export function computePoTotals(lines: PoLineInput[]): {
  subtotalMinor: number;
  totalMinor: number;
} {
  if (lines.length === 0) {
    throw new DomainError("SUPPLIER_ERROR", "Commande vide.");
  }
  if (lines.length > 200) {
    throw new DomainError("SUPPLIER_ERROR", "Commande trop volumineuse (max 200 lignes).");
  }
  let subtotal = 0;
  for (const l of lines) {
    if (l.productName.trim().length === 0) {
      throw new DomainError("SUPPLIER_ERROR", "Nom de produit manquant dans la commande.");
    }
    assertValidQuantity(l.quantityOrdered);
    assertSafeMinor(l.unitCostMinor, { label: "Coût unitaire invalide" });
    const lineTotal = multiplyMinorByQuantity(l.unitCostMinor, l.quantityOrdered);
    subtotal += lineTotal;
    assertSafeTotal(subtotal, "Total commande invalide");
  }
  return { subtotalMinor: subtotal, totalMinor: subtotal };
}

export function poStatusLabelFr(s: string): string {
  if (s === "draft") return "Brouillon";
  if (s === "ordered") return "Commandée";
  if (s === "partially_received") return "Partiellement reçue";
  if (s === "received") return "Reçue";
  if (s === "cancelled") return "Annulée";
  return "—";
}
