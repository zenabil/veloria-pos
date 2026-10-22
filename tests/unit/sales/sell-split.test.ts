// Veloria PoS — Tests P2 : découpage SellScreen (parité avant/après, zéro changement fonctionnel).
// Ne couvre que le pur extrait vers sell/ : prédicats, constructeurs, invariants centimes.
import { describe, expect, it, vi, beforeEach } from "vitest";
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
  addCustomProduct,
  isBarcodeLike,
  isCustomerQueryReady,
  isLikelyScan,
  onQueryChange,
  parseCustomItemInput,
  runSearch,
  SCAN_IDLE_MS,
  searchIdleMs,
  TEXT_IDLE_MS,
  type SellSearchDeps,
} from "@/features/sales/sell/sell-search.ts";
import { shouldRefocusSearch, type ScanKey } from "@/features/sales/sell/useSellShortcuts.ts";
import { proformaOperationKey } from "@/features/sales/proforma-op.ts";
import type { SearchRow } from "@/features/sales/sell/sell-types.ts";
import { toCartDraftTabs } from "@/features/sales/sell/cart-drafts.ts";
import { computeLineTotal } from "@domain/sales/sale-rules.ts";
import { totalsOf, type CartLine } from "@/application/sales/create-sale.ts";
import type { CartTab } from "@/features/sales/cart-store.ts";
import { api } from "@shared/types/ipc-client.ts";

vi.mock("@shared/types/ipc-client.ts", () => ({
  api: {
    productByBarcode: vi.fn(),
    productSearch: vi.fn(),
    customerStatement: vi.fn(),
  },
}));

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
    deliveryFeeMinor: 0,
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
  it("isLikelyScan : probable scan complet (EAN 8+ chiffres, anti-bruit)", () => {
    expect(isLikelyScan("61912345")).toBe(true);
    expect(isLikelyScan("6191234567890")).toBe(true);
    expect(isLikelyScan("6191234")).toBe(false);
    expect(isLikelyScan("AB-12")).toBe(false);
    expect(isLikelyScan("")).toBe(false);
  });
  it("isCustomerQueryReady : 2 lettres minimum", () => {
    expect(isCustomerQueryReady("a")).toBe(false);
    expect(isCustomerQueryReady("am")).toBe(true);
    expect(isCustomerQueryReady("  am  ")).toBe(true);
  });
});

describe("sell-search : scan douchette (régression)", () => {
  const mockApi = api as unknown as {
    productByBarcode: ReturnType<typeof vi.fn>;
    productSearch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function fakeDeps(): {
    d: SellSearchDeps;
    addLine: ReturnType<typeof vi.fn>;
    notifs: Array<{ msg: string; kind: string }>;
    queries: string[];
    resultsLog: SearchRow[][];
    quantityDialogs: Array<SearchRow | null>;
    delays: number[];
  } {
    const notifs: Array<{ msg: string; kind: string }> = [];
    const queries: string[] = [];
    const resultsLog: SearchRow[][] = [];
    const quantityDialogs: Array<SearchRow | null> = [];
    const delays: number[] = [];
    const d = {
      cart: { addLine: vi.fn() },
      notify: (msg: string, kind: string) => {
        notifs.push({ msg, kind });
      },
      searchTimer: {
        schedule: (ms: number, _fn: () => void) => {
          delays.push(ms);
        },
        cancel: () => undefined,
      },
      searchSeq: { current: 0 },
      lastKeyAtRef: { current: 0 },
      scanBurstRef: { current: false },
      searchRef: { current: null },
      setQuery: (v: string) => {
        queries.push(v);
      },
      setResults: (v: SearchRow[]) => {
        resultsLog.push(v);
      },
      setSearching: (_v: boolean) => undefined,
      quantityFor: null,
      setQuantityFor: (v: SearchRow | null) => {
        quantityDialogs.push(v);
      },
    } as unknown as SellSearchDeps;
    return {
      d,
      addLine: d.cart.addLine as unknown as ReturnType<typeof vi.fn>,
      notifs,
      queries,
      resultsLog,
      quantityDialogs,
      delays,
    };
  }

  it("onQueryChange vide les résultats périmés (anti double ajout sur Entrée)", () => {
    const { d, resultsLog } = fakeDeps();
    onQueryChange(d, "6191");
    expect(resultsLog[resultsLog.length - 1]).toEqual([]);
  });

  it("onQueryChange invalide toute recherche en vol (seq synchrone)", () => {
    const { d } = fakeDeps();
    expect(d.searchSeq.current).toBe(0);
    onQueryChange(d, "6191");
    expect(d.searchSeq.current).toBe(1);
    onQueryChange(d, "");
    expect(d.searchSeq.current).toBe(2);
  });

  it("searchIdleMs : rafale machine ET code-barres → 90 ms, sinon 220 ms", () => {
    expect(searchIdleMs(true, true)).toBe(SCAN_IDLE_MS);
    expect(searchIdleMs(true, false)).toBe(TEXT_IDLE_MS);
    expect(searchIdleMs(false, true)).toBe(TEXT_IDLE_MS);
    expect(searchIdleMs(false, false)).toBe(TEXT_IDLE_MS);
    expect(SCAN_IDLE_MS).toBe(90);
    expect(TEXT_IDLE_MS).toBe(220);
  });

  it("onQueryChange rafale douchette sur code-barres : idle court (scan sans Entrée)", () => {
    const { d, delays } = fakeDeps();
    // Frappe précédente il y a 10 ms (< 60 ms) = cadence machine.
    d.lastKeyAtRef.current = Date.now() - 10;
    onQueryChange(d, "6191234567890");
    expect(d.scanBurstRef.current).toBe(true);
    expect(delays[delays.length - 1]).toBe(SCAN_IDLE_MS);
  });

  it("onQueryChange frappe humaine : idle historique (220 ms)", () => {
    const { d, delays } = fakeDeps();
    // Frappe précédente il y a 1 s (> 60 ms) = cadence humaine.
    d.lastKeyAtRef.current = Date.now() - 1_000;
    onQueryChange(d, "6191234567890");
    expect(d.scanBurstRef.current).toBe(false);
    expect(delays[delays.length - 1]).toBe(TEXT_IDLE_MS);
  });

  it("onQueryChange rafale machine sur texte : idle historique (jamais d'ajout par préfixe)", () => {
    const { d, delays } = fakeDeps();
    d.lastKeyAtRef.current = Date.now() - 10;
    // « huile de » n'est pas code-barres-like (espace) → idle long même en rafale.
    onQueryChange(d, "huile de");
    expect(delays[delays.length - 1]).toBe(TEXT_IDLE_MS);
  });

  it("runSearch scan inconnu : message FR, aucun ajout", async () => {
    mockApi.productByBarcode.mockResolvedValue({ product: null });
    mockApi.productSearch.mockResolvedValue({ rows: [] });
    const { d, addLine, notifs, resultsLog } = fakeDeps();
    await runSearch(d, "6199999999999");
    expect(addLine).not.toHaveBeenCalled();
    expect(resultsLog[resultsLog.length - 1]).toEqual([]);
    expect(notifs.map((n) => n.msg)).toEqual([
      "Code-barres inconnu : vérifiez la fiche produit (Catalogue).",
    ]);
  });

  it("runSearch scan connu (pièce) : ajout direct, silence", async () => {
    const row: SearchRow = {
      id: 3,
      name: "Sucre 1kg",
      selling_price_minor: 9000,
      purchase_price_minor: 7000,
      quantity: 10,
      unit_code: "PIECE",
      primary_barcode: "6191234567890",
    };
    mockApi.productByBarcode.mockResolvedValue({ product: row });
    const { d, addLine, notifs, queries } = fakeDeps();
    await runSearch(d, "6191234567890");
    expect(addLine).toHaveBeenCalledTimes(1);
    expect(notifs).toEqual([]);
    expect(queries).toContain("");
  });

  it("runSearch scan connu (KG, sans préfixe) : dialogue quantité, aucun ajout direct", async () => {
    const row: SearchRow = {
      id: 3,
      name: "Sucre 1kg",
      selling_price_minor: 9000,
      purchase_price_minor: 7000,
      quantity: 10,
      unit_code: "KG",
      primary_barcode: "6191234567890",
    };
    mockApi.productByBarcode.mockResolvedValue({ product: row });
    const { d, addLine, notifs, queries, quantityDialogs } = fakeDeps();
    await runSearch(d, "6191234567890");
    expect(addLine).not.toHaveBeenCalled();
    expect(quantityDialogs).toEqual([row]);
    expect(notifs).toEqual([]);
    expect(queries).toContain("");
  });

  it("runSearch scan avec préfixe (1,5*code) : ajout direct à la quantité du vendeur", async () => {
    const row: SearchRow = {
      id: 3,
      name: "Sucre 1kg",
      selling_price_minor: 9000,
      purchase_price_minor: 7000,
      quantity: 10,
      unit_code: "KG",
      primary_barcode: "6191234567890",
    };
    mockApi.productByBarcode.mockResolvedValue({ product: row });
    const { d, addLine, quantityDialogs } = fakeDeps();
    await runSearch(d, "1,5*6191234567890");
    expect(quantityDialogs).toEqual([]);
    expect(addLine).toHaveBeenCalledTimes(1);
    expect(addLine.mock.calls[0]?.[0]).toMatchObject({ quantity: 1.5, unitCode: "KG" });
  });

  it("runSearch saisie partielle ou texte sans résultat : silence", async () => {
    mockApi.productByBarcode.mockResolvedValue({ product: null });
    mockApi.productSearch.mockResolvedValue({ rows: [] });
    const a = fakeDeps();
    await runSearch(a.d, "6191");
    expect(a.notifs).toEqual([]);
    const b = fakeDeps();
    await runSearch(b.d, "huile de");
    expect(b.notifs).toEqual([]);
  });
});

describe("sell-search : refocus douchette (pur, testé)", () => {
  const base: ScanKey = {
    key: "6",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
  };

  it("chiffre hors champ → refocus (BODY, bouton, sans actif)", () => {
    expect(shouldRefocusSearch(base, "BODY", false)).toBe(true);
    expect(shouldRefocusSearch(base, "BUTTON", false)).toBe(true);
    expect(shouldRefocusSearch(base, null, false)).toBe(true);
    expect(shouldRefocusSearch({ ...base, key: "A" }, "BODY", false)).toBe(true);
  });

  it("jamais dans un champ, jamais avec modificateur", () => {
    for (const tag of ["INPUT", "SELECT", "TEXTAREA"]) {
      expect(shouldRefocusSearch(base, tag, false)).toBe(false);
    }
    expect(shouldRefocusSearch({ ...base, ctrlKey: true }, "BODY", false)).toBe(false);
    expect(shouldRefocusSearch({ ...base, metaKey: true }, "BODY", false)).toBe(false);
    expect(shouldRefocusSearch({ ...base, altKey: true }, "BODY", false)).toBe(false);
    expect(shouldRefocusSearch(base, "BODY", true)).toBe(false);
  });

  it("Espace/Entrée/répétition/IME/hors jeu scan → rien", () => {
    expect(shouldRefocusSearch({ ...base, key: " " }, "BODY", false)).toBe(false);
    expect(shouldRefocusSearch({ ...base, key: "Enter" }, "BODY", false)).toBe(false);
    expect(shouldRefocusSearch({ ...base, repeat: true }, "BODY", false)).toBe(false);
    expect(shouldRefocusSearch({ ...base, isComposing: true }, "BODY", false)).toBe(false);
    expect(shouldRefocusSearch({ ...base, key: "?" }, "BODY", false)).toBe(false);
    expect(shouldRefocusSearch({ ...base, key: "é" }, "BODY", false)).toBe(false);
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
      limitExceeded: false,
      projectedMinor: null,
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
  it("totalsOf livraison : total = lignes + frais, centimes entiers", () => {
    const lines = [line()];
    const t = totalsOf({ lines, deliveryFeeMinor: 1500, amountPaidMinor: 0 });
    expect(t.totalMinor).toBe(computeLineTotal(115000, 2) + 1500);
    expect(Number.isInteger(t.totalMinor)).toBe(true);
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

describe("sell-search : article libre refocalise la recherche (FIX-P1-04)", () => {
  it("addCustomProduct valide → ajout + fermeture + refocus recherche", () => {
    const addLine = vi.fn();
    const focus = vi.fn();
    const setCustomOpen = vi.fn();
    const setCustomForm = vi.fn();
    const d = {
      cart: { addLine },
      notify: vi.fn(),
      searchRef: { current: { focus } },
      customPriceRef: { current: null },
      setCustomOpen,
      setCustomForm,
      customForm: { name: "Sachet", price: "10,50", qty: "1" },
    } as unknown as SellSearchDeps;
    addCustomProduct(d);
    expect(addLine).toHaveBeenCalledTimes(1);
    expect(setCustomOpen).toHaveBeenCalledWith(false);
    expect(focus).toHaveBeenCalledTimes(1);
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
            billedTotalMinor: null,
          },
        ],
        customerId: null,
        customerLabel: "Client de passage",
        amountPaidMinor: 0,
        paymentMethod: "cash",
        deliveryFeeMinor: 0,
      },
    ]);
  });
});
