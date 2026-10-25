// Veloria PoS — Tests caisse : quantité rapide, garde stock, clés anti-collision.
import { describe, expect, it, vi } from "vitest";
import {
  addProduct,
  parseQtyPrefix,
  stockGuardMessage,
  type SellSearchDeps,
} from "@/features/sales/sell/sell-search.ts";
import { openPay } from "@/features/sales/sell/sell-finalize.ts";
import type { CartLine } from "@/application/sales/create-sale.ts";
import type { SearchRow } from "@/features/sales/sell/sell-types.ts";

function row(over: Partial<SearchRow> = {}): SearchRow {
  return {
    id: 3,
    name: "Sucre 1kg",
    selling_price_minor: 9000,
    purchase_price_minor: 7000,
    quantity: 10,
    unit_code: "KG",
    primary_barcode: "6191234567890",
    ...over,
  };
}

function fakeAddDeps(existing: CartLine[] = []): {
  d: Pick<SellSearchDeps, "cart" | "notify" | "searchRef">;
  added: CartLine[];
  notifs: Array<{ msg: string; kind: string }>;
} {
  const added: CartLine[] = [];
  const notifs: Array<{ msg: string; kind: string }> = [];
  const d = {
    cart: {
      lines: existing,
      addLine: vi.fn((l: CartLine) => {
        added.push(l);
      }),
    },
    notify: (msg: string, kind?: string) => {
      notifs.push({ msg, kind: kind ?? "ok" });
    },
    searchRef: { current: null },
  } as unknown as Pick<SellSearchDeps, "cart" | "notify" | "searchRef">;
  return { d, added, notifs };
}

describe("parseQtyPrefix : quantité rapide caisse", () => {
  it("5*CODE, 2x texte, virgule FR, × unicode", () => {
    expect(parseQtyPrefix("5*6191234567890")).toEqual({
      quantity: 5,
      code: "6191234567890",
      explicit: true,
    });
    expect(parseQtyPrefix("2x huile")).toEqual({ quantity: 2, code: "huile", explicit: true });
    expect(parseQtyPrefix("1,5×6191234567890")).toEqual({
      quantity: 1.5,
      code: "6191234567890",
      explicit: true,
    });
  });
  it("sans préfixe : quantité 1, code intact, quantité non explicite", () => {
    expect(parseQtyPrefix("huile")).toEqual({ quantity: 1, code: "huile", explicit: false });
    expect(parseQtyPrefix("6191234567890")).toEqual({
      quantity: 1,
      code: "6191234567890",
      explicit: false,
    });
  });
  it("préfixe invalide : repli quantité 1 non explicite (jamais de quantité 0)", () => {
    expect(parseQtyPrefix("5*")).toEqual({ quantity: 1, code: "5*", explicit: false });
    expect(parseQtyPrefix("0*abc")).toEqual({ quantity: 1, code: "0*abc", explicit: false });
    expect(parseQtyPrefix("*abc")).toEqual({ quantity: 1, code: "*abc", explicit: false });
    expect(parseQtyPrefix("10000*abc")).toEqual({
      quantity: 1,
      code: "10000*abc",
      explicit: false,
    });
  });
});

describe("stockGuardMessage : alerte FR précoce (le main retranche)", () => {
  it("rupture : message, même si désiré = 1", () => {
    expect(stockGuardMessage(0, 1, "Sucre")).toContain("Rupture de stock");
    expect(stockGuardMessage(-2, 1, "Sucre")).toContain("Rupture de stock");
  });
  it("dépassement : message avec demandé/disponible", () => {
    const m = stockGuardMessage(3, 5, "Sucre");
    expect(m).toContain("Stock insuffisant");
    expect(m).toContain("Sucre");
  });
  it("stock suffisant : silence", () => {
    expect(stockGuardMessage(10, 2, "Sucre")).toBeNull();
    expect(stockGuardMessage(2, 2, "Sucre")).toBeNull();
  });
});

describe("openPay : identité d'opération stable par panier", () => {
  it("réutilise l'operationId du panier après fermeture/réouverture", () => {
    const cart: {
      lines: CartLine[];
      saleOperationId: string | null;
      setSaleOperationId: (id: string | null) => void;
    } = {
      lines: [
        {
          key: "l1",
          productId: 1,
          productName: "Article",
          unitCode: "PIECE",
          originalUnitPriceMinor: 1000,
          unitPriceMinor: 1000,
          purchasePriceMinor: 500,
          quantity: 1,
        },
      ],
      saleOperationId: null,
      setSaleOperationId: (id) => {
        cart.saleOperationId = id;
      },
    };
    const setPaidText = vi.fn();
    const setPayOperationId = vi.fn();
    const deps = {
      cart,
      totals: { totalMinor: 1000, remainingMinor: 1000 },
      deliveryError: "",
      setPaidText,
      setDueDate: vi.fn(),
      setPayOperationId,
      setLimitOverride: vi.fn(),
      setPayOpen: vi.fn(),
    };
    openPay(deps as never);
    const first = setPayOperationId.mock.calls[0]?.[0] as string;
    expect(first).toBeTruthy();
    expect(cart.saleOperationId).toBe(first);
    openPay(deps as never);
    expect(setPayOperationId).toHaveBeenLastCalledWith(first);
  });
});

describe("addProduct : quantité + garde + clés UUID", () => {
  it("quantité du préfixe appliquée + cliché stock", () => {
    const { d, added, notifs } = fakeAddDeps();
    addProduct(d, row(), 5);
    expect(added).toHaveLength(1);
    expect(added[0]?.quantity).toBe(5);
    expect(added[0]?.stockQty).toBe(10);
    expect(notifs).toEqual([]);
  });
  it("rupture : notifié et NON ajouté (le main refuse toujours le stock négatif)", () => {
    const { d, added, notifs } = fakeAddDeps();
    expect(addProduct(d, row({ quantity: 0 }))).toBe(false);
    expect(added).toHaveLength(0);
    expect(notifs.map((n) => n.msg).join(" ")).toContain("Rupture de stock");
  });
  it("cumul panier pris en compte (2 en panier + 9 demandés > 10)", () => {
    const existing: CartLine[] = [
      {
        key: "l-x",
        productId: 3,
        productName: "Sucre 1kg",
        unitCode: "KG",
        originalUnitPriceMinor: 9000,
        unitPriceMinor: 9000,
        purchasePriceMinor: 7000,
        quantity: 2,
        stockQty: 10,
      },
    ];
    const { d, added, notifs } = fakeAddDeps(existing);
    addProduct(d, row(), 9);
    expect(notifs.map((n) => n.msg).join(" ")).toContain("Stock insuffisant");
    expect(added).toHaveLength(0);
  });
  it("clés uniques même en rafale (jamais Date.now)", () => {
    const { d, added } = fakeAddDeps();
    addProduct(d, row());
    addProduct(d, row());
    expect(added).toHaveLength(2);
    expect(added[0]?.key).not.toBe(added[1]?.key);
    for (const l of added) expect(l.key.startsWith("l-")).toBe(true);
  });
});
