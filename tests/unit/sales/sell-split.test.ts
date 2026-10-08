// Veloria PoS — Tests P2 : découpage SellScreen (parité avant/après, zéro changement fonctionnel).
// Ne couvre que le pur extrait vers sell/ : prédicats, constructeurs, invariants centimes.
import { describe, expect, it } from "vitest";
import {
  buildPrintPayload,
  buildProformaLines,
  buildSaleSnapshot,
  computeChangeMinor,
  creditBlockState,
  isValidDueDate,
  tabTotalOf,
  type CompanyFields,
} from "@/features/sales/sell/sell-totals.ts";
import {
  isBarcodeLike,
  isCustomerQueryReady,
  parseCustomItemInput,
} from "@/features/sales/sell/sell-search.ts";
import { proformaOperationKey } from "@/features/sales/proforma-op.ts";
import { toCartDraftTabs } from "@/features/sales/sell/cart-drafts.ts";
import { computeLineTotal } from "@domain/sales/sale-rules.ts";
import { totalsOf, type CartLine } from "@/application/sales/create-sale.ts";
import type { CartTab } from "@/features/sales/cart-store.ts";

const COMPANY: CompanyFields = {
  name: "Veloria",
  phone: "0550",
  address: "Rue",
  city: "Alger",
  email: "a@b.dz",
  rc: "RC",
  nif: "NIF",
  nis: "NIS",
  article: "ART",
};

function line(over: Partial<CartLine> = {}): CartLine {
  return {
    key: "l1",
    productId: 7,
    productName: "Huile 5L",
    unitCode: "PIECE",
    originalUnitPriceMinor: 120000,
    unitPriceMinor: 115000,
    purchasePriceMinor: 100000,
    quantity: 2,
    ...over,
  };
}

function tab(over: Partial<CartTab> = {}): CartTab {
  return {
    id: 1,
    name: "Panier 1",
    lines: [line()],
    customerId: null,
    customerLabel: "Client de passage",
    amountPaidMinor: 0,
    paymentMethod: "cash",
    ...over,
  };
}

describe("sell-search : prédicats", () => {
  it("isBarcodeLike : chemin indexé exact (≥4, sans espaces)", () => {
    expect(isBarcodeLike("6191234567890")).toBe(true);
    expect(isBarcodeLike("AB-12_.x")).toBe(true);
    expect(isBarcodeLike("abc")).toBe(false);
    expect(isBarcodeLike("a b c d")).toBe(false);
    expect(isBarcodeLike("")).toBe(false);
  });
  it("isCustomerQueryReady : 2 lettres minimum", () => {
    expect(isCustomerQueryReady("a")).toBe(false);
    expect(isCustomerQueryReady("am")).toBe(true);
    expect(isCustomerQueryReady("  am  ")).toBe(true);
  });
});

describe("sell-search : parseCustomItemInput (mêmes règles + messages)", () => {
  it("article valide (virgule FR acceptée en quantité)", () => {
    const r = parseCustomItemInput({ name: " Sachet ", price: "10,50", qty: "2,5" });
    expect(r).toEqual({ ok: true, item: { name: "Sachet", unitPriceMinor: 1050, quantity: 2.5 } });
  });
  it("quantité vide = défaut 1", () => {
    const r = parseCustomItemInput({ name: "X", price: "100", qty: "" });
    expect(r).toEqual({ ok: true, item: { name: "X", unitPriceMinor: 10000, quantity: 1 } });
  });
  it("nom vide → erreur sans focus prix", () => {
    expect(parseCustomItemInput({ name: "  ", price: "100", qty: "1" })).toEqual({
      ok: false,
      error: "Nom du produit requis.",
      focusPrice: false,
    });
  });
  it("prix vide → erreur + focus prix", () => {
    expect(parseCustomItemInput({ name: "X", price: "", qty: "1" })).toEqual({
      ok: false,
      error: "Prix unitaire requis.",
      focusPrice: true,
    });
  });
  it("prix nul ou quantité invalide → erreurs FR d'origine", () => {
    expect(parseCustomItemInput({ name: "X", price: "0", qty: "1" })).toEqual({
      ok: false,
      error: "Prix unitaire invalide (montant > 0).",
      focusPrice: true,
    });
    expect(parseCustomItemInput({ name: "X", price: "100", qty: "0" })).toEqual({
      ok: false,
      error: "Quantité invalide (nombre > 0).",
      focusPrice: false,
    });
  });
});

describe("sell-finalize : monnaie + crédit + échéance", () => {
  it("computeChangeMinor : rendu seulement si reçu > total (jamais stocké)", () => {
    expect(computeChangeMinor("200,00", true, { totalMinor: 15000 })).toBe(5000);
    expect(computeChangeMinor("150,00", true, { totalMinor: 15000 })).toBe(0);
    expect(computeChangeMinor("200,00", false, { totalMinor: 15000 })).toBe(0);
    expect(computeChangeMinor("200,00", true, null)).toBe(0);
    expect(computeChangeMinor("", true, { totalMinor: 15000 })).toBe(0);
  });
  it("creditBlockState : passage ou sans autorisation = bloqué", () => {
    expect(creditBlockState(true, { remainingMinor: 100 }, null, null)).toEqual({
      blocked: true,
      message: "Vente à crédit : choisissez un client autorisé au crédit.",
    });
    expect(creditBlockState(true, { remainingMinor: 100 }, 3, false).blocked).toBe(true);
    expect(creditBlockState(true, { remainingMinor: 100 }, 3, false).message).toBe(
      "Vente à crédit refusée : ce client n'est pas autorisé au crédit.",
    );
    expect(creditBlockState(true, { remainingMinor: 100 }, 3, true).blocked).toBe(false);
    expect(creditBlockState(true, { remainingMinor: 0 }, null, null).blocked).toBe(false);
    expect(creditBlockState(false, { remainingMinor: 100 }, null, null).blocked).toBe(false);
  });
  it("isValidDueDate : AAAA-MM-JJ strict", () => {
    expect(isValidDueDate("2026-10-07")).toBe(true);
    expect(isValidDueDate("07/10/2026")).toBe(false);
    expect(isValidDueDate("")).toBe(false);
  });
});

describe("sell-finalize : clichés + totaux", () => {
  it("tabTotalOf : vide → null, sinon total centimes", () => {
    expect(tabTotalOf(tab({ lines: [] }))).toBeNull();
    expect(tabTotalOf(tab())).toBe(computeLineTotal(115000, 2));
  });
  it("totalsOf invariant : total = somme des lignes (sans remise ni livraison)", () => {
    const lines = [line(), line({ key: "l2", unitPriceMinor: 5000, quantity: 1 })];
    const t = totalsOf({ lines, deliveryFeeMinor: 0, amountPaidMinor: 0 });
    expect(t.totalMinor).toBe(computeLineTotal(115000, 2) + computeLineTotal(5000, 1));
  });
  it("buildSaleSnapshot : refs, bornes, repli moyen de paiement", () => {
    const t = totalsOf({ lines: [line()], deliveryFeeMinor: 0, amountPaidMinor: 0 });
    const snap = buildSaleSnapshot(
      { ...tab(), paymentMethod: null, amountPaidMinor: 5000 } as never,
      t,
      "cash",
    );
    expect(snap.lines).toEqual([
      {
        name: "Huile 5L",
        qty: 2,
        unit: "PIECE",
        unitPriceMinor: 115000,
        lineTotalMinor: computeLineTotal(115000, 2),
        ref: "00007",
      },
    ]);
    expect(snap.paymentMethod).toBe("cash");
    expect(snap.paidMinor).toBe(5000);
    const snapLibre = buildSaleSnapshot(
      { ...tab({ lines: [line({ productId: null })] }), paymentMethod: "cheque" } as never,
      totalsOf({ lines: [line({ productId: null })], deliveryFeeMinor: 0, amountPaidMinor: 0 }),
      "cash",
    );
    expect(snapLibre.lines[0]?.ref).toBe("—");
    expect(snapLibre.paymentMethod).toBe("cheque");
  });
  it("buildProformaLines : même mapping que le devis d'origine", () => {
    expect(buildProformaLines(tab() as never)).toEqual([
      {
        name: "Huile 5L",
        qty: 2,
        unit: "PIECE",
        unitPriceMinor: 115000,
        lineTotalMinor: computeLineTotal(115000, 2),
        ref: "00007",
      },
    ]);
  });
  it("buildPrintPayload : mentions entreprise + timbre espèces uniquement", () => {
    const base = {
      invoice: "F-1",
      date: "d",
      lines: [],
      subtotalMinor: 200000,
      discountMinor: 0,
      deliveryMinor: 0,
      totalMinor: 200000,
      paidMinor: 200000,
      customerLabel: "P",
      customerName: "N",
      customerPhone: "",
      customerAddress: "",
      customerCode: "",
      paymentMethod: "cash" as const,
    };
    const cash = buildPrintPayload(COMPANY, base);
    expect(cash["company"]).toBe("Veloria");
    expect(cash["invoice"]).toBe("F-1");
    expect(cash["stampMinor"] as number).toBeGreaterThan(0);
    const cheque = buildPrintPayload(COMPANY, { ...base, paymentMethod: "cheque" });
    expect(cheque["stampMinor"]).toBe(0);
    const bal = buildPrintPayload(COMPANY, base, { prev: 1000, current: 1000 });
    expect(bal["prevBalanceMinor"]).toBe(1000);
    expect(bal["currentBalanceMinor"]).toBe(1000);
  });
});

describe("parité idempotence + brouillons", () => {
  it("proformaOperationKey : stable par contenu, sensible aux modifications", () => {
    const a = proformaOperationKey(3, [line(), line({ key: "l2" })]);
    const b = proformaOperationKey(3, [line(), line({ key: "l2" })]);
    expect(a).toBe(b);
    expect(proformaOperationKey(4, [line()])).not.toBe(proformaOperationKey(3, [line()]));
    expect(proformaOperationKey(3, [line({ quantity: 3 })])).not.toBe(
      proformaOperationKey(3, [line()]),
    );
  });
  it("toCartDraftTabs : projection inchangée après découpage", () => {
    expect(toCartDraftTabs([tab()])).toEqual([
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
          },
        ],
        customerId: null,
        customerLabel: "Client de passage",
        amountPaidMinor: 0,
        paymentMethod: "cash",
      },
    ]);
  });
});
