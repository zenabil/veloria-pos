// Veloria PoS — Tests : frError ne laisse jamais passer de technique brut.
import { describe, it, expect } from "vitest";
import { frError, isTechnicalMessage } from "@shared/errors/fr-map.ts";
import { DomainError } from "@domain/common/errors.ts";

describe("frError (P1-7)", () => {
  it("laisse passer les messages métier FR", () => {
    expect(frError(new DomainError("SALE_ERROR", "Le panier est vide."), "X")).toBe(
      "Le panier est vide.",
    );
    expect(frError(new Error("Ce code-barres existe déjà."), "X")).toBe(
      "Ce code-barres existe déjà.",
    );
    expect(frError(new Error("Transition interdite : new → delivered."), "X")).toBe(
      "Transition interdite : new → delivered.",
    );
  });
  it("mappe le technique brut vers le repli FR", () => {
    expect(
      frError(new TypeError("Cannot read properties of null (reading 'trim')"), "Saisie invalide."),
    ).toBe("Saisie invalide.");
    expect(frError(new Error("UNIQUE constraint failed: sales.invoice_number"), "X")).toBe("X");
    expect(frError(new Error("SQLITE_CORRUPT: database disk image is malformed"), "X")).toBe("X");
    expect(frError(new Error("ENOENT: no such file or directory"), "X")).toBe("X");
    expect(frError(new Error("Invalid Date"), "X")).toBe("X");
    expect(frError(new Error('[{"code":"invalid_type","expected":"number"}]'), "X")).toBe("X");
    expect(frError("plain string FR", "X")).toBe("plain string FR");
    expect(frError(undefined, "Repli.")).toBe("Repli.");
  });
  it("isTechnicalMessage : FR pur = false", () => {
    expect(isTechnicalMessage("Montant payé invalide.")).toBe(false);
    expect(isTechnicalMessage("Vente FAC-2026-00001 enregistrée.")).toBe(false);
    expect(isTechnicalMessage("Attention : prix sous coût.")).toBe(false);
    expect(isTechnicalMessage("at Object.parse (file.ts:10:5)")).toBe(true);
  });
});
