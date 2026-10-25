// Veloria PoS — Tests caisse : vente au poids (ADR-114).
// Dialogue « quantité vendue » (poids OU montant) : unités continues,
// conversions quantité ↔ montant, flux ajout/dialogue, confirmation.
import { describe, expect, it } from "vitest";
import { isMeasuredUnit } from "@domain/units/units.ts";
import { quantityForAmountMinor } from "@domain/sales/weight-sale.ts";
import { parseQuantityInput } from "@domain/common/quantity.ts";
import { formatQuantityFr } from "@domain/common/quantity.ts";
import {
  isFeminineQuantityUnit,
  needsQuantityDialog,
  quantityNoun,
  weightDialogPreview,
} from "@/features/sales/sell/sell-weight.ts";
import {
  addProductOrAskQuantity,
  confirmWeightedAdd,
  type SellSearchDeps,
} from "@/features/sales/sell/sell-search.ts";
import type { CartLine } from "@/application/sales/create-sale.ts";
import type { SearchRow } from "@/features/sales/sell/sell-types.ts";

function row(over: Partial<SearchRow> = {}): SearchRow {
  return {
    id: 3,
    name: "Tomates",
    selling_price_minor: 45000,
    purchase_price_minor: 30000,
    quantity: 10,
    unit_code: "KG",
    primary_barcode: null,
    ...over,
  };
}

type WeightFlowDeps = Pick<
  SellSearchDeps,
  "cart" | "notify" | "searchRef" | "setQuantityFor" | "quantityFor" | "setQuery" | "setResults"
>;

function fakeDeps(open: SearchRow | null = null): {
  d: WeightFlowDeps;
  added: CartLine[];
  dialogs: Array<SearchRow | null>;
  notifs: string[];
  setQueryCalls: string[];
  setResultsCalls: SearchRow[][];
} {
  const added: CartLine[] = [];
  const dialogs: Array<SearchRow | null> = [];
  const notifs: string[] = [];
  const setQueryCalls: string[] = [];
  const setResultsCalls: SearchRow[][] = [];
  const d = {
    cart: {
      lines: [] as CartLine[],
      addLine: (l: CartLine) => {
        added.push(l);
      },
    },
    notify: (msg: string) => {
      notifs.push(msg);
    },
    searchRef: { current: null },
    quantityFor: open,
    setQuantityFor: (v: SearchRow | null) => {
      dialogs.push(v);
    },
    setQuery: (v: string) => {
      setQueryCalls.push(v);
    },
    setResults: (v: SearchRow[]) => {
      setResultsCalls.push(v);
    },
  } as unknown as WeightFlowDeps;
  return { d, added, dialogs, notifs, setQueryCalls, setResultsCalls };
}

describe("isMeasuredUnit : unités continues (poids/volume/longueur)", () => {
  it("KG/G/L/ML/CL/M vraies (casse et espaces tolérés)", () => {
    for (const u of ["KG", "kg", " G ", "L", "ML", "CL", "M"]) {
      expect(isMeasuredUnit(u)).toBe(true);
    }
  });
  it("unités discrètes/logistiques fausses", () => {
    for (const u of ["PIECE", "CARTON", "PAQUET", "AUTRE", "XYZ", ""]) {
      expect(isMeasuredUnit(u)).toBe(false);
    }
  });
});

describe("needsQuantityDialog : unité continue ET quantité non tapée", () => {
  it("unité continue sans quantité tapée → dialogue", () => {
    expect(needsQuantityDialog("KG", false)).toBe(true);
    expect(needsQuantityDialog("ML", false)).toBe(true);
  });
  it("quantité tapée (2,5*CODE) ou unité discrète → ajout direct", () => {
    expect(needsQuantityDialog("KG", true)).toBe(false);
    expect(needsQuantityDialog("PIECE", false)).toBe(false);
  });
});

describe("quantityNoun : libellé FR selon l'unité", () => {
  it("poids / volume / longueur / quantité", () => {
    expect(quantityNoun("KG")).toBe("Poids");
    expect(quantityNoun("g")).toBe("Poids");
    expect(quantityNoun("L")).toBe("Volume");
    expect(quantityNoun("ML")).toBe("Volume");
    expect(quantityNoun("M")).toBe("Longueur");
    expect(quantityNoun("PIECE")).toBe("Quantité");
  });
});

describe("isFeminineQuantityUnit : accord FR (Longueur féminin)", () => {
  it("M → féminin, autres → masculin", () => {
    expect(isFeminineQuantityUnit("M")).toBe(true);
    expect(isFeminineQuantityUnit(" m ")).toBe(true);
    expect(isFeminineQuantityUnit("KG")).toBe(false);
    expect(isFeminineQuantityUnit("G")).toBe(false);
    expect(isFeminineQuantityUnit("L")).toBe(false);
    expect(isFeminineQuantityUnit("ML")).toBe(false);
    expect(isFeminineQuantityUnit("CL")).toBe(false);
  });
});

describe("formatQuantityFr : quantité FR sans zéros parasites", () => {
  it("virgule décimale, sans zéros inutiles", () => {
    expect(formatQuantityFr(1.5)).toBe("1,5");
    expect(formatQuantityFr(1.235)).toBe("1,235");
    expect(formatQuantityFr(2)).toBe("2");
    expect(formatQuantityFr(0.001)).toBe("0,001");
  });
});

describe("parseQuantityInput : virgule FR, arrondi 3 décimales", () => {
  it("valeurs valides", () => {
    expect(parseQuantityInput("1,5")).toBe(1.5);
    expect(parseQuantityInput(" 2 ")).toBe(2);
    expect(parseQuantityInput("1,2345")).toBe(1.235);
    expect(parseQuantityInput("0,001")).toBe(0.001);
    expect(parseQuantityInput("1000000")).toBe(1000000);
  });
  it("invalides → null (jamais de quantité 0 silencieuse)", () => {
    expect(parseQuantityInput("")).toBeNull();
    expect(parseQuantityInput("abc")).toBeNull();
    expect(parseQuantityInput("0")).toBeNull();
    expect(parseQuantityInput("-3")).toBeNull();
    expect(parseQuantityInput("1000001")).toBeNull();
    expect(parseQuantityInput("0,0001")).toBeNull();
  });
  it("notations non décimales rejetées (1e3, 0x10, +5, .5, 5.)", () => {
    expect(parseQuantityInput("1e3")).toBeNull();
    expect(parseQuantityInput("0x10")).toBeNull();
    expect(parseQuantityInput("+5")).toBeNull();
    expect(parseQuantityInput(".5")).toBeNull();
    expect(parseQuantityInput("5.")).toBeNull();
    expect(parseQuantityInput("1,5,5")).toBeNull();
  });
});

describe("quantityForAmountMinor : montant ÷ prix unitaire", () => {
  it("conversion arrondie 3 décimales", () => {
    expect(quantityForAmountMinor(67500, 45000)).toBe(1.5);
    expect(quantityForAmountMinor(45000, 45000)).toBe(1);
    expect(quantityForAmountMinor(67550, 45000)).toBe(1.501);
  });
  it("montant trop petit → null (jamais quantité 0)", () => {
    expect(quantityForAmountMinor(1, 45000)).toBeNull();
    expect(quantityForAmountMinor(0, 45000)).toBeNull();
    expect(quantityForAmountMinor(-500, 45000)).toBeNull();
  });
  it("entrées non entières ou prix nul/négatif → null", () => {
    expect(quantityForAmountMinor(67550.5, 45000)).toBeNull();
    expect(quantityForAmountMinor(67500, 0)).toBeNull();
    expect(quantityForAmountMinor(67500, -45000)).toBeNull();
  });
  it("quantité hors borne (max 1 000 000) → null", () => {
    expect(quantityForAmountMinor(1_000_000_000, 1)).toBeNull();
  });
});

describe("weightDialogPreview : aperçu en direct du dialogue", () => {
  it("mode poids : quantité + total exact", () => {
    expect(weightDialogPreview("quantity", "1,5", 45000)).toEqual({
      qty: 1.5,
      totalMinor: 67500,
    });
    expect(weightDialogPreview("quantity", "2", 9000)).toEqual({ qty: 2, totalMinor: 18000 });
  });
  it("mode montant : quantité calculée + MONTANT SAISI facturé tel quel", () => {
    // ADR-114 révisé : le montant saisi est facturé EXACT (avant : poids
    // arrondi × prix ⇒ 675,50 DZD saisis facturés 675,45).
    expect(weightDialogPreview("amount", "675", 45000)).toEqual({ qty: 1.5, totalMinor: 67500 });
    expect(weightDialogPreview("amount", "675,50", 45000)).toEqual({
      qty: 1.501,
      totalMinor: 67550,
    });
    // Cas réel du propriétaire : 50 DZD à 700 DZD/kg → 0,071 kg, 50,00 DZD
    // facturés (et non 49,70).
    expect(weightDialogPreview("amount", "50", 70000)).toEqual({ qty: 0.071, totalMinor: 5000 });
  });
  it("saisies invalides → null", () => {
    expect(weightDialogPreview("quantity", "", 45000)).toBeNull();
    expect(weightDialogPreview("quantity", "0", 45000)).toBeNull();
    expect(weightDialogPreview("amount", "abc", 45000)).toBeNull();
    expect(weightDialogPreview("amount", "0,01", 45000)).toBeNull();
    expect(weightDialogPreview("amount", "100", 0)).toBeNull();
  });
  it("prix 0 en mode poids : total 0 facturé (pas d'exception)", () => {
    expect(weightDialogPreview("quantity", "1", 0)).toEqual({ qty: 1, totalMinor: 0 });
  });
});

describe("addProductOrAskQuantity : flux caisse (dialogue vs direct)", () => {
  it("unité continue sans préfixe → dialogue, aucun ajout", () => {
    const { d, added, dialogs } = fakeDeps();
    const p = row();
    expect(addProductOrAskQuantity(d, p, { quantity: 1, code: "tomate", explicit: false })).toBe(
      "dialog",
    );
    expect(dialogs).toEqual([p]);
    expect(added).toEqual([]);
  });
  it("préfixe tapé (2,5*CODE) → ajout direct à la quantité du vendeur", () => {
    const { d, added, dialogs } = fakeDeps();
    expect(
      addProductOrAskQuantity(d, row(), { quantity: 2.5, code: "tomate", explicit: true }),
    ).toBe("added");
    expect(dialogs).toEqual([]);
    expect(added).toHaveLength(1);
    expect(added[0]?.quantity).toBe(2.5);
  });
  it("unité discrète (pièce) → ajout direct ×1", () => {
    const { d, added, dialogs } = fakeDeps();
    expect(
      addProductOrAskQuantity(d, row({ unit_code: "PIECE" }), {
        quantity: 1,
        code: "x",
        explicit: false,
      }),
    ).toBe("added");
    expect(dialogs).toEqual([]);
    expect(added[0]?.quantity).toBe(1);
  });
});

describe("confirmWeightedAdd : confirmation du dialogue", () => {
  it("ajoute la ligne (1,5 kg), ferme le dialogue et nettoie la recherche", () => {
    const { d, added, dialogs, setQueryCalls, setResultsCalls } = fakeDeps(row());
    expect(confirmWeightedAdd(d, 1.5)).toBe(true);
    expect(added).toHaveLength(1);
    expect(added[0]?.quantity).toBe(1.5);
    expect(added[0]?.unitCode).toBe("KG");
    expect(dialogs).toContain(null);
    expect(setQueryCalls).toContain("");
    expect(setResultsCalls[0]).toEqual([]);
  });
  it("quantité invalide → refusé, rien ajouté (dialogue reste ouvert)", () => {
    const { d, added, dialogs } = fakeDeps(row());
    expect(confirmWeightedAdd(d, 0)).toBe(false);
    expect(confirmWeightedAdd(d, Number.NaN)).toBe(false);
    expect(confirmWeightedAdd(d, Number.POSITIVE_INFINITY)).toBe(false);
    expect(confirmWeightedAdd(d, -2)).toBe(false);
    // Bornes identiques domaine/IPC : ≤ 1 000 000.
    expect(confirmWeightedAdd(d, 1_000_001)).toBe(false);
    expect(added).toEqual([]);
    expect(dialogs).toEqual([]);
  });
  it("grande quantité décimale valide (16 384,005 kg) → acceptée (parité IPC)", () => {
    const { d, added, dialogs } = fakeDeps(row({ quantity: 20000 }));
    expect(confirmWeightedAdd(d, 16384.005)).toBe(true);
    expect(added).toHaveLength(1);
    expect(added[0]?.quantity).toBe(16384.005);
    expect(dialogs).toContain(null);
  });
  it("aucun dialogue ouvert → false silencieux", () => {
    const { d, added } = fakeDeps(null);
    expect(confirmWeightedAdd(d, 2)).toBe(false);
    expect(added).toEqual([]);
  });
});
