// Veloria PoS — garde CSP du renderer (ADR-166).
// L'écran Paramètres → « Annonces du magasin » affiche un aperçu de l'image
// https saisie par le gérant. La CSP de `index.html` doit autoriser CE scheme
// pour `img-src` : sans lui, Chromium bloque le chargement et l'aperçu affiche
// « Image indisponible » même pour un lien valide (l'APK, lui, l'affiche).
// La correction ne doit élargir ni `script-src` ni `default-src`.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Lit la CSP du document POS et la rend directive par directive. */
function posCsp(): Map<string, string[]> {
  const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  const meta = html.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/i);
  if (meta?.[1] == null) throw new Error("CSP absente de index.html");

  const directives = new Map<string, string[]>();
  for (const part of meta[1].split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name == null || name === "") continue;
    directives.set(name.toLowerCase(), values);
  }
  return directives;
}

describe("CSP du renderer POS", () => {
  it("autorise les images https des annonces sans ouvrir les scripts", () => {
    const csp = posCsp();

    // Aperçu et vignettes des annonces : lien https public (ADR-166).
    expect(csp.get("img-src")).toContain("https:");
    // Les sources locales existantes (logo data:, imports blob:) restent là.
    expect(csp.get("img-src")).toContain("'self'");
    expect(csp.get("img-src")).toContain("data:");
    expect(csp.get("img-src")).toContain("blob:");

    // Aucun élargissement du vecteur d'exécution.
    expect(csp.get("script-src")).toEqual(["'self'"]);
    expect(csp.get("default-src")).toEqual(["'self'"]);
  });
});
