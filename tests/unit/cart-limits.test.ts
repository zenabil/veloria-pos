// Veloria PoS — Limites du panier : 500 lignes, 20 onglets, stock caisse.
import { describe, it, expect, beforeEach } from "vitest";
import {
  MAX_CART_LINES,
  MAX_CART_TABS,
  useCartsStore,
  type CartTab,
} from "../../src/features/sales/cart-store.ts";

function tab(id = 1): CartTab {
  return {
    id,
    name: `Panier ${id}`,
    lines: [],
    customerId: null,
    customerLabel: "Client de passage",
    amountPaidMinor: 0,
    paymentMethod: "cash",
    deliveryFeeMinor: 0,
  };
}

function line(i: number): {
  key: string;
  productId: number;
  productName: string;
  unitCode: string;
  originalUnitPriceMinor: number;
  unitPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
} {
  return {
    key: `k${i}`,
    productId: i,
    productName: `Article ${i}`,
    unitCode: "PIECE",
    originalUnitPriceMinor: 100,
    unitPriceMinor: 100,
    purchasePriceMinor: 50,
    quantity: 1,
  };
}

describe("limites du panier", () => {
  beforeEach(() => {
    useCartsStore.setState({ tabs: [tab()], activeId: 1 });
  });

  it("refuse la 501e ligne", () => {
    const add = useCartsStore.getState().addLine;
    for (let i = 1; i <= MAX_CART_LINES; i += 1) add(line(i));
    expect(useCartsStore.getState().tabs[0]?.lines).toHaveLength(MAX_CART_LINES);
    add(line(MAX_CART_LINES + 1));
    expect(useCartsStore.getState().tabs[0]?.lines).toHaveLength(MAX_CART_LINES);
  });

  it("refuse le 21e onglet", () => {
    useCartsStore.setState({
      tabs: Array.from({ length: MAX_CART_TABS }, (_, i) => tab(i + 1)),
      activeId: 1,
    });
    useCartsStore.getState().newTab();
    expect(useCartsStore.getState().tabs).toHaveLength(MAX_CART_TABS);
  });

  it("borne une hausse de quantité au stock de la ligne", () => {
    const store = useCartsStore.getState();
    store.addLine({ ...line(1), stockQty: 2 });
    store.setQty("k1", 5);
    expect(useCartsStore.getState().tabs[0]?.lines[0]?.quantity).toBe(1);
    store.setQty("k1", 2);
    expect(useCartsStore.getState().tabs[0]?.lines[0]?.quantity).toBe(2);
  });
});
