// Veloria PoS — W10 (A-06) : chaque écran de données a un état d'erreur
// PERSISTANT.
//
// L'audit intégral 2026-10-19 (A-06) a montré que le seul canal d'erreur
// était le toast : 4,5 s, les 3 derniers conservés. Conséquences :
// (a) l'erreur disparaît sans trace, (b) un tableau vide après un échec
// passe pour « aucune donnée », (c) une série d'erreurs est noyée.
//
// Garde statique : un écran de données DOIT déclarer un état d'erreur
// persistant et l'afficher (`ErrorState` ou `role="alert"`). Sans cet
// écran de données est soit en attente d'un état d'erreur, soit revenu au
// toast éphémère.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FEATURES = path.join(ROOT, "src", "features");

/**
 * Écrans sans chargement de données : pas d'état d'erreur à persister.
 * - `LicenseScreen` : l'activation affiche déjà son panneau d'état (bouton
 *   « Réessayer », message FR persistant sous la forme) ;
 * - `SellScreen` : la caisse n'a pas de chargement de liste (tout est
 *   synchrone ou déjà en mémoire) ;
 * - `SettingsScreen` : simple composition de sections (chacune gère ses
 *   propres états).
 */
const EXEMPT = new Set(["LicenseScreen.tsx", "SellScreen.tsx", "SettingsScreen.tsx"]);

function screenFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) screenFiles(p, acc);
    else if (entry.name.endsWith("Screen.tsx")) acc.push(p);
  }
  return acc;
}

const SCREENS = screenFiles(FEATURES)
  .filter((f) => !EXEMPT.has(path.basename(f)))
  .map((f) => ({ name: path.basename(f), src: fs.readFileSync(f, "utf8") }));

describe("W10 (A-06) : état d'erreur persistant dans chaque écran de données", () => {
  it("la liste des écrans de données est complète (garde effective)", () => {
    expect(SCREENS.length).toBeGreaterThanOrEqual(12);
  });

  for (const { name, src } of SCREENS) {
    it(`${name} : déclare un état d'erreur et l'affiche`, () => {
      // 1) un état d'erreur PERSISTANT (useState) — pas un simple toast ;
      expect(src, `${name} : état d'erreur`).toMatch(
        /const \[(\w*[Ee]rror\w*), set\w+\] = useState\(/,
      );
      // 2) l'erreur est affichée de façon durable et accessible ;
      expect(src, `${name} : affichage de l'erreur`).toMatch(/ErrorState|role="alert"/);
      // 3) le message d'erreur est bien français (jamais de technique brute).
      expect(src, `${name} : message FR`).not.toMatch(/setLoadError\(e\)/);
    });
  }
});
