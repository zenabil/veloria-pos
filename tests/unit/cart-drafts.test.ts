// Veloria PoS — Tests P2 : projection `carts.save` (pure, extraite de SellScreen).
import { describe, it, expect } from "vitest";
import { toCartDraftTabs } from "@/features/sales/sell/cart-drafts.ts";
import type { CartTab } from "@/features/sales/cart-store.ts";

describe("toCartDraftTabs (projection carts.save)", () => {
  it("projette onglets + lignes sans perte ni réordonnancement", () => {
    const tabs: CartTab[] = [
      {
        id: 1,
        name: "Panier 1",
        lines: [
          {
            key: "l1",
            productId: 7,
            productName: "Huile 5L",
            unitCode: "PIECE",
            originalUnitPriceMinor: 120000,
            unitPriceMinor: 115000,
            purchasePriceMinor: 100000,
            quantity: 2,
          },
        ],
        customerId: 3,
        customerLabel: "Amine Benali",
        amountPaidMinor: 50000,
        paymentMethod: "cash",
        deliveryFeeMinor: 1500,
      },
      {
        id: 2,
        name: "Panier 2",
        lines: [],
        customerId: null,
        customerLabel: "Client de passage",
        amountPaidMinor: 0,
        paymentMethod: null,
        deliveryFeeMinor: 0,
      },
    ];
    expect(toCartDraftTabs(tabs)).toEqual([
      {
        tabId: 1,
        name: "Panier 1",
        lines: [
          {
            key: "l1",
            productId: 7,
            productName: "Huile 5L",
            unitCode: "PIECE",
            originalUnitPriceMinor: 120000,
            unitPriceMinor: 115000,
            purchasePriceMinor: 100000,
            quantity: 2,
            billedTotalMinor: null,
          },
        ],
        customerId: 3,
        customerLabel: "Amine Benali",
        amountPaidMinor: 50000,
        paymentMethod: "cash",
        deliveryFeeMinor: 1500,
      },
      {
        tabId: 2,
        name: "Panier 2",
        lines: [],
        customerId: null,
        customerLabel: "Client de passage",
        amountPaidMinor: 0,
        paymentMethod: null,
        deliveryFeeMinor: 0,
      },
    ]);
  });

  it("tableau vide → charge vide (jamais null)", () => {
    expect(toCartDraftTabs([])).toEqual([]);
  });
});
