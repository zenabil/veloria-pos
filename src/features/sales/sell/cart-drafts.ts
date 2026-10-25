// Veloria PoS — Vente : charge `carts.save` (pur, sans IO).
// Extrait de `SellScreen.tsx` (P2 : découpage sans changement de comportement).
// La persistance (debounce 800 ms + appel IPC) reste dans l'écran ; ici seule
// la projection `CartTab[]` → charge IPC, testée unitairement.

import type { CartTab } from "../cart-store.ts";

export interface CartDraftLinePayload {
  key: string;
  productId: number | null;
  productName: string;
  unitCode: string;
  originalUnitPriceMinor: number;
  unitPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
  /** Montant facturé EXACT (mode « Montant » ADR-114) — null = prix × qté. */
  billedTotalMinor: number | null;
  /** Conditionnement (survit au redémarrage comme le montant saisi). */
  packagingId: number | null;
  packagingLabelFr: string | null;
  packagingFactor: number | null;
  packagingSellingPriceMinor: number | null;
  packagingAutoCartonPricing: boolean;
  packagingPriceOverridden: boolean;
}

export interface CartDraftTabPayload {
  tabId: number;
  name: string;
  lines: CartDraftLinePayload[];
  customerId: number | null;
  customerLabel: string;
  amountPaidMinor: number;
  paymentMethod: "cash" | "cheque" | "transfer" | null;
  deliveryFeeMinor: number;
  /** Identité d'encaissement persistée (reprise idempotente après crash). */
  saleOperationId: string | null;
}

/** Projection pure des onglets vers la charge `carts.save` (mêmes champs, même ordre). */
export function toCartDraftTabs(tabs: CartTab[]): CartDraftTabPayload[] {
  return tabs.map((t) => ({
    tabId: t.id,
    name: t.name,
    lines: t.lines.map((l) => ({
      key: l.key,
      productId: l.productId,
      productName: l.productName,
      unitCode: l.unitCode,
      originalUnitPriceMinor: l.originalUnitPriceMinor,
      unitPriceMinor: l.unitPriceMinor,
      purchasePriceMinor: l.purchasePriceMinor,
      quantity: l.quantity,
      billedTotalMinor: l.billedTotalMinor ?? null,
      packagingId: l.packagingId ?? null,
      packagingLabelFr: l.packagingLabelFr ?? null,
      packagingFactor: l.packagingFactor ?? null,
      packagingSellingPriceMinor: l.packagingSellingPriceMinor ?? null,
      packagingAutoCartonPricing: l.packagingAutoCartonPricing === true,
      packagingPriceOverridden: l.packagingPriceOverridden === true,
    })),
    customerId: t.customerId,
    customerLabel: t.customerLabel,
    amountPaidMinor: t.amountPaidMinor,
    paymentMethod: t.paymentMethod,
    deliveryFeeMinor:
      Number.isInteger(t.deliveryFeeMinor) && t.deliveryFeeMinor >= 0 ? t.deliveryFeeMinor : 0,
    saleOperationId: t.saleOperationId ?? null,
  }));
}
