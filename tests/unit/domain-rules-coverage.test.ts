// Veloria PoS — W4 : couverture des règles DOMAINE non exercées.
// Contexte : `npm run test:coverage` était ROUGE (18 dépassements de seuil sur
// 5 fichiers domain). Ces tests ne baissent AUCUN seuil : ils couvrent les
// branches réellement non testées (fiches produit, fournisseurs, bons de
// commande, retours, import CSV).
import { describe, it, expect } from "vitest";
import {
  normalizeUnitCode,
  validateProductDraft,
  type ProductDraft,
} from "@/domain/product/product-rules.ts";
import {
  formatSupplierCode,
  validateSupplierDraft,
  applySupplierPayment,
} from "@/domain/suppliers/supplier-rules.ts";
import { poStatusLabelFr } from "@/domain/suppliers/po-rules.ts";
import {
  computeReturnLineTotal,
  validateReturnLines,
  type ReturnLineInput,
} from "@/domain/returns/return-rules.ts";
import { parseProductsCsv, parseCustomersCsv } from "@/domain/import/csv-import.ts";

function draft(over: Partial<ProductDraft> = {}): ProductDraft {
  return {
    name: "Farine",
    categoryId: null,
    unitCode: "PIECE",
    purchasePriceMinor: 5000,
    sellingPriceMinor: 7000,
    quantity: 10,
    minStockLevel: 2,
    expirationDate: null,
    supplierId: null,
    barcodes: [],
    ...over,
  };
}

function returnLine(over: Partial<ReturnLineInput> = {}): ReturnLineInput {
  return {
    productId: 1,
    productName: "Farine",
    unitPriceMinor: 10000,
    purchasePriceMinor: 8000,
    soldQuantity: 5,
    alreadyReturned: 0,
    returnQuantity: 1,
    restocked: true,
    ...over,
  };
}

describe("W4 — règles produit (product-rules)", () => {
  it("normalizeUnitCode : défaut PIECE, normalisation, unité inconnue refusée", () => {
    expect(normalizeUnitCode("")).toBe("PIECE");
    expect(normalizeUnitCode("  kg ")).toBe("KG");
    expect(() => normalizeUnitCode("XYZ")).toThrow(/Unité invalide/);
  });

  it("nom : trop court / trop long refusés", () => {
    expect(() => validateProductDraft(draft({ name: "F" }))).toThrow(/nom du produit/i);
    expect(() => validateProductDraft(draft({ name: "a".repeat(201) }))).toThrow(/trop long/i);
  });

  it("unité inconnue refusée", () => {
    expect(() => validateProductDraft(draft({ unitCode: "ZZZ" }))).toThrow();
  });

  it("péremption : date impossible refusée, date réelle acceptée", () => {
    expect(() => validateProductDraft(draft({ expirationDate: "2026-02-30" }))).toThrow(
      /péremption/i,
    );
    expect(() => validateProductDraft(draft({ expirationDate: "2026-02-28" }))).not.toThrow();
  });

  it("quantité négative refusée, zéro autorisé", () => {
    expect(() => validateProductDraft(draft({ quantity: -1 }))).toThrow(/quantité/i);
    expect(() => validateProductDraft(draft({ quantity: 0, minStockLevel: 0 }))).not.toThrow();
  });

  it("stock maximum incohérent refusé, plafond absent accepté", () => {
    expect(() => validateProductDraft(draft({ minStockLevel: 5, maxStockLevel: 2 }))).toThrow(
      /incohérent/i,
    );
    expect(() => validateProductDraft(draft({ minStockLevel: 5, maxStockLevel: 0 }))).not.toThrow();
    expect(() => validateProductDraft(draft({ minStockLevel: 5, maxStockLevel: 9 }))).not.toThrow();
  });

  it("codes-barres : vide, trop long, dupliqué et EAN invalide refusés", () => {
    expect(() => validateProductDraft(draft({ barcodes: ["  "] }))).toThrow(/vide/i);
    expect(() => validateProductDraft(draft({ barcodes: ["9".repeat(65)] }))).toThrow(/trop long/i);
    expect(() => validateProductDraft(draft({ barcodes: ["ABC-1", "ABC-1"] }))).toThrow(
      /dupliqué/i,
    );
    // EAN-13 avec une clé de contrôle fausse : refusée par le domaine.
    expect(() => validateProductDraft(draft({ barcodes: ["1234567890123"] }))).toThrow(/EAN/i);
    // EAN-13 valide : accepté.
    expect(() => validateProductDraft(draft({ barcodes: ["4006381333931"] }))).not.toThrow();
  });

  it("fiche valide acceptée", () => {
    expect(() => validateProductDraft(draft({ barcodes: ["ABC-1"] }))).not.toThrow();
  });
});

describe("W4 — règles fournisseurs (supplier-rules)", () => {
  it("nom trop court refusé", () => {
    expect(() => validateSupplierDraft({ name: "A" })).toThrow(/2 caractères/);
  });

  it("champs trop longs refusés (code, contact, téléphone, adresse, NIF, RC, notes)", () => {
    expect(() => validateSupplierDraft({ name: "FOU", code: "c".repeat(21) })).toThrow(/Code/);
    expect(() => validateSupplierDraft({ name: "FOU", contact: "c".repeat(101) })).toThrow(
      /Contact/,
    );
    expect(() => validateSupplierDraft({ name: "FOU", phone: "0".repeat(31) })).toThrow(
      /Téléphone/,
    );
    expect(() => validateSupplierDraft({ name: "FOU", address: "a".repeat(301) })).toThrow(
      /Adresse/,
    );
    expect(() => validateSupplierDraft({ name: "FOU", taxNumber: "0".repeat(51) })).toThrow(/NIF/);
    expect(() =>
      validateSupplierDraft({ name: "FOU", commercialRegister: "0".repeat(51) }),
    ).toThrow(/Registre/);
    expect(() => validateSupplierDraft({ name: "FOU", notes: "n".repeat(501) })).toThrow(/Notes/);
  });

  it("email invalide refusé, email vide accepté", () => {
    expect(() => validateSupplierDraft({ name: "FOU", email: "pas-un-email" })).toThrow(/Email/);
    expect(() => validateSupplierDraft({ name: "FOU", email: "" })).not.toThrow();
    expect(() => validateSupplierDraft({ name: "FOU", email: "a@b.dz" })).not.toThrow();
  });

  it("fiche fournisseur valide acceptée", () => {
    expect(() =>
      validateSupplierDraft({
        name: "Fournisseur",
        code: "FOU-1",
        contact: "Contact",
        phone: "0550123456",
        email: "a@b.dz",
        address: "Adresse",
        taxNumber: "1234",
        commercialRegister: "RC",
        notes: "ok",
      }),
    ).not.toThrow();
  });

  it("formatSupplierCode : identifiant invalide refusé, format stable", () => {
    expect(() => formatSupplierCode(0)).toThrow(/Identifiant/);
    expect(formatSupplierCode(7)).toBe("FOU-00007");
  });

  it("applySupplierPayment : montant invalide et paiement > dette refusés", () => {
    expect(applySupplierPayment(5000, 2000)).toBe(3000);
    expect(() => applySupplierPayment(-1, 100)).toThrow(/Solde fournisseur invalide/);
    expect(() => applySupplierPayment(1000, 0)).toThrow(/Montant de paiement invalide/);
    expect(() => applySupplierPayment(1000, 2000)).toThrow(/dépasse la dette/i);
  });
});

describe("W4 — bons de commande (po-rules)", () => {
  it("libellés FR de chaque statut + repli", () => {
    expect(poStatusLabelFr("draft")).toBe("Brouillon");
    expect(poStatusLabelFr("ordered")).toBe("Commandée");
    expect(poStatusLabelFr("partially_received")).toBe("Partiellement reçue");
    expect(poStatusLabelFr("received")).toBe("Reçue");
    expect(poStatusLabelFr("cancelled")).toBe("Annulée");
    expect(poStatusLabelFr("inconnu")).toBe("—");
  });
});

describe("W4 — règles de retour (return-rules)", () => {
  it("computeReturnLineTotal : prix invalide et dépassement refusés", () => {
    expect(computeReturnLineTotal(10000, 2)).toBe(20000);
    expect(() => computeReturnLineTotal(-1, 2)).toThrow(/Prix unitaire/);
    expect(() => computeReturnLineTotal(1_000_000_000, 1_000_000)).toThrow(/dépassement/i);
  });

  it("validateReturnLines : vide, trop volumineux, quantité ineligible refusés", () => {
    expect(() => validateReturnLines([])).toThrow(/Aucune ligne/);
    expect(() => validateReturnLines(Array.from({ length: 501 }, () => returnLine()))).toThrow(
      /trop volumineux/,
    );
    expect(() =>
      validateReturnLines([returnLine({ soldQuantity: 5, alreadyReturned: 4, returnQuantity: 2 })]),
    ).toThrow(/supérieure à la quantité éligible/);
  });

  it("validateReturnLines : total valide et dépassement de capacité refusé", () => {
    expect(validateReturnLines([returnLine({ returnQuantity: 2 })])).toBe(20000);
    const many = Array.from({ length: 500 }, () =>
      returnLine({ unitPriceMinor: 1_000_000_000, returnQuantity: 1 }),
    );
    expect(() => validateReturnLines(many)).toThrow(/Total retour invalide/);
  });
});

describe("W4 — import CSV (csv-import)", () => {
  it("fichier vide refusé (produits et clients)", () => {
    expect(() => parseProductsCsv("")).toThrow(/Fichier vide/);
    expect(() => parseCustomersCsv("")).toThrow(/Fichier vide/);
  });

  it("prix illisible refusé avec le numéro de ligne", () => {
    expect(() => parseProductsCsv("nom;vente;achat;quantite\nFarine;abc;40;10")).toThrow(
      /Ligne 2 : prix de vente invalide/,
    );
  });

  it("quantité invalide refusée", () => {
    expect(() => parseProductsCsv("Farine;50;40;abc")).toThrow(/quantité invalide/);
    expect(() => parseProductsCsv("Farine;50;40;-3")).toThrow(/quantité invalide/);
  });

  it("code-barres dupliqué refusé", () => {
    expect(() => parseProductsCsv("Farine;50;40;10;123\nSemoule;60;50;5;123")).toThrow(
      /code-barres dupliqué/,
    );
  });

  it("ligne incomplète et nom trop court refusés", () => {
    expect(() => parseProductsCsv("Farine;50")).toThrow(/incomplète/);
    expect(() => parseProductsCsv("F;50;40;10")).toThrow(/nom requis/);
  });

  it("en-tête détecté, produit nommé « Nominal » NON avalé comme en-tête", () => {
    const rows = parseProductsCsv("nom;vente;achat;quantite\nFarine;50;40;10");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Farine");
    const nominal = parseProductsCsv("Nominal;10;8;5");
    expect(nominal).toHaveLength(1);
    expect(nominal[0]?.name).toBe("Nominal");
  });

  it("prix d'achat et quantité vides ⇒ 0 (pas de NaN)", () => {
    const rows = parseProductsCsv("Farine;50;;");
    expect(rows[0]?.purchasePriceMinor).toBe(0);
    expect(rows[0]?.quantity).toBe(0);
  });

  it("plus de 5 000 lignes refusé (produits et clients)", () => {
    const many = Array.from({ length: 5001 }, (_, i) => `Produit ${i};50;40;10`).join("\n");
    expect(() => parseProductsCsv(many)).toThrow(/5 000/);
    const manyClients = Array.from({ length: 5001 }, (_, i) => `Prenom ${i};Nom;0550123456`).join(
      "\n",
    );
    expect(() => parseCustomersCsv(manyClients)).toThrow(/5 000/);
  });

  it("clients : en-tête, ligne valide, format invalide et nom manquant", () => {
    const rows = parseCustomersCsv("prénom;nom;tel\nAmine;Benali;0550123456");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.firstName).toBe("Amine");
    expect(rows[0]?.phone).toBe("0550123456");
    expect(() => parseCustomersCsv("Amine")).toThrow(/format invalide/);
    expect(() => parseCustomersCsv(";Benali")).toThrow(/prénom et nom requis/);
  });
});
