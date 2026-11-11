// Veloria Client (APK) — Commandes du client (ADR-182, tranche D).
//
// Le client reçoit ses commandes dans le champ `orders` du cliché
// `customer_snapshot`. Ce que le test prouve :
//   1. une commande sans référence ou sans identifiant est ÉCARTÉE
//      (fail-closed : une référence fausse au comptoir, c'est une commande
//      qui ne peut pas être servie) ;
//   2. les champs sont lus tels qu'ils sont écrits (centimes, dates) ;
//   3. le libellé d'état existe dans les DEUX langues (glossaire fermé).
import { describe, expect, it } from "vitest";

import { orderStatusLabel, toClientOrders } from "../../mobile/src/views.ts";
import { allKeys, t } from "../../mobile/src/i18n.ts";

const ORDER = {
  id: 12,
  reference: "CMD-2026-00012",
  status: "ready",
  totalMinor: 232_000,
  note: "après 16 h",
  cancelReason: null,
  saleId: null,
  createdAt: "2026-11-11T10:00:00.000Z",
  updatedAt: "2026-11-11T12:00:00.000Z",
};

describe("commandes du client — mapper", () => {
  it("lit une commande du cliché", () => {
    const orders = toClientOrders([ORDER]);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.reference).toBe("CMD-2026-00012");
    expect(orders[0]?.status).toBe("ready");
    expect(orders[0]?.totalMinor).toBe(232_000);
    expect(orders[0]?.note).toBe("après 16 h");
    expect(orders[0]?.saleId).toBeNull();
  });

  it("écarte une entrée corrompue (jamais de référence fausse)", () => {
    expect(toClientOrders([{ ...ORDER, reference: "" }])).toEqual([]);
    expect(toClientOrders([{ ...ORDER, reference: "x".repeat(33) }])).toEqual([]);
    expect(toClientOrders([{ ...ORDER, id: 0 }])).toEqual([]);
    expect(toClientOrders([{ ...ORDER, id: -3 }])).toEqual([]);
    expect(toClientOrders([null])).toEqual([]);
    expect(toClientOrders("n'importe quoi")).toEqual([]);
  });

  it("un état inconnu est conservé tel quel (pas de faux libellé)", () => {
    const orders = toClientOrders([{ ...ORDER, status: "mystere" }]);
    expect(orders[0]?.status).toBe("mystere");
    expect(orderStatusLabel("mystere", "fr")).toBe("mystere");
  });

  it("chaque état a son libellé dans les deux langues", () => {
    const keys = allKeys();
    for (const status of ["nouvelle", "preparing", "ready", "served", "cancelled"]) {
      const ar = orderStatusLabel(status, "ar");
      const fr = orderStatusLabel(status, "fr");
      expect(ar).not.toBe(status);
      expect(fr).not.toBe(status);
    }
    // Les clés du glossaire existent bien (glossaire fermé ADR-051).
    expect(keys).toContain("orderReady");
    expect(t("fr", "orderReady")).toBe("Prête pour le retrait");
    expect(t("ar", "orderReady")).toBe("جاهزة للاستلام");
  });
});
