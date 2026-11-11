// Veloria Client (APK) — Panier + commande WhatsApp (ADR-182, tranche B).
//
// Ce que le test prouve :
//   1. le panier fusionne les lignes MÊME produit + MÊME prix, et ne fusionne
//      JAMAIS deux prix différents (le catalogue a pu changer) ;
//   2. les bornes sont tenues (lignes, quantité, prix unitaire) ;
//   3. le total est calculé en CENTIMES (jamais de flottant) ;
//   4. le message de commande dit que le total est ESTIMÉ et ne contient
//      JAMAIS la référence officielle du POS (`CMD-…` : c'est le master) ;
//   5. l'historique local est borné et le plus récent d'abord.
import { describe, expect, it } from "vitest";

import {
  CART_MAX_LINES,
  CART_MAX_PRICE_MINOR,
  CART_MAX_QTY,
  addLine,
  cartCount,
  cartHasUnavailableLine,
  cartLineCount,
  cartTotalMinor,
  isValidQuantity,
  multiplyMinorByQuantity,
  removeLine,
  roundQuantity,
  setLineQuantity,
  type CartLine,
} from "../../mobile/src/cart.ts";
import {
  SENT_ORDERS_MAX,
  buildOrderMessage,
  formatOrderLine,
  localOrderReference,
  pushSentOrder,
  type SentOrder,
} from "../../mobile/src/order.ts";
import {
  loadCartLines,
  loadSentOrders,
  saveCartLines,
  saveSentOrders,
} from "../../mobile/src/cache.ts";

function line(over: Partial<CartLine> = {}): CartLine {
  return {
    productId: 1,
    name: "زيت زيتون 1 لتر",
    unitCode: "PIECE",
    priceMinor: 85_000,
    quantity: 1,
    available: true,
    ...over,
  };
}

describe("panier — règles pures", () => {
  it("fusionne le même produit au même prix", () => {
    const once = addLine([], line());
    const twice = addLine(once, line());
    expect(twice).toHaveLength(1);
    expect(twice[0]?.quantity).toBe(2);
  });

  it("NE fusionne PAS deux prix différents (catalogue changé entre-temps)", () => {
    const first = addLine([], line({ priceMinor: 85_000 }));
    const second = addLine(first, line({ priceMinor: 90_000 }));
    expect(second).toHaveLength(2);
    expect(second[0]?.priceMinor).toBe(85_000);
    expect(second[1]?.priceMinor).toBe(90_000);
  });

  it("refuse une quantité nulle, négative, hors borne ou non finie", () => {
    const base = addLine([], line());
    expect(addLine(base, line({ quantity: 0 }))).toHaveLength(1);
    expect(addLine(base, line({ quantity: -2 }))).toHaveLength(1);
    expect(addLine(base, line({ quantity: CART_MAX_QTY + 1 }))).toHaveLength(1);
    expect(addLine(base, line({ quantity: Number.NaN }))).toHaveLength(1);
    // 3 décimales max : 0,001 (1 gramme) est valide, 0,0001 ne l'est pas.
    expect(isValidQuantity(0.001)).toBe(true);
    expect(isValidQuantity(0.0001)).toBe(false);
    expect(roundQuantity(1.23456)).toBe(1.235);
  });

  it("refuse un prix négatif ou hors plafond unitaire", () => {
    const base = addLine([], line());
    expect(addLine(base, line({ priceMinor: -1 }))).toHaveLength(1);
    expect(addLine(base, line({ priceMinor: CART_MAX_PRICE_MINOR + 1 }))).toHaveLength(1);
  });

  it("plafonne le nombre de lignes", () => {
    let lines: CartLine[] = [];
    for (let i = 0; i < CART_MAX_LINES + 10; i += 1) {
      lines = addLine(lines, line({ productId: i + 1, priceMinor: 1000 + i }));
    }
    expect(cartLineCount(lines)).toBe(CART_MAX_LINES);
  });

  it("change la quantité et retire une ligne", () => {
    const lines = addLine(addLine([], line()), line({ productId: 2, priceMinor: 5_000 }));
    expect(setLineQuantity(lines, 1, 85_000, 3)[0]?.quantity).toBe(3);
    // Quantité nulle = INVALIDE pour `setLineQuantity` (la suppression passe
    // par `removeLine` : une quantité nulle ne doit jamais rester en ligne).
    expect(setLineQuantity(lines, 1, 85_000, 0)[0]?.quantity).toBe(1);
    expect(removeLine(lines, 1)).toHaveLength(1);
    expect(removeLine(lines, 99)).toHaveLength(2);
  });

  it("total en centimes (jamais de flottant) et arrondi au centime", () => {
    // 85 000 × 2,5 = 212 500 exactement.
    expect(multiplyMinorByQuantity(85_000, 2.5)).toBe(212_500);
    // 0,1 × 85 000 = 8 500 (+ une queue de flottant) ⇒ arrondi, pas troncature.
    expect(multiplyMinorByQuantity(85_000, 0.1)).toBe(8_500);
    const lines = addLine(addLine([], line()), line({ productId: 2, priceMinor: 62_000 }));
    expect(cartTotalMinor(lines)).toBe(85_000 + 62_000);
    expect(cartCount(lines)).toBe(2);
  });

  it("signale une ligne devenue indisponible", () => {
    const lines = addLine([], line({ available: false }));
    expect(cartHasUnavailableLine(lines)).toBe(true);
    expect(cartHasUnavailableLine(addLine([], line()))).toBe(false);
  });
});

describe("commande WhatsApp — message structuré", () => {
  const draft = {
    lang: "ar" as const,
    reference: "W-000123",
    shopName: "متجر الأمل",
    customerName: "محمد حمداوي",
    customerPhone: "0550123456",
    lines: [line({ quantity: 2 }), line({ productId: 2, name: "أرز 5 كغ", priceMinor: 62_000 })],
    note: "بعد الساعة 16:00",
  };

  it("porte le magasin, la référence, le client, les lignes et le total", () => {
    const message = buildOrderMessage(draft);
    expect(message).toContain("متجر الأمل");
    expect(message).toContain("W-000123");
    expect(message).toContain("محمد حمداوي");
    expect(message).toContain("0550123456");
    expect(message).toContain("زيت زيتون 1 لتر × 2");
    expect(message).toContain("أرز 5 كغ");
    // 85 000 × 2 = 170 000 puis 62 000 ⇒ total 232 000 centimes.
    // Séparateur de milliers : U+202F (insécable étroit) — le même que
    // `formatMinor` (une espace normale couperait le nombre en RTL). Le motif
    // tolère les deux pour ne pas casser sur un détail typographique.
    expect(message).toMatch(/1[\s]700,00/);
    expect(message).toMatch(/2[\s]320,00/);
    expect(message).toContain("16:00");
  });

  it("dit que le total est ESTIMÉ (le prix fait foi est celui du comptoir)", () => {
    const message = buildOrderMessage(draft);
    expect(message).toContain("الإجمالي التقديري");
    expect(message).toContain("تُؤكَّد في المتجر");
  });

  it("NE contient JAMAIS la référence officielle du POS (`CMD-…`)", () => {
    // La référence officielle est générée par le POS (seul master) : deux
    // numérotations ne doivent pas cohabiter.
    expect(buildOrderMessage(draft)).not.toMatch(/CMD-/);
    expect(localOrderReference(42)).toMatch(/^W-\d{6}$/);
  });

  it("la version française est complète et traduite", () => {
    const message = buildOrderMessage({ ...draft, lang: "fr" });
    expect(message).toContain("Commande de réservation");
    expect(message).toContain("Total estimé");
    expect(message).toContain("confirmés au magasin");
    expect(message).toContain("Retrait: en boutique");
    expect(message).toMatch(/2[\s]320,00/);
  });

  it("une ligne sans nom reste lisible (jamais de ligne vide)", () => {
    expect(formatOrderLine(line({ name: "" }), "fr")).toContain("—");
  });
});

describe("historique local des commandes", () => {
  it("le plus récent d'abord, borné à SENT_ORDERS_MAX", () => {
    let list: SentOrder[] = [];
    for (let i = 0; i < SENT_ORDERS_MAX + 5; i += 1) {
      list = pushSentOrder(list, {
        reference: `W-${String(i).padStart(6, "0")}`,
        sentAt: "2026-11-11T10:00:00.000Z",
        count: 1,
        totalMinor: 100,
        lines: [line()],
        note: "",
      });
    }
    expect(list).toHaveLength(SENT_ORDERS_MAX);
    expect(list[0]?.reference).toBe(`W-${String(SENT_ORDERS_MAX + 4).padStart(6, "0")}`);
  });
});

describe("panier — persistance locale", () => {
  it("survit au rechargement (repli mémoire en test)", () => {
    saveCartLines([line({ quantity: 3 })]);
    const loaded = loadCartLines();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.quantity).toBe(3);
    expect(loaded[0]?.priceMinor).toBe(85_000);
  });

  it("écarte une ligne corrompue au lieu de l'afficher", () => {
    saveCartLines([
      line(),
      { productId: 0, name: "x", unitCode: "PIECE", priceMinor: 10, quantity: 1, available: true },
      { productId: 3, name: "y", unitCode: "PIECE", priceMinor: -5, quantity: 1, available: true },
      { productId: 4, name: "z", unitCode: "PIECE", priceMinor: 10, quantity: 0, available: true },
    ]);
    const loaded = loadCartLines();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.productId).toBe(1);
  });

  it("l'historique se relit aussi", () => {
    saveSentOrders([
      {
        reference: "W-000999",
        sentAt: "2026-11-11T10:00:00.000Z",
        count: 2,
        totalMinor: 147_000,
        lines: [line()],
        note: " urgent",
      },
    ]);
    const loaded = loadSentOrders();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.reference).toBe("W-000999");
    expect(loaded[0]?.note).toBe(" urgent");
  });
});
