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

  it("le renderer n'importe jamais SQLite/Node (règle 2)", () => {
    for (const rel of [CLIENTS, PRODUCTS]) {
      const src = read(rel);
      for (const banned of ["better-sqlite3", "node:fs", "ipcRenderer"]) {
        expect(src.includes(banned), `${rel} : ${banned}`).toBe(false);
      }
    }
  });
});
