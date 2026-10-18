import { describe, it, expect } from "vitest";
import { computeIntakeTotals, validateAdjustment } from "@/domain/inventory/intake-rules.ts";
import {
  applySupplierIntakeBalance,
  applySupplierPayment,
  validateSupplierDraft,
} from "@/domain/suppliers/supplier-rules.ts";
import {
  computeProformaTotals,
  assertProformaTransition,
} from "@/domain/proforma/proforma-rules.ts";
import { computeClosingBalance } from "@/domain/closings/closing-rules.ts";
import { parseProductsCsv, parseCustomersCsv } from "@/domain/import/csv-import.ts";

describe("Phase 6 — entrées & ajustements", () => {
  it("valorise une entrée (reçu − abîmé) + port", () => {
    const t = computeIntakeTotals(
      [
        {
          productId: 1,
          productName: "Farine",
          quantityReceived: 10,
          quantityDamaged: 2,
          purchasePriceMinor: 5000,
        },
      ],
      1000,
    );
    expect(t.subtotalMinor).toBe(40000);
    expect(t.totalMinor).toBe(41000);
  });
  it("rejette abîmé > reçu et entrée vide", () => {
    expect(() =>
      computeIntakeTotals(
        [
          {
            productId: null,
            productName: "X",
            quantityReceived: 1,
            quantityDamaged: 2,
            purchasePriceMinor: 100,
          },
        ],
        0,
      ),
    ).toThrow();
    expect(() => computeIntakeTotals([], 0)).toThrow();
  });
  it("calcule le delta d'ajustement", () => {
    expect(validateAdjustment({ currentQty: 10, newQty: 7, reason: "Inventaire" })).toEqual({
      delta: -3,
      movementType: "adjust_out",
    });
    expect(() => validateAdjustment({ currentQty: 5, newQty: 5, reason: "Inventaire" })).toThrow();
  });
  it("valide la fiche fournisseur", () => {
    expect(() => validateSupplierDraft({ name: "Moulin", phone: null })).not.toThrow();
    expect(() => validateSupplierDraft({ name: "X", phone: null })).toThrow();
  });
  it("maintient le solde fournisseur", () => {
    expect(applySupplierIntakeBalance(10000, 25000)).toBe(35000);
    expect(applySupplierPayment(35000, 5000)).toBe(30000);
    expect(() => applySupplierPayment(1000, 2000)).toThrow();
  });
});

describe("Phase 7 — proformas", () => {
  it("totalise remise + livraison", () => {
    const t = computeProformaTotals(
      [{ productId: null, productName: "Lot", unitPriceMinor: 10000, quantity: 2 }],
      1000,
      500,
    );
    expect(t).toEqual({ subtotalMinor: 20000, totalMinor: 19500 });
  });
  it("interdit les transitions illégales", () => {
    expect(() => assertProformaTransition("draft", "sent")).not.toThrow();
    expect(() => assertProformaTransition("draft", "converted")).toThrow();
    expect(() => assertProformaTransition("converted", "cancelled")).toThrow();
  });
});

describe("Phase 8 — clôture Z", () => {
  it("clôture = ouverture + espèces + encaissements − dépenses − remboursements", () => {
    expect(
      computeClosingBalance({
        openingMinor: 10000,
        cashSalesMinor: 50000,
        customerCollectionsMinor: 5000,
        expensesMinor: 8000,
        refundsMinor: 2000,
      }),
    ).toBe(55000);
  });
});

describe("Import CSV validé-avant-commit", () => {
  it("parse les produits avec en-tête", () => {
    const rows = parseProductsCsv(
      "nom;prix_vente;prix_achat;quantite;code\nFarine;50;40;10;619001\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sellingPriceMinor).toBe(5000);
  });
  it("rejette tout le fichier sur une ligne invalide", () => {
    expect(() => parseProductsCsv("nom;prix\n;50\n")).toThrow();
    // P1-5 : ligne courte (sans achat/qté) = rejet, fini les zéros silencieux.
    expect(() => parseProductsCsv("nom;prix\nFarine;10\nSemoule;10\n")).toThrow();
    expect(() =>
      parseProductsCsv("nom;vente;achat;quantite\nFarine;50;40;10\nSemoule;60;50;5\n"),
    ).not.toThrow();
  });
  it("ne confond pas un produit avec l'en-tête", () => {
    const rows = parseProductsCsv("Nominal;10;8;5\nSemoule;20;15;3\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe("Nominal");
  });
  it("parse les clients", () => {
    const rows = parseCustomersCsv("prenom;nom;tel\nAmine;Benali;0550\n");
    expect(rows).toHaveLength(1);
    expect(() => parseCustomersCsv("prenom;nom\n;Benali\n")).toThrow();
  });
});
