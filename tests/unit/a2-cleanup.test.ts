// Veloria PoS — A2 : unification formatters (source unique).
import { describe, it, expect } from "vitest";
import { editionLabel, formatDateFr } from "@shared/formatters/format.ts";

describe("A2 unification formatters", () => {
  it("editionLabel centralise les libellés (remplace les doublons locaux)", () => {
    expect(editionLabel("basic", null)).toBe("Basique");
    expect(editionLabel("pro", null)).toBe("Professionnelle");
    expect(editionLabel("enterprise", "Plan Sur Mesure")).toBe("Plan Sur Mesure");
    expect(editionLabel(null, null)).toBe("—");
  });

  it("formatDateFr date seule JJ/MM/AAAA, invalide → —", () => {
    expect(formatDateFr(null)).toBe("—");
    expect(formatDateFr("n-importe-quoi")).toBe("—");
    expect(formatDateFr("2026-10-03T00:00:00.000Z")).toBe("03/10/2026");
  });
});
