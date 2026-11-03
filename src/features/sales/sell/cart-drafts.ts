// Veloria PoS — Vente : charge `carts.save` (pur, sans IO).
// Extrait de `SellScreen.tsx` (P2 : découpage sans changement de comportement).
// La persistance (debounce 800 ms + appel IPC) reste dans l'écran ; ici seule
// la projection `CartTab[]` → charge IPC, testée unitairement.

import { persistedSaleOperationId } from "../sale-op.ts";
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
  return tabs.map((tab) => {
    const lines: CartDraftLinePayload[] = tab.lines.map((l) => ({
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
    }));
    const payload: Omit<CartDraftTabPayload, "saleOperationId"> = {
      tabId: tab.id,
      name: tab.name,
      lines,
      customerId: tab.customerId,
      customerLabel: tab.customerLabel,
      amountPaidMinor: tab.amountPaidMinor,
      paymentMethod: tab.paymentMethod,
      deliveryFeeMinor:
        Number.isInteger(tab.deliveryFeeMinor) && tab.deliveryFeeMinor >= 0
          ? tab.deliveryFeeMinor
          : 0,
    };
    return {
      ...payload,
      // L'identité d'encaissement n'est persistée que si elle est toujours
      // figée sur CE contenu : un panier modifié doit ressortir sans UUID (une
      // NOUVELLE opération), sinon le vieux UUID ferait rejouer l'ancienne
      // vente après un rechargement, ticket neuf à l'appui.
      saleOperationId: persistedSaleOperationId(tab, payload),
    };
  });
}
