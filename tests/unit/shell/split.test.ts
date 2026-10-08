// Veloria PoS — Split shell : garde-fous non-fonctionnels (zéro changement métier).
import { describe, expect, it } from "vitest";
import { MODULES } from "@/app/shell/modules.ts";
import { MODULE_PAGES } from "@/app/shell/modules.ts";
import { LAZY_SCREENS } from "@/app/shell/module-screens.ts";
import { FALLBACK_HINTS, FOOTER_HINTS, hintsFor } from "@/app/shell/footer-hints.ts";
import { initialPrintMode, initialSidebarCollapsed } from "@/app/shell/shell-types.ts";
import type { ModuleId } from "@/app/shell/shell-types.ts";

const ALL_IDS: ModuleId[] = [
  "dashboard",
  "sell",
  "products",
  "customers",
  "suppliers",
  "stock",
  "history",
  "returns",
  "expenses",
  "debts",
  "reports",
  "bread",
  "proformas",
  "templates",
  "zakat",
  "settings",
  "license",
];

describe("shell split", () => {
  it("MODULES : 17 entrées uniques", () => {
    expect(MODULES).toHaveLength(17);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(17);
  });

  it("MODULE_PAGES : license=[] et tous les modules couverts", () => {
    expect(MODULE_PAGES.license).toEqual([]);
    for (const id of ALL_IDS) expect(MODULE_PAGES[id]).toBeDefined();
  });

  it("hintsFor : jamais vide (repli générique)", () => {
    for (const id of ALL_IDS) {
      const hints = hintsFor(id);
      expect(hints.length).toBeGreaterThan(0);
    }
    expect(FALLBACK_HINTS.length).toBeGreaterThan(0);
    expect(hintsFor("templates")).toEqual(FALLBACK_HINTS);
    expect(Object.keys(FOOTER_HINTS)).toHaveLength(17);
  });

  it("LAZY_SCREENS : 16 écrans (tout sauf la caisse)", () => {
    expect(Object.keys(LAZY_SCREENS).sort()).toEqual(ALL_IDS.filter((id) => id !== "sell").sort());
  });

  it("initial* : replis sûrs sans localStorage", () => {
    expect(initialPrintMode()).toBe("80mm");
    expect(initialSidebarCollapsed()).toBe(false);
  });
});
