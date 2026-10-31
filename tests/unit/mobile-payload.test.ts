import { describe, expect, it } from "vitest";
import { formatMinor } from "../../mobile/src/format";
import { toHome } from "../../mobile/src/views";

// Rejeu d'une charge miroir réaliste : chaque valeur affichée (hidden=false)
// doit passer formatMinor sans lever (régression mapSale : champ oublié =
// undefined = écran blanc sur device).
const SNAPSHOT = {
  customer: {
    outstanding_balance_minor: 375000,
    debt_status: "due",
    is_over_limit: 0,
    credit_limit_minor: 1000000,
    first_name: "Karim",
    last_name: "Ziani",
  },
  monthPurchasesMinor: 1250000,
  monthPaymentsMinor: 875000,
  loyaltyPoints: 12,
  lastSales: [
    {
      id: 5,
      invoice_number: "FAC-2026-0103",
      total_minor: 350000,
      amount_paid_minor: 175000,
      remaining_balance_minor: 175000,
      payment_status: "partial",
      is_cancelled: 0,
      created_at: "2026-09-15",
    },
    {
      id: 2,
      invoice_number: "FAC-2026-0102",
      total_minor: 400000,
      amount_paid_minor: 200000,
      remaining_balance_minor: 200000,
      payment_status: "partial",
      is_cancelled: 0,
      created_at: "2026-09-10",
    },
  ],
  lastPayments: [
    {
      id: 4,
      amount_minor: 175000,
      method: "cash",
      reference: null,
      sale_id: null,
      payment_date: "2026-09-28",
    },
  ],
  topProducts: [{ name: "Sucre 1kg", quantity: 50, lastPriceMinor: 9500 }],
  syncedAt: "2026-09-29T10:00:00.000Z",
  announcement: "Fermé vendredi",
  shop: { name: "Épicerie", phone: "0550", address: null },
};

describe("payload miroir : view-model complet et affichable", () => {
  it("aucun undefined dans le view-model + formatMinor ne lève jamais", () => {
    const h = toHome(SNAPSHOT);
    const seen: unknown[] = [];
    JSON.stringify(h, (_k, v: unknown) => {
      seen.push(v);
      return v;
    });
    for (const v of seen) {
      expect(v).not.toBeUndefined();
    }
    const shown = [
      h.debtMinor,
      h.monthPurchasesMinor,
      h.monthPaymentsMinor,
      ...h.lastSales.flatMap((s) => [
        s.total_minor,
        s.amount_paid_minor,
        s.remaining_balance_minor,
      ]),
      ...h.lastPayments.map((p) => p.amount_minor),
      ...h.topProducts.map((p) => p.lastPriceMinor),
    ];
    expect(shown.length).toBeGreaterThan(5);
    for (const v of shown) {
      expect(Number.isSafeInteger(v)).toBe(true);
      formatMinor(v, "ar");
      formatMinor(v, "fr");
    }
    expect(h.announcement).toBe("Fermé vendredi");
    // ADR-165 : le repli legacy alimente le bandeau hero (sans échéance).
    expect(h.announcements[0]?.text).toBe("Fermé vendredi");
    expect(h.shop.name).toBe("Épicerie");
  });
});
