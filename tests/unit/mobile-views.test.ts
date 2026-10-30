// Veloria Client — view-models : miroir → écrans (tolérants, testés).
import { describe, expect, it } from "vitest";
import { formatMinor } from "../../mobile/src/format";
import {
  buildShareText,
  filterInvoices,
  num,
  numQty,
  paymentMethodLabel,
  paymentsByMethod,
  paymentsOfMonth,
  toDetail,
  toHome,
} from "../../mobile/src/views";

describe("toHome", () => {
  it("mappe le cliché, défauts sûrs si champs absents", () => {
    const h = toHome({
      customer: {
        outstanding_balance_minor: 250000,
        debt_status: "due",
        credit_limit_minor: 0,
        settlement_day: 30,
      },
      monthKey: "2026-10",
      monthPurchasesMinor: 100000,
      loyaltyPoints: 3,
      invoiceCount: 4,
      lastSales: [
        {
          id: 1,
          invoice_number: "FAC-1",
          total_minor: 100000,
          remaining_balance_minor: 50000,
          payment_status: "partial",
          is_cancelled: 0,
          created_at: "2026-09-01",
        },
      ],
      lastPayments: [],
      topProducts: [{ name: "Sucre", quantity: 2, lastPriceMinor: 9000 }],
    });
    expect(h.debtMinor).toBe(250000);
    expect(h.overLimit).toBe(false);
    expect(h.lastSales).toHaveLength(1);
    expect(h.invoiceCount).toBe(4);
    expect(h.monthKey).toBe("2026-10");
    expect(h.settlementDay).toBe(30);
    const empty = toHome(null);
    expect(empty.debtMinor).toBe(0);
    expect(empty.debtStatus).toBe("none");
    expect(empty.syncedAt).toBeNull();
    expect(empty.announcement).toBeNull();
    expect(empty.shop.name).toBe("Veloria");
    expect(empty.invoiceCount).toBe(0);
    expect(empty.monthKey).toBe("");
    expect(empty.settlementDay).toBe(0);
    // Ancien cliché sans invoiceCount : la prévisualisation (bornée) dépanne.
    expect(toHome({ lastSales: [{}, {}] }).invoiceCount).toBe(2);
  });
  it("mappe annonce + boutique, défauts sûrs", () => {
    const h = toHome({
      announcement: "Fermé vendredi",
      shop: { name: "Épicerie", phone: "0550", address: null },
    });
    expect(h.announcement).toBe("Fermé vendredi");
    expect(h.shop).toEqual({ name: "Épicerie", phone: "0550", address: null });
  });
});

describe("filterInvoices", () => {
  const rows = [
    {
      id: 1,
      invoice_number: "FAC-10",
      total_minor: 1,
      amount_paid_minor: 1,
      remaining_balance_minor: 0,
      payment_status: "paid",
      is_cancelled: 0,
      created_at: "x",
    },
    {
      id: 2,
      invoice_number: "FAC-11",
      total_minor: 1,
      amount_paid_minor: 0,
      remaining_balance_minor: 1,
      payment_status: "partial",
      is_cancelled: 0,
      created_at: "x",
    },
    {
      id: 3,
      invoice_number: "FAC-12",
      total_minor: 1,
      amount_paid_minor: 0,
      remaining_balance_minor: 1,
      payment_status: "unpaid",
      is_cancelled: 1,
      created_at: "x",
    },
  ];
  it("recherche insensible à la casse + filtres", () => {
    expect(filterInvoices(rows, "fac-1", "all")).toHaveLength(2);
    expect(filterInvoices(rows, "", "paid")).toHaveLength(1);
    expect(filterInvoices(rows, "", "cancelled")).toHaveLength(1);
    expect(filterInvoices(rows, "zzz", "all")).toHaveLength(0);
  });
});

describe("paymentsOfMonth", () => {
  it("ne garde que le mois AAAA-MM", () => {
    const rows = [
      {
        id: 1,
        amount_minor: 1,
        method: "cash",
        reference: null,
        sale_id: null,
        payment_date: "2026-09-02",
      },
      {
        id: 2,
        amount_minor: 1,
        method: "cash",
        reference: null,
        sale_id: null,
        payment_date: "2026-08-02",
      },
    ];
    expect(paymentsOfMonth(rows, "2026-09")).toHaveLength(1);
  });
});

describe("paymentsByMethod", () => {
  it("agrège total + nombre par méthode, tri décroissant, méthode vide → other", () => {
    const rows = [
      {
        id: 1,
        amount_minor: 1000,
        method: "cash",
        reference: null,
        sale_id: null,
        payment_date: "x",
      },
      {
        id: 2,
        amount_minor: 500,
        method: "cheque",
        reference: null,
        sale_id: null,
        payment_date: "x",
      },
      {
        id: 3,
        amount_minor: 2000,
        method: "cash",
        reference: null,
        sale_id: null,
        payment_date: "x",
      },
      { id: 4, amount_minor: 300, method: "", reference: null, sale_id: null, payment_date: "x" },
    ];
    expect(paymentsByMethod(rows)).toEqual([
      { method: "cash", totalMinor: 3000, count: 2 },
      { method: "cheque", totalMinor: 500, count: 1 },
      { method: "other", totalMinor: 300, count: 1 },
    ]);
    expect(paymentsByMethod([])).toEqual([]);
  });
});

describe("paymentMethodLabel", () => {
  it("libellés ar/fr, méthode inconnue rendue brute", () => {
    expect(paymentMethodLabel("fr", "cash")).toBe("Espèces");
    expect(paymentMethodLabel("fr", "cheque")).toBe("Chèque");
    expect(paymentMethodLabel("fr", "transfer")).toBe("Virement");
    expect(paymentMethodLabel("ar", "cash")).toBe("نقدي");
    expect(paymentMethodLabel("fr", "other")).toBe("other");
  });
});

describe("toDetail", () => {
  const payload = {
    sale: {
      id: 142,
      invoice_number: "FAC-2026-0142",
      total_minor: 845000,
      remaining_balance_minor: 325000,
      payment_status: "partial",
      is_cancelled: 0,
      created_at: "2026-09-26",
    },
    items: [
      {
        product_name_snapshot: "Huile",
        quantity: 2,
        unit_price_minor: 95000,
        line_total_minor: 190000,
      },
      { product_name_snapshot: "  ", quantity: 1, unit_price_minor: 5, line_total_minor: 5 },
    ],
  };
  it("mappe vente + lignes, payé dérivé si absent", () => {
    const d = toDetail(payload);
    expect(d?.sale.invoice_number).toBe("FAC-2026-0142");
    expect(d?.sale.amount_paid_minor).toBe(520000);
    expect(d?.items).toHaveLength(1);
    expect(d?.items[0]).toEqual({
      name: "Huile",
      quantity: 2,
      unitPriceMinor: 95000,
      lineTotalMinor: 190000,
    });
  });
  it("nul si vente illisible, lignes vides tolérées", () => {
    expect(toDetail(null)).toBeNull();
    expect(toDetail({ sale: { id: 0, invoice_number: "" } })).toBeNull();
    expect(toDetail({ sale: { id: 5, invoice_number: "F" } })?.items).toEqual([]);
  });
});

describe("num", () => {
  it("montant STRICT : non-entier → fallback 0 (jamais tronqué en valeur plausible)", () => {
    // RADICAL-FIX : tronquer 12.9 → 12 mentait (dette fausse crédible).
    // Un montant miroir non entier est corrompu → 0, pas une troncature.
    expect(num("12.9")).toBe(0);
    expect(num(12.5)).toBe(0);
    expect(num("1000")).toBe(1000);
    expect(num("abc")).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(Number.NaN)).toBe(0);
    expect(num(Number.POSITIVE_INFINITY)).toBe(0);
    // Hors entier sûr : formatMinor() jetterait au rendu → dégradation en 0.
    expect(num(1e300)).toBe(0);
    expect(() => formatMinor(num("12.9"), "fr")).not.toThrow();
    expect(() => formatMinor(num(1e300), "ar")).not.toThrow();
  });
});

describe("numQty", () => {
  it("préserve les décimales POS (kg, 3 décimales), rejette l'illisible", () => {
    // RADICAL-FIX : le POS pousse NUMERIC 3 décimales ; Math.trunc perdait 0.5 kg.
    expect(numQty(1.5)).toBe(1.5);
    expect(numQty("2.25")).toBe(2.25);
    expect(numQty(2)).toBe(2);
    expect(numQty("abc")).toBe(0);
    expect(numQty(null)).toBe(0);
    expect(numQty(-1)).toBe(0);
    expect(numQty(2_000_000)).toBe(0);
  });
  it("toDetail préserve 1.5 kg et arrondit la ligne comme le POS", () => {
    const d = toDetail({
      sale: {
        id: 7,
        invoice_number: "FAC-KG",
        total_minor: 2999,
        remaining_balance_minor: 0,
        payment_status: "paid",
        is_cancelled: 0,
        created_at: "2026-09-26",
      },
      items: [
        {
          product_name_snapshot: "Sucre",
          quantity: 1.5,
          unit_price_minor: 1999,
          // sans line_total : dérivé Math.round(1.5 * 1999) = 2999 (POS)
          // l'ancien `trunc(1.5)=1` donnait 1999 — faux de 1000 centimes.
        },
      ],
    });
    expect(d?.items[0]?.quantity).toBe(1.5);
    expect(d?.items[0]?.lineTotalMinor).toBe(2999);
  });
});

describe("buildShareText", () => {
  it("relevé bilingue sans PIN ni secrets", () => {
    const ar = buildShareText({
      lang: "ar",
      name: "Karim",
      debtMinor: 375000,
      syncedAt: "2026-09-29T10:00:00.000Z",
    });
    expect(ar).toContain("Karim");
    expect(ar).toContain("2026-09-29");
    expect(ar).not.toContain("482916");
    const fr = buildShareText({ lang: "fr", name: "K", debtMinor: 0, syncedAt: null });
    expect(fr).toContain("0,00 DZD");
    expect(fr).toContain("—");
  });
});
