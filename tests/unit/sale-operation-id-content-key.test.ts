// Veloria PoS — Tests M-1 (vente) : l'operationId d'encaissement est figé sur le
// CONTENU du panier. Un retry (double-clic, timeout, crash + reprise) rejoue la
// MÊME opération ; un panier corrigé ouvre une NOUVELLE opération. Sans cette
// liaison, le main rejouerait l'ancienne vente déjà committée (2 factures, ou
// pire : ancien total stocké + ticket imprimé du panier neuf, correction jamais
// vendue).
import { describe, it, expect, beforeEach } from "vitest";
import {
  pickSaleOperationId,
  persistedSaleOperationId,
  saleOperationKey,
  type SaleOperationContent,
} from "@/features/sales/sale-op.ts";
import { toCartDraftTabs } from "@/features/sales/sell/cart-drafts.ts";
import { useCartsStore, type CartTab } from "@/features/sales/cart-store.ts";
import type { CartLine } from "@/application/sales/create-sale.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function line(over: Partial<CartLine> = {}): CartLine {
  return {
    key: "l1",
    productId: 7,
    productName: "Huile 5L",
    unitCode: "PIECE",
    originalUnitPriceMinor: 120000,
    unitPriceMinor: 120000,
    purchasePriceMinor: 100000,
    quantity: 2,
    ...over,
  };
}

function cart(over: Partial<SaleOperationContent> = {}): SaleOperationContent {
  return {
    customerId: null,
    lines: [line()],
    amountPaidMinor: 240000,
    deliveryFeeMinor: 0,
    paymentMethod: "cash",
    ...over,
  };
}

/** Ce que fait `saleAttempt` (sell-finalize) : empreinte → UUID figé sur l'onglet. */
function tenterEncaissement(
  bound: { saleOperationId: string | null; saleOperationKey: string | null },
  contenu: SaleOperationContent,
): string {
  const attempt = pickSaleOperationId(bound, contenu);
  bound.saleOperationKey = attempt.key;
  bound.saleOperationId = attempt.operationId;
  return attempt.operationId;
}

function emptyBinding(): { saleOperationId: string | null; saleOperationKey: string | null } {
  return { saleOperationId: null, saleOperationKey: null };
}

describe("saleOperationKey : empreinte de contenu", () => {
  it("stable pour un contenu identique", () => {
    expect(saleOperationKey(cart())).toBe(saleOperationKey(cart()));
  });

  it("insensible à la clé d'affichage des lignes (rechargement / réédition)", () => {
    // `openTabWith` régénère les `key` (`l-<uuid>`) : l'identité d'opération ne
    // doit pas bouger pour autant, sinon le retry après crash rouvrirait une
    // seconde vente.
    expect(saleOperationKey(cart({ lines: [line({ key: "l1" })] }))).toBe(
      saleOperationKey(cart({ lines: [line({ key: "l-9f2c0a1e-0000-7000-8000-000000000000" })] })),
    );
  });

  it("sensible à chaque correction du panier", () => {
    const base = saleOperationKey(cart());
    // ligne ajoutée / retirée
    expect(saleOperationKey(cart({ lines: [line(), line({ key: "l2", productId: 8 })] }))).not.toBe(
      base,
    );
    expect(saleOperationKey(cart({ lines: [] }))).not.toBe(base);
    // quantité et prix facturés
    expect(saleOperationKey(cart({ lines: [line({ quantity: 3 })] }))).not.toBe(base);
    expect(saleOperationKey(cart({ lines: [line({ unitPriceMinor: 115000 })] }))).not.toBe(base);
    // montant saisi (mode « Montant » ADR-114)
    expect(saleOperationKey(cart({ lines: [line({ billedTotalMinor: 5000 })] }))).not.toBe(base);
    // conditionnement (tarif carton)
    expect(
      saleOperationKey(cart({ lines: [line({ packagingId: 4, packagingFactor: 6 })] })),
    ).not.toBe(base);
    // client, montant donné, frais de livraison, moyen de paiement
    expect(saleOperationKey(cart({ customerId: 12 }))).not.toBe(base);
    expect(saleOperationKey(cart({ amountPaidMinor: 100000 }))).not.toBe(base);
    expect(saleOperationKey(cart({ deliveryFeeMinor: 1500 }))).not.toBe(base);
    expect(saleOperationKey(cart({ paymentMethod: "cheque" }))).not.toBe(base);
  });

  it("deux paniers différents ⇒ deux empreintes", () => {
    const a = cart({ customerId: 3, lines: [line()] });
    const b = cart({ customerId: 4, lines: [line(), line({ key: "l2", productId: 9 })] });
    expect(saleOperationKey(a)).not.toBe(saleOperationKey(b));
  });
});

describe("pickSaleOperationId : retry rejoué, correction nouvelle opération", () => {
  it("même contenu réessayé ⇒ MÊME operationId (retry idempotent)", () => {
    const bound = emptyBinding();
    const premier = pickSaleOperationId(bound, cart());
    expect(premier.rotated).toBe(true);
    expect(premier.operationId).toMatch(UUID_RE);
    const seconde = pickSaleOperationId(
      { saleOperationId: premier.operationId, saleOperationKey: premier.key },
      cart(),
    );
    expect(seconde.rotated).toBe(false);
    expect(seconde.operationId).toBe(premier.operationId);
  });

  it("contenu modifié ⇒ operationId DIFFÉRENT (et non le rejeu de l'ancien)", () => {
    const bound = emptyBinding();
    const avant = tenterEncaissement(bound, cart());
    const apres = tenterEncaissement(bound, cart({ lines: [line({ quantity: 5 })] }));
    expect(apres).not.toBe(avant);
    expect(apres).toMatch(UUID_RE);
  });

  it("changement de client, de montant donné et de ligne ⇒ rotation", () => {
    for (const corrige of [
      cart({ customerId: 42 }),
      cart({ amountPaidMinor: 90000 }),
      cart({ lines: [] }),
      cart({ lines: [line({ productId: null, productName: "Article libre" })] }),
    ]) {
      const bound = emptyBinding();
      const avant = tenterEncaissement(bound, cart());
      const apres = tenterEncaissement(bound, corrige);
      expect(apres, "nouvelle opération après correction").not.toBe(avant);
    }
  });

  it("deux paniers distincts ⇒ deux opérations distinctes", () => {
    const panierA = emptyBinding();
    const panierB = emptyBinding();
    expect(tenterEncaissement(panierA, cart({ customerId: 1 }))).not.toBe(
      tenterEncaissement(panierB, cart({ customerId: 2 })),
    );
  });

  it("le même contenu confirmé deux fois de suite ouvre bien deux ventes", () => {
    // Après un succès le panier est vidé (`clear`) : la tentative suivante
    // repart d'un lien neuf, sinon un panier ressaisi à l'identique serait
    // écrasé par le résultat stocké de la vente précédente.
    const bound = emptyBinding();
    const premiere = tenterEncaissement(bound, cart());
    bound.saleOperationId = null;
    bound.saleOperationKey = null;
    expect(tenterEncaissement(bound, cart())).not.toBe(premiere);
  });
});

describe("persistedSaleOperationId : le brouillon ne porte un UUID que lié à SON contenu", () => {
  it("conservé tant que le contenu ne bouge pas", () => {
    const bound = emptyBinding();
    const operationId = tenterEncaissement(bound, cart());
    expect(persistedSaleOperationId(bound, cart())).toBe(operationId);
  });

  it("abandonné dès que le panier diverge (puis rechargé = nouvelle opération)", () => {
    const bound = emptyBinding();
    tenterEncaissement(bound, cart());
    expect(persistedSaleOperationId(bound, cart({ amountPaidMinor: 120000 }))).toBeNull();
    // Rechargement du brouillon sans UUID : la prochaine tentative en génère un.
    expect(
      pickSaleOperationId({ saleOperationId: null, saleOperationKey: null }, cart()).rotated,
    ).toBe(true);
  });
});

function tabDrafte(over: Partial<CartTab> & { id: number }): CartTab {
  return {
    name: `Panier ${over.id}`,
    lines: [line()],
    customerId: null,
    customerLabel: "Client de passage",
    amountPaidMinor: 240000,
    paymentMethod: "cash",
    deliveryFeeMinor: 0,
    saleOperationId: null,
    saleOperationKey: null,
    ...over,
  };
}

describe("brouillon persisté ↔ rechargé : la liaison survit au redémarrage", () => {
  beforeEach(() => {
    const s = useCartsStore.getState();
    for (const t of [...s.tabs]) s.closeTab(t.id);
  });

  it("toCartDraftTabs n'écrit l'UUID que s'il est encore collé au contenu", () => {
    const bound = emptyBinding();
    const operationId = tenterEncaissement(bound, cart());
    const lie = tabDrafte({
      id: 1,
      saleOperationId: operationId,
      saleOperationKey: bound.saleOperationKey,
    });
    expect(toCartDraftTabs([lie])[0]?.saleOperationId).toBe(operationId);
    // Panier modifié (quantité) avec l'ancien lien : plus d'UUID dans le brouillon.
    const derive = tabDrafte({
      id: 2,
      lines: [line({ quantity: 9 })],
      amountPaidMinor: 108000,
      saleOperationId: operationId,
      saleOperationKey: bound.saleOperationKey,
    });
    expect(toCartDraftTabs([derive])[0]?.saleOperationId).toBeNull();
  });

  it("hydrate : le brouillon rechargé rejoue la même tentative, puis se renouvelle sur correction", () => {
    const bound = emptyBinding();
    const operationId = tenterEncaissement(bound, cart());
    useCartsStore.getState().hydrate([
      tabDrafte({
        id: 4,
        saleOperationId: operationId,
        saleOperationKey: bound.saleOperationKey,
      }),
    ]);
    const recharge = useCartsStore.getState().tabs[0];
    expect(recharge?.saleOperationId).toBe(operationId);
    // Retry après crash, panier inchangé : MÊME opération (le main rejoue).
    expect(pickSaleOperationId(recharge ?? {}, cart()).operationId).toBe(operationId);
    // Panier corrigé après rechargement : NOUVELLE opération.
    expect(
      pickSaleOperationId(recharge ?? {}, cart({ lines: [line({ quantity: 1 })] })).rotated,
    ).toBe(true);
  });
});
