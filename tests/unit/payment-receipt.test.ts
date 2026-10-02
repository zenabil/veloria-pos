// Veloria PoS — Tests : reçu historique (soldes reconstitués, centimes, pur).
import { describe, it, expect } from "vitest";
import { computePaymentReceiptBalances } from "@/domain/customer/payment-receipt";

describe("computePaymentReceiptBalances", () => {
  it("reconstitue prev/new dans l'ordre chronologique", () => {
    const r = computePaymentReceiptBalances({
      initialMinor: 0,
      sales: [{ id: 1, totalMinor: 20000, createdAt: "2026-01-01T10:00:00", cancelled: false }],
      payments: [
        { id: 1, amountMinor: 5000, createdAt: "2026-01-02T10:00:00" },
        { id: 2, amountMinor: 7000, createdAt: "2026-01-03T10:00:00" },
      ],
      targetPaymentId: 2,
    });
    expect(r).toEqual({ prevMinor: 15000, newMinor: 8000 });
  });

  it("tient compte du solde initial et ignore les ventes annulées", () => {
    const r = computePaymentReceiptBalances({
      initialMinor: 3000,
      sales: [
        { id: 1, totalMinor: 10000, createdAt: "2026-01-01T10:00:00", cancelled: true },
        { id: 2, totalMinor: 10000, createdAt: "2026-01-01T11:00:00", cancelled: false },
      ],
      payments: [{ id: 1, amountMinor: 4000, createdAt: "2026-01-02T10:00:00" }],
      targetPaymentId: 1,
    });
    expect(r).toEqual({ prevMinor: 13000, newMinor: 9000 });
  });

  it("ventes avant paiements à égalité d'horodatage", () => {
    const r = computePaymentReceiptBalances({
      initialMinor: 0,
      sales: [{ id: 9, totalMinor: 5000, createdAt: "2026-01-01T10:00:00", cancelled: false }],
      payments: [{ id: 3, amountMinor: 5000, createdAt: "2026-01-01T10:00:00" }],
      targetPaymentId: 3,
    });
    expect(r).toEqual({ prevMinor: 5000, newMinor: 0 });
  });

  it("refuse l'introuvable et l'invalide (jamais de centime inventé)", () => {
    const base = {
      initialMinor: 0,
      sales: [{ id: 1, totalMinor: 1000, createdAt: "2026-01-01T10:00:00", cancelled: false }],
      payments: [{ id: 1, amountMinor: 400, createdAt: "2026-01-02T10:00:00" }],
    };
    expect(computePaymentReceiptBalances({ ...base, targetPaymentId: 999 })).toBeNull();
    expect(
      computePaymentReceiptBalances({ ...base, targetPaymentId: 1, initialMinor: -1 }),
    ).toBeNull();
    expect(
      computePaymentReceiptBalances({
        ...base,
        targetPaymentId: 1,
        payments: [{ id: 1, amountMinor: 0, createdAt: "2026-01-02T10:00:00" }],
      }),
    ).toBeNull();
  });
});
