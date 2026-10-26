import { describe, expect, it } from "vitest";
import {
  SETTINGS_CARDS,
  SETTINGS_NAV_GROUPS,
  SETTINGS_SECTIONS,
  searchSettings,
  settingsCardsForSection,
} from "@/features/settings/types.ts";

describe("recherche paramètres", () => {
  it("retrouve une carte par mot-clé sans accent", () => {
    const hits = searchSettings("cred");
    expect(hits.some((h) => h.kind === "card" && h.id === "sales")).toBe(true);
    expect(hits.some((h) => h.kind === "card" && h.id === "customers")).toBe(true);
  });

  it("les réglages fusionnés restent trouvables (sons, fournisseurs, stock)", () => {
    expect(searchSettings("sons").some((h) => h.id === "sales")).toBe(true);
    expect(searchSettings("fournisseur").some((h) => h.id === "customers")).toBe(true);
    expect(searchSettings("stock").some((h) => h.id === "products")).toBe(true);
  });

  it("retrouve une rubrique par son libellé", () => {
    const hits = searchSettings("donnees");
    expect(hits.some((h) => h.kind === "section" && h.id === "data")).toBe(true);
  });

  it("retrouve la sauvegarde par « restauration »", () => {
    const hits = searchSettings("restauration");
    expect(hits.some((h) => h.kind === "card" && h.id === "backup")).toBe(true);
  });

  it("renvoie un résultat vide pour une requête vide", () => {
    expect(searchSettings("   ")).toEqual([]);
  });

  it("indexe toutes les cartes dans une rubrique connue", () => {
    for (const card of SETTINGS_CARDS) {
      expect(SETTINGS_SECTIONS.some((s) => s.id === card.section)).toBe(true);
      expect(settingsCardsForSection(card.section)).toContain(card);
    }
    const grouped = SETTINGS_NAV_GROUPS.flatMap((g) => g.items);
    expect(new Set(grouped)).toEqual(new Set(SETTINGS_SECTIONS.map((s) => s.id)));
  });
});
