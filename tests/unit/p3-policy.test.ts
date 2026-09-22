// Veloria PoS — Tests P3 : politique de retour, alertes stock, audit.
import { describe, it, expect } from "vitest";
import { evaluateReturnPolicy } from "@/domain/returns/return-policy.ts";
import {
  lowStockStatus,
  expiryStatus,
  reorderSuggestion,
} from "@/domain/inventory/stock-alerts.ts";
import { buildAuditEvent } from "@/domain/audit/audit-rules.ts";

describe("P3 : return-policy", () => {
  const base = {
    saleDate: "2026-09-01",
    returnDate: "2026-09-10",
    maxDays: 15,
    restockingFeePct: 10,
    disposition: "restock" as const,
    returnTotalMinor: 20000,
  };
  it("autorise dans la fenêtre, frais 10% (2000), net 18000, restock", () => {
    const d = evaluateReturnPolicy(base);
    expect(d).toMatchObject({
      allowed: true,
      feeMinor: 2000,
      netRefundMinor: 18000,
      restock: true,
    });
  });
  it("refuse hors fenêtre avec motif FR", () => {
    const d = evaluateReturnPolicy({ ...base, returnDate: "2026-10-01" });
    expect(d.allowed).toBe(false);
    expect(d.reason ?? "").toContain("Fenêtre");
  });
  it("damage : pas de frais, pas de restock", () => {
    const d = evaluateReturnPolicy({ ...base, disposition: "damage" });
    expect(d).toMatchObject({ allowed: true, feeMinor: 0, netRefundMinor: 20000, restock: false });
  });
  it("rejette dates invalides et retour antérieur", () => {
    expect(() => evaluateReturnPolicy({ ...base, saleDate: "2026-13-01" })).toThrow();
    expect(() => evaluateReturnPolicy({ ...base, returnDate: "2026-08-01" })).toThrow();
    expect(() => evaluateReturnPolicy({ ...base, restockingFeePct: 101 })).toThrow();
  });
});

describe("P3 : stock-alerts", () => {
  it("niveaux bas/rupture/ok", () => {
    expect(lowStockStatus(0, 5)).toBe("out");
    expect(lowStockStatus(-2, 5)).toBe("out");
    expect(lowStockStatus(3, 5)).toBe("low");
    expect(lowStockStatus(5, 5)).toBe("low");
    expect(lowStockStatus(6, 5)).toBe("ok");
    expect(lowStockStatus(6, 0)).toBe("ok");
  });
  it("péremption : none/ok/soon/expired", () => {
    expect(expiryStatus(null, "2026-09-20", 30)).toBe("none");
    expect(expiryStatus("2026-09-10", "2026-09-20", 30)).toBe("expired");
    expect(expiryStatus("2026-10-01", "2026-09-20", 30)).toBe("soon");
    expect(expiryStatus("2027-01-01", "2026-09-20", 30)).toBe("ok");
    expect(() => expiryStatus("2026-13-01", "2026-09-20", 30)).toThrow();
  });
  it("suggestion de réassort", () => {
    expect(reorderSuggestion(10, 5, 20)).toBe(0);
    expect(reorderSuggestion(3, 5, 20)).toBe(17);
    expect(reorderSuggestion(0, 5, 20)).toBe(20);
  });
});

describe("P3 : audit-rules", () => {
  const base = {
    eventId: "e1",
    eventType: "sale.created",
    entityType: "sale",
    entityId: "42",
    operationId: "123e4567-e89b-12d3-a456-426614174000",
    createdAt: "2026-09-20T00:00:00.000Z",
  };
  it("construit la ligne + détails JSON", () => {
    const r = buildAuditEvent({ ...base, details: { total: 100 } });
    expect(r).toMatchObject({
      event_id: "e1",
      event_type: "sale.created",
      operation_id: base.operationId,
      details_json: '{"total":100}',
    });
  });
  it("refuse sans operationId (jamais de UUID silencieux)", () => {
    expect(() => buildAuditEvent({ ...base, operationId: "" })).toThrow("operationId");
    expect(() => buildAuditEvent({ ...base, operationId: "   " })).toThrow("operationId");
  });
  it("refuse champs vides", () => {
    expect(() => buildAuditEvent({ ...base, eventType: "" })).toThrow();
    expect(() => buildAuditEvent({ ...base, entityId: "" })).toThrow();
  });
});
