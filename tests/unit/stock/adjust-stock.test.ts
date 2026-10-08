// Veloria PoS — Tests : use-case AdjustStock PUR (slice stock).
// `buildAdjustStockPayload` ne touche jamais l'IPC et ne génère jamais d'UUID :
// operationId absent = refus explicite (le dialogue le fournit).
// Parité Zod : toute charge construite passe `stockAdjustSchema` (main).
import { describe, it, expect } from "vitest";
import {
  buildAdjustStockPayload,
  type AdjustStockDraft,
} from "@/application/stock/adjust-stock.ts";
import { stockAdjustSchema } from "../../../electron/ipc/validators.ts";

const OP = "123e4567-e89b-12d3-a456-426614174000";

function draft(): AdjustStockDraft {
  return {
    productId: 7,
    currentQty: 10,
    kind: "in",
    quantity: 5,
    reasonPrefix: "Entrée",
    reason: "casse",
    notes: null,
    reference: null,
    operationId: OP,
  };
}

describe("buildAdjustStockPayload (pur, slice stock)", () => {
  it("construit la charge avec l'operationId de l'appelant (rejoué tel quel)", () => {
    const p = buildAdjustStockPayload(draft());
    expect(p).toEqual({
      operationId: OP,
      productId: 7,
      newQuantity: 15,
      reason: "Entrée : casse",
      reference: null,
    });
  });

  it("calcule sortie / correction via le domaine (jamais négatif)", () => {
    expect(buildAdjustStockPayload({ ...draft(), kind: "out", quantity: 4 }).newQuantity).toBe(6);
    expect(buildAdjustStockPayload({ ...draft(), kind: "set", quantity: 3 }).newQuantity).toBe(3);
    expect(() => buildAdjustStockPayload({ ...draft(), kind: "out", quantity: 50 })).toThrow(
      "négatif",
    );
  });

  it("suffixe les notes et normalise la référence", () => {
    const p = buildAdjustStockPayload({ ...draft(), notes: "  don  ", reference: " INV-1 " });
    expect(p.reason).toBe("Entrée : casse — don");
    expect(p.reference).toBe("INV-1");
  });

  it("refuse sans operationId / sans produit / motif court / notes longues", () => {
    expect(() => buildAdjustStockPayload({ ...draft(), operationId: "" })).toThrow("operationId");
    expect(() => buildAdjustStockPayload({ ...draft(), productId: 0 })).toThrow("Produit invalide");
    expect(() => buildAdjustStockPayload({ ...draft(), reason: "x" })).toThrow("Motif requis");
    expect(() => buildAdjustStockPayload({ ...draft(), notes: "n".repeat(501) })).toThrow(
      "Notes trop longues",
    );
  });

  it("parité Zod : la charge construite passe stockAdjustSchema (main)", () => {
    const p = buildAdjustStockPayload(draft());
    expect(stockAdjustSchema.safeParse(p).success).toBe(true);
  });
});
