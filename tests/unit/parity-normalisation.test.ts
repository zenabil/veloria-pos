// Veloria PoS — W7 (E-29) : parité de la normalisation du nom client.
//
// Le renderer (tiroir client 360) normalise les noms pour rapprocher les
// lignes ; le main normalise les mêmes noms pour les indexer
// (`customers.search_norm`, migration 0047). AVANT, les deux règles
// différaient : « œ » devenait « oe » côté main et une ESPACE côté
// renderer ⇒ le rapprochement ne retrouvait pas les lignes que la
// recherche, elle, retrouvait.
//
// electron/ ne peut pas importer src/ (rootDir) : les deux copies sont
// volontaires et ce fichier PROUVE qu'elles se comportent pareil. Toute
// dérive casse ici avant la production.
import { describe, it, expect } from "vitest";
import { normCustomerSearch } from "../../electron/ipc/handlers/customers.repo";
import { normFr } from "@/features/customers/client-matching.ts";

/** Vecteurs : casse, accents, ligatures, espaces, ponctuation, chiffres. */
const NAMES = [
  "Amine Benali",
  "Hôtel-Café  L'Atlas",
  "Amine  BENALI",
  "Bélaïd Ziani",
  "Cœur de l'Église",
  "CŒUR",
  "Æon",
  "Ømar",
  "Noureddine Benali-Benali",
  "Société Générale Algérie",
  "  espaces  autour  ",
  "Chiffres 1234",
  "Trait-d'union et apostrophe",
  "ÉLÈVE",
  "français çà et ù",
  "",
  "   ",
];

describe("W7 (E-29) : parité de normalisation du nom client (renderer ↔ main)", () => {
  it("mêmes sorties sur tous les vecteurs", () => {
    for (const n of NAMES) {
      expect(normFr(n), `renderer:${n}`).toBe(normCustomerSearch(n));
    }
  });

  it("les ligatures suivent la règle de l'index (œ → oe, ø → o)", () => {
    expect(normFr("Cœur")).toBe("coeur");
    expect(normFr("Cœur")).toBe(normCustomerSearch("Cœur"));
    expect(normFr("Ømar")).toBe("omar");
    expect(normFr("Ømar")).toBe(normCustomerSearch("Ømar"));
  });

  it("les accents et la casse sont neutralisés comme dans la base", () => {
    expect(normFr("Bélaïd ZIANI")).toBe("belaid ziani");
    expect(normFr("Bélaïd ZIANI")).toBe(normCustomerSearch("Bélaïd ZIANI"));
  });

  it("null / undefined ⇒ chaîne vide (les deux côtés)", () => {
    expect(normFr(null)).toBe("");
    expect(normFr(undefined)).toBe("");
    expect(normFr(null)).toBe(normCustomerSearch(""));
  });
});
