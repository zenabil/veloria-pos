// Veloria PoS — Tests caisse : quantité rapide, garde stock, clés anti-collision.
import { describe, expect, it, vi } from "vitest";
import {
  addProduct,
  parseQtyPrefix,
  stockGuardMessage,
  type SellSearchDeps,
} from "@/features/sales/sell/sell-search.ts";
import { bumpLastQty, openPay } from "@/features/sales/sell/sell-finalize.ts";
import { shouldIgnoreBump } from "@/features/sales/sell/useSellShortcuts.ts";
import { minorToInputTotal } from "@domain/money/money.ts";
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

describe("openPay : préparation du dialogue d'encaissement", () => {
  // L'identité d'opération n'est plus figée à l'ouverture du dialogue : elle
  // naît au COMMIT, sur le contenu réellement envoyé (see
  // sale-operation-id-content-key.test.ts). Ouvrir le dialogue ne doit donc
  // JAMAIS créer d'opération — sinon le montant supposé (le total) divergerait
  // du versement saisi et le retry rouvrirait une seconde vente.
  function panierPourEncaissement(): {
    cart: {
      lines: CartLine[];
      customerId: number | null;
      amountPaidMinor: number;
      paymentMethod: "cash" | "cheque" | "transfer" | null;
      deliveryFeeMinor: number;
      saleOperationId: string | null;
      saleOperationKey: string | null;
      setSaleOperation: (key: string, id: string) => void;
    };
    setSaleOperation: ReturnType<typeof vi.fn>;
  } {
    const setSaleOperation = vi.fn();
    const cart = {
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
        } as CartLine,
      ],
      customerId: null,
      amountPaidMinor: 0,
      paymentMethod: "cash" as const,
      deliveryFeeMinor: 0,
      saleOperationId: null as string | null,
      saleOperationKey: null as string | null,
      setSaleOperation: (key: string, id: string) => {
        setSaleOperation(key, id);
        cart.saleOperationKey = key;
        cart.saleOperationId = id;
      },
    };
    return { cart, setSaleOperation };
  }

  it("préremplit le total dû, ouvre le dialogue, ne fige aucune opération", () => {
    const { cart, setSaleOperation } = panierPourEncaissement();
    const setPaidText = vi.fn();
    const setPayOpen = vi.fn();
    const deps = {
      cart,
      totals: { totalMinor: 1000, remainingMinor: 1000 },
      deliveryError: "",
      setPaidText,
      setDueDate: vi.fn(),
      setLimitOverride: vi.fn(),
      setPayOpen,
    };
    openPay(deps as never);
    expect(setPaidText).toHaveBeenCalledWith(minorToInputTotal(1000));
    expect(setPayOpen).toHaveBeenCalledWith(true);
    expect(setSaleOperation).not.toHaveBeenCalled();
    expect(cart.saleOperationId).toBeNull();
    // Réouverture (après une réponse perdue) : toujours aucune opération de plus.
    openPay(deps as never);
    expect(setSaleOperation).not.toHaveBeenCalled();
  });

  it("panier vide : refus en français, aucun dialogue ouvert", () => {
    const { cart, setSaleOperation } = panierPourEncaissement();
    cart.lines = [];
    const notify = vi.fn();
    const setPayOpen = vi.fn();
    openPay({
      cart,
      totals: { totalMinor: 0, remainingMinor: 0 },
      notify,
      deliveryError: "",
      setPaidText: vi.fn(),
      setDueDate: vi.fn(),
      setLimitOverride: vi.fn(),
      setPayOpen,
    } as never);
    expect(notify).toHaveBeenCalledWith("Panier vide : ajoutez au moins un article.", "err");
    expect(setPayOpen).not.toHaveBeenCalled();
    expect(setSaleOperation).not.toHaveBeenCalled();
  });
});

describe("shouldIgnoreBump : +/− dans les champs", () => {
  it("laisse +/− agir dans la recherche produit, pas dans les autres champs", () => {
    const search = { tagName: "INPUT" };
    expect(shouldIgnoreBump(search, search)).toBe(false);
    expect(shouldIgnoreBump({ tagName: "INPUT" }, search)).toBe(true);
    expect(shouldIgnoreBump({ tagName: "SELECT" }, search)).toBe(true);
    expect(shouldIgnoreBump(null, search)).toBe(false);
  });
});

describe("bumpLastQty : clavier +/−", () => {
  const line = {
    key: "l1",
    productId: 1,
    productName: "Article",
    unitCode: "PIECE",
    originalUnitPriceMinor: 1000,
    unitPriceMinor: 1000,
    purchasePriceMinor: 500,
    quantity: 1,
    stockQty: 5,
  };

  it("ne supprime pas la dernière unité avec −", () => {
    const setQty = vi.fn();
    const notify = vi.fn();
    bumpLastQty({ lines: [line], setQty } as never, -1, notify);
    expect(setQty).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("croix"), "err");
  });

  it("respecte le stock avec +", () => {
    const setQty = vi.fn();
    const notify = vi.fn();
    bumpLastQty({ lines: [{ ...line, quantity: 5 }], setQty } as never, 1, notify);
    expect(setQty).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Stock insuffisant"), "err");
  });

  it("ajuste la quantité de la dernière ligne dans la limite du stock", () => {
    const setQty = vi.fn();
    bumpLastQty({ lines: [line], setQty } as never, 1);
    expect(setQty).toHaveBeenCalledWith("l1", 2);
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
