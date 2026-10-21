// Veloria PoS — Garde : import/export CSV présents sur les écrans Clients
// et Produits (ADR-130).
//
// Le renderer n'est pas rendu dans les tests (pas de bibliothèque de rendu
// React dans le projet) : la garde est donc STATIQUE — elle vérifie que
// chaque écran expose bien le câblage attendu (bouton + parseur domaine +
// appel IPC + export CSV). Une régression (bouton supprimé, appel renommé,
// export retiré) casse ici.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { productCsvRows, type Product } from "@/features/products/types.ts";
import { toCsv } from "@shared/export/csv.ts";

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

const CLIENTS = "src/features/customers/ClientsScreen.tsx";
const PRODUCTS = "src/features/products/ProductsScreen.tsx";

describe("W10/ADR-130 : import & export CSV (Clients, Produits)", () => {
  it("Clients : import CSV câblé (parseur domaine + IPC + confirmation)", () => {
    const src = read(CLIENTS);
    expect(src, "parseur domaine").toContain("parseCustomersCsv");
    expect(src, "appel IPC").toContain("api.customerImport");
    expect(src, "confirmation FR").toContain("Importer ${rows.length} client(s)");
    expect(src, "message FR").toContain("client(s) importé(s)");
    expect(src, "bouton").toContain("Import CSV");
    expect(src, "champ fichier").toContain('accept=".csv,.txt"');
  });

  it("Clients : export CSV câblé (toutes les pages du filtre)", () => {
    const src = read(CLIENTS);
    expect(src, "export").toContain("downloadCsv");
    expect(src, "en-tête du fichier").toContain("clients-${new Date()");
    // Export COMPLET (toutes les pages), pas la seule page affichée.
    expect(src, "parcours des pages").toContain("Math.ceil(total / PAGE_SIZE)");
  });

  it("Produits : import CSV câblé (parseur domaine + IPC)", () => {
    const src = read(PRODUCTS);
    expect(src, "parseur domaine").toContain("parseProductsCsv");
    expect(src, "appel IPC").toContain("api.productsImport");
    expect(src, "bouton").toContain("Import CSV");
  });

  it("Produits : export CSV câblé (toutes les pages du filtre)", () => {
    const src = read(PRODUCTS);
    expect(src, "export").toContain("downloadCsv");
    expect(src, "en-tête du fichier").toContain("catalogue-${new Date()");
    expect(src, "parcours des pages").toContain("Math.ceil(total / PAGE_SIZE)");
    // Les montants exportés sont formatés (jamais des centimes bruts).
    expect(src, "montants formatés").toContain("formatDzd(p.selling_price_minor)");
  });

  it("export catalogue : lignes CSV (montants DZD, code-barres, statut)", () => {
    const rows: Product[] = [
      {
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
      },
    ];
    const csv = productCsvRows(rows);
    expect(csv).toHaveLength(1);
    expect(csv[0]).toMatchObject({
      Nom: "Farine",
      Catégorie: "Épicerie",
      Unité: "KG",
      "Prix d'achat": "40,00 DZD",
      "Prix de vente": "50,00 DZD",
      Quantité: 12.5,
      "Stock mini": 2,
      "Code-barres": "1234567890123",
      Statut: "En stock",
    });
    // Le CSV produit est bien formé (séparateur « ; », en-têtes).
    const text = toCsv(csv);
    expect(text.split("\n")[0]).toContain("Nom;Catégorie");
    expect(text).toContain("Farine");
  });

  it("le renderer n'importe jamais SQLite/Node (règle 2)", () => {
    for (const rel of [CLIENTS, PRODUCTS]) {
      const src = read(rel);
      for (const banned of ["better-sqlite3", "node:fs", "ipcRenderer"]) {
        expect(src.includes(banned), `${rel} : ${banned}`).toBe(false);
      }
    }
  });
});
