// Veloria PoS — Garde : focus des dialogues (bug « article libre », 2026-10-21).
//
// Le renderer n'est pas rendu dans les tests (pas de bibliothèque de rendu
// React dans le projet) : la garde est donc STATIQUE — elle vérifie que le
// piège de focus des modales/tiroirs ne rejoue PAS son effet à chaque rendu.
//
// RÉGRESSION : `useDialogFocus` dépendait de `[boxRef, onClose, extraKey]`.
// `onClose` arrive des écrans sous forme de flécheta inline (`() =>
// setX(false)`) : son identité change à CHAQUE rendu ⇒ l'effet se rejouait
// à chaque frappe ⇒ le focus repartait sur le PREMIER `input` du dialogue.
// Symptôme rapporté par le propriétaire : « article libre » — le nom se
// saisit normalement, mais le prix n'accepte qu'UN chiffre puis le focus
// revient au champ « Nom du produit » (le prix est le 2ᵉ champ du formulaire).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

const PRIMITIVES = "src/shared/ui/primitives.tsx";
const CUSTOM_DIALOG = "src/features/sales/sell/CustomItemDialog.tsx";

describe("focus des dialogues : le piège ne rejoue PAS son effet à chaque rendu", () => {
  it("useDialogFocus : l'effet d'écoute ne dépend QUE de boxRef", () => {
    const src = read(PRIMITIVES);
    const start = src.indexOf("function useDialogFocus(");
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start);
    // Dépendances de l'effet qui pose le focus + piège Tab : [boxRef] seul.
    const deps = fn.match(/\}, \[([^\]]*)\]\);/);
    expect(deps, "dépendances de useDialogFocus").not.toBeNull();
    expect(deps?.[1]?.trim()).toBe("boxRef");
  });

  it("useDialogFocus : onClose / extraKey sont lus via des refs (dernière valeur)", () => {
    const src = read(PRIMITIVES);
    const fn = src.slice(src.indexOf("function useDialogFocus("));
    expect(fn).toContain("const onCloseRef = useRef(onClose);");
    expect(fn).toContain("const extraKeyRef = useRef(extraKey);");
    // Les handlers utilisent les refs, JAMAIS les props (identité instable).
    expect(fn).toContain("onCloseRef.current();");
    expect(fn).toContain("extraKeyRef.current?.(e)");
    expect(fn).not.toMatch(/\n\s+onClose\(\);/);
    expect(fn).not.toMatch(/extraKey\?\.\(e\)/);
  });

  it("« article libre » : le champ PRIX est bien le 2ᵉ champ du formulaire", () => {
    // Pré-condition du bug : le 1ᵉʳ input est le NOM ⇒ un refocus du premier
    // champ renvoie la saisie au nom. La garde verrouille cet ordre.
    const src = read(CUSTOM_DIALOG);
    const nameAt = src.indexOf('aria-label="Nom du produit libre"');
    const priceAt = src.indexOf('aria-label="Prix unitaire"');
    expect(nameAt).toBeGreaterThan(-1);
    expect(priceAt).toBeGreaterThan(-1);
    expect(priceAt).toBeGreaterThan(nameAt);
  });
});
