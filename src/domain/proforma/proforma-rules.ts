// Veloria PoS — Domain: règles proformas (Phase 7, framework-free).
// Statuts : draft -> sent -> converted | cancelled. Conversion = vente réelle
// créée par le repo main dans la même transaction (proforma + vente liées).

import { DomainError } from "../common/errors.ts";
import { assertValidQuantity } from "../common/quantity.ts";
import {
  assertSafeMinor,
  assertSafeTotal,
  multiplyMinorByQuantity,
  sumSafeMinors,
} from "../money/money.ts";

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
  if (lines.length > 500)
    throw new DomainError("PROFORMA_ERROR", "Devis trop volumineux (max 500 lignes).");
  assertSafeMinor(discountMinor, { label: "Remise invalide" });
  assertSafeMinor(deliveryMinor, { label: "Frais de livraison invalides" });
  const lineTotals: number[] = [];
  for (const l of lines) {
    if (l.productName.trim().length === 0)
      throw new DomainError("PROFORMA_ERROR", "Ligne sans nom.");
    assertSafeMinor(l.unitPriceMinor, { label: "Prix de ligne invalide" });
    assertValidQuantity(l.quantity);
    lineTotals.push(multiplyMinorByQuantity(l.unitPriceMinor, l.quantity));
  }
  const subtotal = sumSafeMinors(lineTotals, "Sous-total devis invalide");
  if (discountMinor > subtotal) {
    throw new DomainError("PROFORMA_ERROR", "La remise dépasse le sous-total.");
  }
  const total = subtotal - discountMinor + deliveryMinor;
  assertSafeTotal(total, "Total devis invalide");
  return { subtotalMinor: subtotal, totalMinor: total };
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
