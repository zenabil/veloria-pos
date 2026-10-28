// Veloria PoS — Tests : paniers multiples (onglets caisse).
// Ouvrir un nouveau panier ne doit jamais supprimer les précédents.
import { describe, it, expect, beforeEach } from "vitest";
import { useCartsStore } from "@features/sales/cart-store.ts";
import type { CartLine } from "@/application/sales/create-sale.ts";
import type { CartTab } from "@features/sales/cart-store.ts";

function makeLine(key: string, productId: number | null = 7): CartLine {
  return {
    key,
    productId,
    productName: `Produit ${key}`,
    unitCode: "PIECE",
    originalUnitPriceMinor: 10000,
    unitPriceMinor: 10000,
    purchasePriceMinor: 5000,
    quantity: 1,
  };
}

function state(): ReturnType<typeof useCartsStore.getState> {
  return useCartsStore.getState();
}

describe("Paniers multiples (onglets)", () => {
  // P1-8 : état isolé — le store zustand est global ; sans reset, l'ordre
  // d'exécution change les assertions (tabs.length cumulé).
  beforeEach(() => {
    const s = useCartsStore.getState();
    for (const t of [...s.tabs]) s.closeTab(t.id);
  });

  it("ouvre un nouvel onglet sans supprimer le précédent", () => {
    state().addLine(makeLine("a"));
    const firstId = state().activeId;
    state().newTab();
    const s = state();
    expect(s.tabs.length).toBeGreaterThanOrEqual(2);
    expect(s.tabs.find((t) => t.id === firstId)?.lines).toHaveLength(1);
    const active = s.tabs.find((t) => t.id === s.activeId);
    expect(active?.id).not.toBe(firstId);
    expect(active?.lines).toHaveLength(0);
  });

  it("isole articles, client et paiement par onglet", () => {
    const s0 = state();
    const tabA = s0.activeId;
    s0.newTab();
    const tabB = state().activeId;
    state().addLine(makeLine("b"));
    state().setCustomer(42, "Client Test");
    state().setTotals({ amountPaidMinor: 5000, paymentMethod: "cheque" });

    state().switchTab(tabA);
    const a = state().tabs.find((t) => t.id === tabA);
    expect(a?.customerId).not.toBe(42);

    state().switchTab(tabB);
    const b = state().tabs.find((t) => t.id === tabB);
    expect(b?.lines).toHaveLength(1);
    expect(b?.customerId).toBe(42);
    expect(b?.customerLabel).toBe("Client Test");
    expect(b?.amountPaidMinor).toBe(5000);
    expect(b?.paymentMethod).toBe("cheque");
  });

  it("ignore le basculement vers un onglet inexistant", () => {
    const before = state().activeId;
    state().switchTab(-999999);
    expect(state().activeId).toBe(before);
  });

  it("ferme un onglet et active un voisin (dernier = réinitialisé)", () => {
    state().newTab();
    const toClose = state().activeId;
    state().addLine(makeLine("c"));
    const countBefore = state().tabs.length;
    state().closeTab(toClose);
    const s = state();
    expect(s.tabs.length).toBe(countBefore - 1);
    expect(s.tabs.some((t) => t.id === toClose)).toBe(false);
    expect(s.tabs.some((t) => t.id === s.activeId)).toBe(true);

    // Fermer jusqu'au dernier : il est réinitialisé, jamais supprimé.
    for (const t of [...state().tabs]) state().closeTab(t.id);
    const last = state();
    expect(last.tabs).toHaveLength(1);
    expect(last.tabs[0]?.lines).toHaveLength(0);
    expect(last.tabs[0]?.customerId).toBeNull();
  });

  it("garde des noms stables : fermer au milieu ne renomme pas les voisins", () => {
    // Replie tout vers un seul onglet (état de départ maîtrisé).
    for (const t of [...state().tabs]) state().closeTab(t.id);
    expect(state().tabs).toHaveLength(1);
    state().newTab();
    state().newTab();
    const before = state().tabs.map((t) => t.name);
    expect(new Set(before).size).toBe(3);

    const middle = state().tabs[1]?.id ?? -1;
    const survivorNames = [state().tabs[0]?.name, state().tabs[2]?.name];
    state().closeTab(middle);
    // Les survivants gardent leur nom (pas de renumérotation sous les yeux).
    expect(state().tabs.map((t) => t.name)).toEqual(survivorNames);

    state().newTab();
    const after = state().tabs.map((t) => t.name);
    // Nom frais et unique (compteur monotone), jamais de doublon.
    expect(new Set(after).size).toBe(3);
    expect(after.slice(0, 2)).toEqual(survivorNames);
  });

  it("fusionne les lignes identiques et retire à quantité nulle", () => {
    state().newTab();
    state().addLine(makeLine("d"));
    state().addLine(makeLine("d-bis", 7));
    const lines = state().tabs.find((t) => t.id === state().activeId)?.lines ?? [];
    // Même produit + même prix : fusion en une seule ligne quantité 2.
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(2);
    const key = lines[0]?.key ?? "";
    state().setQty(key, 0);
    expect(state().tabs.find((t) => t.id === state().activeId)?.lines).toHaveLength(0);
  });

  it("P0-7 : setLinePrice garde l'original et change le facturé", () => {
    state().newTab();
    state().addLine(makeLine("p"));
    const key = state().tabs.find((t) => t.id === state().activeId)?.lines[0]?.key ?? "";
    state().setLinePrice(key, 8000);
    const line = state().tabs.find((t) => t.id === state().activeId)?.lines[0];
    expect(line?.unitPriceMinor).toBe(8000);
    expect(line?.originalUnitPriceMinor).toBe(10000);
  });

  it("P0-7 : même produit à prix facturé différent = deux lignes", () => {
    state().newTab();
    state().addLine(makeLine("q1"));
    const other = { ...makeLine("q2"), unitPriceMinor: 8000 };
    state().addLine(other);
    const lines = state().tabs.find((t) => t.id === state().activeId)?.lines ?? [];
    expect(lines).toHaveLength(2);
  });
});

const OP_ID = "11111111-1111-4111-8111-111111111111";

function draftTab(over: Partial<CartTab> & { id: number }): CartTab {
  return {
    name: `Panier ${over.id}`,
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

function active(): CartTab | undefined {
  const s = state();
  return s.tabs.find((t) => t.id === s.activeId);
}

describe("Caisse : retrait, vidage et identité d'encaissement", () => {
  beforeEach(() => {
    const s = useCartsStore.getState();
    for (const t of [...s.tabs]) s.closeTab(t.id);
  });

  it("removeLine ne retire que la ligne visée de l'onglet actif", () => {
    // Deux produits DISTINCTS : deux lignes du même produit fusionnent (P1-6).
    state().addLine(makeLine("a", 7));
    state().addLine(makeLine("b", 8));
    state().removeLine("a");
    expect(active()?.lines.map((l) => l.key)).toEqual(["b"]);
  });

  it("clear vide les lignes ET remet client, paiement et opération à zéro", () => {
    state().addLine(makeLine("a"));
    state().setCustomer(12, "Karim");
    state().setTotals({ amountPaidMinor: 5000, paymentMethod: "cheque", deliveryFeeMinor: 200 });
    state().setSaleOperationId(OP_ID);
    state().clear();
    const t = active();
    expect(t?.lines).toEqual([]);
    expect(t?.amountPaidMinor).toBe(0);
    expect(t?.paymentMethod).toBe("cash");
    expect(t?.deliveryFeeMinor).toBe(0);
    expect(t?.customerId).toBeNull();
    // Vente aboutie ⇒ l'identité d'opération ne survit pas au vidage (un
    // nouveau panier doit porter une NOUVELLE opération, jamais rejouer celle-ci).
    expect(t?.saleOperationId).toBeNull();
  });

  it("setSaleOperationId reste collé à SON onglet quand un nouveau panier s'ouvre", () => {
    state().addLine(makeLine("a"));
    state().setSaleOperationId(OP_ID);
    const firstId = state().activeId;
    state().newTab();
    expect(state().tabs.find((t) => t.id === firstId)?.saleOperationId).toBe(OP_ID);
    expect(active()?.saleOperationId ?? null).toBeNull();
  });

  it("hydrate : brouillon corrompu ignoré, champs bornés, opération reprise", () => {
    state().hydrate([
      draftTab({
        id: 3,
        name: "X".repeat(60),
        lines: [makeLine("l1"), { ...makeLine("bad"), quantity: 0 }],
        saleOperationId: OP_ID,
        amountPaidMinor: -5,
        deliveryFeeMinor: 1.5,
      }),
      // id invalide (≤ 0) ⇒ onglet rejeté, et jamais de crash du chargement.
      draftTab({ id: 0, lines: [makeLine("l9")] }),
      // Aucune ligne retenue ⇒ onglet sauté (un panier vide ne réapparait pas).
      draftTab({ id: 5 }),
    ]);
    const s = state();
    expect(s.tabs.map((t) => t.id)).toEqual([3]);
    expect(s.activeId).toBe(3);
    const t = s.tabs[0];
    expect(t?.name).toHaveLength(40);
    expect(t?.lines.map((l) => l.key)).toEqual(["l1"]);
    expect(t?.amountPaidMinor).toBe(0);
    expect(t?.deliveryFeeMinor).toBe(0);
    // Retry après crash : le brouillon rejoue LA MÊME vente (operationId conservé).
    expect(t?.saleOperationId).toBe(OP_ID);
  });
});
