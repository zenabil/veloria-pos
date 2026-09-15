// Veloria PoS — Domain: règles proformas (Phase 7, framework-free).
// Statuts : draft -> sent -> converted | cancelled. Conversion = vente réelle
// créée par le repo main dans la même transaction (proforma + vente liées).

import { DomainError } from "../common/errors.ts";

export type ProformaStatus = "draft" | "sent" | "converted" | "cancelled";

export interface ProformaLineDraft {
  productId: number | null;
  productName: string;
  unitPriceMinor: number;
  quantity: number;
}

export function computeProformaTotals(
  lines: ProformaLineDraft[],
  discountMinor: number,
  deliveryMinor: number,
): { subtotalMinor: number; totalMinor: number } {
  if (lines.length === 0) throw new DomainError("PROFORMA_ERROR", "Devis vide.");
  if (!Number.isInteger(discountMinor) || discountMinor < 0) {
    throw new DomainError("PROFORMA_ERROR", "Remise invalide.");
  }
  if (!Number.isInteger(deliveryMinor) || deliveryMinor < 0) {
    throw new DomainError("PROFORMA_ERROR", "Frais de livraison invalides.");
  }
  let subtotal = 0;
  for (const l of lines) {
    if (l.productName.trim().length === 0)
      throw new DomainError("PROFORMA_ERROR", "Ligne sans nom.");
    if (!Number.isInteger(l.unitPriceMinor) || l.unitPriceMinor < 0) {
      throw new DomainError("PROFORMA_ERROR", "Prix de ligne invalide.");
    }
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
      throw new DomainError("PROFORMA_ERROR", "Quantité de ligne invalide.");
    }
    subtotal += Math.round(l.unitPriceMinor * l.quantity);
  }
  if (discountMinor > subtotal) {
    throw new DomainError("PROFORMA_ERROR", "La remise dépasse le sous-total.");
  }
  return { subtotalMinor: subtotal, totalMinor: subtotal - discountMinor + deliveryMinor };
}

const TRANSITIONS: Record<ProformaStatus, ProformaStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["converted", "cancelled"],
  converted: [],
  cancelled: [],
};

export function assertProformaTransition(from: ProformaStatus, to: ProformaStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError("PROFORMA_ERROR", `Transition interdite : ${from} → ${to}.`);
  }
}
