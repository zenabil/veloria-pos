// Veloria PoS — Garde : import CSV sûr (EMP-1, ADR-130 décision 3).
//
// L'export est un RAPPORT (colonnes enrichies, montants formatés) ; l'import
// est un FLUX DE DONNÉES. Un export ré-importé doit être REFUSÉ proprement
// avec un message FR explicite — jamais transformé en fiches bidon.
import { describe, it, expect } from "vitest";
import { parseCustomersCsv, parseProductsCsv } from "@/domain/import/csv-import.ts";
import { productCsvRows, productImportCsvRows, type Product } from "@/features/products/types.ts";
import { customerImportCsvRows } from "@/features/customers/types.ts";
import { toCsv } from "@shared/export/csv.ts";

const PRODUCT: Product = {
  id: 1,
  name: "Farine",
  category_id: 2,
  category_name: "Épicerie",
  unit_code: "KG",
  purchase_price_minor: 4000,
  selling_price_minor: 5000,
  quantity: 12.5,
  min_stock_level: 2,
  max_stock_level: 0,
  expiration_date: null,
  stock_status: "in_stock",
  is_active: 1,
  primary_barcode: "1234567890123",
};

describe("import CSV — refus explicite des exports de rapport", () => {
  it("produits : l'export du catalogue n'est pas un fichier d'import", () => {
    const exported = toCsv(productCsvRows([PRODUCT]));
    expect(() => parseProductsCsv(exported)).toThrow(/export de rapport/);
    expect(() => parseProductsCsv(exported)).toThrow(/nom;vente;achat;quantité/);
  });

  it("clients : l'export du registre n'est pas un fichier d'import", () => {
    const exported = toCsv([
      {
        Client: "Amine Benali",
        Téléphone: "0550123456",
        "Jour règlement": 5,
        Achats: "1 200,00 DZD",
        Dette: "0,00 DZD",
        "Dernière vente": "21/10/2026 10:00",
        Statut: "À jour",
      },
    ]);
    expect(() => parseCustomersCsv(exported)).toThrow(/export de rapport/);
    expect(() => parseCustomersCsv(exported)).toThrow(/prénom;nom;téléphone/);
  });
});

describe("import CSV — champs entre guillemets et BOM (fichiers Excel)", () => {
  it("produits : champ contenant un point-virgule", () => {
    const rows = parseProductsCsv('nom;vente;achat;quantite\n"Farine; fine";50;40;10');
    expect(rows[0]).toMatchObject({
      name: "Farine; fine",
      sellingPriceMinor: 5000,
      purchasePriceMinor: 4000,
      quantity: 10,
    });
  });

  it("produits : export Excel UTF-8 (BOM) avec en-tête", () => {
    const rows = parseProductsCsv("\uFEFFnom;vente;achat;quantite\nFarine;50;40;10\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Farine");
  });

  it("clients : export Excel UTF-8 (BOM) avec en-tête", () => {
    const rows = parseCustomersCsv("\uFEFFprénom;nom;téléphone\nAmine;Benali;0550123456\n");
    expect(rows).toEqual([
      { line: 2, firstName: "Amine", lastName: "Benali", phone: "0550123456" },
    ]);
  });

  it("clients : guillemets et guillemet échappé", () => {
    const rows = parseCustomersCsv('prénom;nom;téléphone\n"Amine";"Ben ""dit"" Ali";0550123456');
    expect(rows[0]).toMatchObject({ firstName: "Amine", lastName: 'Ben "dit" Ali' });
  });

  it("en-têtes entre guillemets détectés (Excel)", () => {
    expect(parseProductsCsv('"nom";"vente";"achat";"quantite"\nFarine;50;40;10')).toHaveLength(1);
    expect(parseCustomersCsv('"prénom";"nom";"téléphone"\nAmine;Benali;0550123456')).toHaveLength(
      1,
    );
  });
});

describe("import CSV — téléphone validé avant l'IPC", () => {
  it("refuse un téléphone qui n'est pas un numéro", () => {
    expect(() => parseCustomersCsv("Amine;Benali;pas-un-numero")).toThrow(/téléphone invalide/);
  });

  it("refuse un téléphone trop court", () => {
    expect(() => parseCustomersCsv("Amine;Benali;12345")).toThrow(/téléphone invalide/);
  });

  it("accepte les séparateurs usuels et le vide", () => {
    const rows = parseCustomersCsv(
      "Amine;Benali;0550 12 34 56\nKarim;Ziani;+213 (0)550-12-34-56\nSans;Numero;",
    );
    expect(rows.map((r) => r.phone)).toEqual(["0550 12 34 56", "+213 (0)550-12-34-56", ""]);
  });
});

describe("export données réimportable (ADR-135)", () => {
  it("produits : l'export données se réimporte à l'identique", () => {
    const product: Product = {
      ...PRODUCT,
      name: 'Farine "fine"; complète',
      selling_price_minor: 1250,
      purchase_price_minor: 1000,
      quantity: 12.5,
      primary_barcode: "1234567890123",
    };
    const text = toCsv(productImportCsvRows([product]), { protectFormulas: false });
    // En-tête exact du format d'import + valeurs non formatées DZD.
    expect(text.split("\n")[0]).toBe("nom;vente;achat;quantité;code-barres");
    expect(text).toContain('"12,5"');
    expect(text).not.toContain("DZD");

    expect(parseProductsCsv(text)).toEqual([
      {
        line: 2,
        name: 'Farine "fine"; complète',
        sellingPriceMinor: 1250,
        purchasePriceMinor: 1000,
        quantity: 12.5,
        barcode: "1234567890123",
      },
    ]);
  });

  it("clients : prénom/nom séparés et téléphone +213 conservé", () => {
    const text = toCsv(
      customerImportCsvRows([
        { first_name: 'Amine; "Ali"', last_name: "Benali", phone: "+213 (0)550-12-34-56" },
      ]),
      { protectFormulas: false },
    );
    expect(text.split("\n")[0]).toBe("prénom;nom;téléphone");
    // Sans `protectFormulas: false`, le téléphone deviendrait « '+213… ».
    expect(text).not.toContain("'+213");

    expect(parseCustomersCsv(text)).toEqual([
      {
        line: 2,
        firstName: 'Amine; "Ali"',
        lastName: "Benali",
        phone: "+213 (0)550-12-34-56",
      },
    ]);
  });

  it("produits : le rapport reste protégé contre les formules (RX-18)", () => {
    const text = toCsv(productCsvRows([{ ...PRODUCT, name: "=CMD|calc" }]));
    expect(text).toContain("'=CMD|calc");
  });
});
