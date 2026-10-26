// Veloria PoS — ADR-139 : ouverture d'un panier de réédition (vente annulée).
import { beforeEach, describe, expect, it } from "vitest";
import { useCartsStore, type CartTab } from "@/features/sales/cart-store.ts";
import type { CartLine } from "@/application/sales/create-sale.ts";

function tab(id: number, over: Partial<CartTab> = {}): CartTab {
  return {
    id,
    name: `Panier ${id}`,
    lines: [],
    customerId: null,
    customerLabel: "Client de passage",
    amountPaidMinor: 0,
    paymentMethod: "cash",
    deliveryFeeMinor: 0,
    saleOperationId: null,
    ...over,
  };
}

function line(over: Partial<CartLine> = {}): Omit<CartLine, "key"> {
  return {
    productId: 7,
    productName: "Farine 5kg",
    unitCode: "PIECE",
    originalUnitPriceMinor: 10000,
    unitPriceMinor: 10000,
    purchasePriceMinor: 8000,
    quantity: 2,
    billedTotalMinor: null,
    stockQty: 10,
    ...over,
  };
}

function reset(tabs: CartTab[], activeId: number): void {
  useCartsStore.setState({ tabs, activeId });
}

describe("cart store — panier de réédition", () => {
  beforeEach(() => {
    reset([tab(1)], 1);
  });

  it("réutilise le panier actif vide et injecte client, livraison et lignes", () => {
    const ok = useCartsStore.getState().openTabWith({
      name: "Modif. FAC-1",
      customerId: 3,
      customerLabel: "Amine",
      deliveryFeeMinor: 500,
      lines: [line(), line({ productId: 8, productName: "Huile" })],
    });
    expect(ok).toBe(true);
    const s = useCartsStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]?.name).toBe("Modif. FAC-1");
    expect(s.tabs[0]?.lines).toHaveLength(2);
    expect(s.tabs[0]?.lines[0]?.key).not.toBe(s.tabs[0]?.lines[1]?.key);
    expect(s.tabs[0]?.customerId).toBe(3);
    expect(s.tabs[0]?.customerLabel).toBe("Amine");
    expect(s.tabs[0]?.deliveryFeeMinor).toBe(500);
    expect(s.tabs[0]?.amountPaidMinor).toBe(0);
  });

  it("ouvre un nouvel onglet si le panier actif contient déjà des lignes", () => {
    reset([tab(1, { lines: [{ ...line(), key: "l1" }] })], 1);
    const ok = useCartsStore.getState().openTabWith({
      lines: [line()],
      customerId: null,
      customerLabel: "Client de passage",
      deliveryFeeMinor: 0,
    });
    expect(ok).toBe(true);
    const s = useCartsStore.getState();
    expect(s.tabs).toHaveLength(2);
    expect(s.activeId).toBe(s.tabs[1]?.id);
    expect(s.tabs[0]?.lines).toHaveLength(1);
  });

  it("refuse proprement au-delà de 20 paniers (sans écraser les autres)", () => {
    const tabs = Array.from({ length: 20 }, (_, i) =>
      tab(i + 1, { lines: [{ ...line(), key: `l${i}` }] }),
    );
    reset(tabs, 20);
    const ok = useCartsStore.getState().openTabWith({
      lines: [line()],
      customerId: null,
      customerLabel: "Client de passage",
      deliveryFeeMinor: 0,
    });
    expect(ok).toBe(false);
    expect(useCartsStore.getState().tabs).toHaveLength(20);
  });

  it("préserve le montant saisi verrouillé d'origine (mode Montant)", () => {
    const ok = useCartsStore.getState().openTabWith({
      lines: [line({ billedTotalMinor: 1999 })],
      customerId: null,
      customerLabel: "Client de passage",
      deliveryFeeMinor: 0,
    });
    expect(ok).toBe(true);
    expect(useCartsStore.getState().tabs[0]?.lines[0]?.billedTotalMinor).toBe(1999);
  });
});
