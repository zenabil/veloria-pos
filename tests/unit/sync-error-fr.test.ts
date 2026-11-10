// Veloria PoS — FIX-P1-03 : lastError synchro toujours FR (main + UI).
// Source unique main : toUserMessage (technique → repli FR) ; ceinture UI :
// frError sur les valeurs stockées avant le correctif.
import { describe, expect, it } from "vitest";
import { toUserMessage } from "../../electron/ipc/ipc-errors";
import { frError } from "../../src/shared/errors/fr-map";

describe("FIX-P1-03 : erreur synchro affichable FR", () => {
  it("toUserMessage : 'fetch failed' technique → repli FR générique", () => {
    const out = toUserMessage(new TypeError("fetch failed"));
    expect(out.message).toBe("Une erreur inattendue est survenue. Réessayez.");
    expect(out.message).not.toMatch(/fetch failed/);
  });
  it("toUserMessage : message FR métier passe tel quel", () => {
    const out = toUserMessage(new Error("Miroir injoignable (HTTP 500)."));
    expect(out.message).toBe("Miroir injoignable (HTTP 500).");
  });
  it("I-02 : 'This operation was aborted' (AbortController miroir) → repli FR, jamais anglais", () => {
    const out = toUserMessage(new Error("This operation was aborted"));
    expect(out.message).not.toMatch(/aborted/);
    expect(out.message).toMatch(/[éèêàùüç]/);
    expect(frError("This operation was aborted", "Poussée impossible.")).toBe(
      "Poussée impossible.",
    );
    expect(frError(new Error("This operation was aborted"), "Poussée impossible.")).toBe(
      "Poussée impossible.",
    );
  });
  it("frError : ancienne valeur technique stockée → repli contextuel FR", () => {
    expect(frError("TypeError: fetch failed", "Poussée impossible.")).toBe("Poussée impossible.");
    expect(frError("Miroir injoignable (HTTP 500).", "Poussée impossible.")).toBe(
      "Miroir injoignable (HTTP 500).",
    );
  });
});
