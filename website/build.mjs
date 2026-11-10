// Veloria — build du site vitrine (zéro dépendance, Node pur).
//
// POURQUOI UN BUILD : les 6 pages partageaient le même en-tête, le même
// pied de page, le même appel à l'action « reçu » et les mêmes métadonnées —
// dupliqués à la main (donc inevitably désynchronisés). Ici, un composant
// = UN fichier dans `src/partials/`, et les pages ne contiennent plus que
// leur PROPRE contenu.
//
// Ce que fait le build :
//   1. lit `src/data/site.json` (métadonnées, navigation) ;
//   2. assemble chaque page : squelette + partials + corps de page ;
//   3. résout les variables `{{clé}}` (site.json) et les includes
//      `<!-- @include nom -->` (partials) ;
//   4. concatène les couches CSS (`styles/**`) dans `styles/main.css`
//      (une seule requête HTTP, aucun « @import » en cascade) ;
//   5. écrit les pages générées à la racine du site.
//
// Modes :
//   node build.mjs           → écrit les fichiers
//   node build.mjs --check   → ne écrit rien, sort en 1 si la sortie est
//                              PÉRIMÉE (porte `verify:site`).
//
// Aucun secret, aucun réseau, aucune dépendance : le site reste hébergeable
// comme un dossier statique.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHECK_ONLY = process.argv.includes("--check");

/** Ordre de concaténation des couches CSS (tokens → base → layout → composants). */
const CSS_ORDER = [
  "styles/tokens.css",
  "styles/base.css",
  "styles/layout.css",
  "styles/components/header.css",
  "styles/components/buttons.css",
  "styles/components/hero.css",
  "styles/components/app-frame.css",
  "styles/components/marquee.css",
  "styles/components/chapters.css",
  "styles/components/cards.css",
  "styles/components/ledger.css",
  "styles/components/specs.css",
  "styles/components/testimonials.css",
  "styles/components/pricing.css",
  "styles/components/forms.css",
  "styles/components/receipt.css",
  "styles/components/footer.css",
  "styles/components/scroll-down.css",
  "styles/components/reveal.css",
  "styles/responsive.css",
  "styles/preferences.css",
];

const data = JSON.parse(fs.readFileSync(path.join(here, "src/data/site.json"), "utf-8"));

/** Construit la navigation (balise `aria-current` sur la page courante). */
function navHtml(currentId) {
  return data.nav
    .map((item) => {
      const current = item.id === currentId ? ' aria-current="page"' : "";
      return `          <a href="${item.href}"${current}>${item.label}</a>`;
    })
    .join("\n");
}

/** Résout `{{clé}}` et `{{clé.sousClé}}` depuis un objet de variables. */
function interpolate(text, vars) {
  return text.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (match, key) => {
    const value = key.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), vars);
    return value == null ? match : String(value);
  });
}

/** Résout les includes `<!-- @include nom -->` (récursif, profondeur 5). */
function resolveIncludes(text, depth = 0) {
  if (depth > 5) throw new Error("Includes trop imbriqués (boucle ?).");
  return text.replace(/^[ \t]*<!-- @include ([a-z-]+) -->[ \t]*$/gm, (match, name) => {
    const file = path.join(here, "src/partials", `${name}.html`);
    if (!fs.existsSync(file)) throw new Error(`Partial inconnu : ${name}`);
    return resolveIncludes(fs.readFileSync(file, "utf-8"), depth + 1);
  });
}

/** Assemble une page complète. */
function buildPage(id) {
  const page = data.pages[id];
  if (!page) throw new Error(`Page inconnue : ${id}`);
  const body = fs.readFileSync(path.join(here, page.body), "utf-8");
  const nav = navHtml(id);
  const vars = {
    ...data.site,
    nav,
    title: page.title,
    description: page.description,
    cta: page.cta || {},
  };
  const skeleton = `<!doctype html>
<html lang="{{lang}}">
  <head>
    <!-- Le CSS de révélation ne s'active qu'avec JS : sans JS, tout le contenu reste visible. -->
    <script>
      document.documentElement.classList.add("js");
    </script>
    <!-- @include head -->
  </head>
  <body>
    <!-- @include skip -->
    <!-- @include header -->
    <main id="main">
${body}
    </main>
    <!-- @include footer -->
  </body>
</html>
`;
  return interpolate(resolveIncludes(skeleton), vars);
}

/** Concatène les couches CSS dans un seul fichier (une requête HTTP). */
function buildCss() {
  const header = `/* Veloria — feuille de style assemblede (GENERE par \`npm run site:build\`).
   Source : website/styles/** (tokens, base, layout, components/, pages/).
   Ne pas editer ce fichier a la main : editer la source, puis regenerer. */\n\n`;
  const parts = CSS_ORDER.map((file) => {
    const abs = path.join(here, file);
    if (!fs.existsSync(abs)) throw new Error(`Couche CSS manquante : ${file}`);
    return `/* ==== ${file.replace("styles/", "")} ==== */\n${fs.readFileSync(abs, "utf-8").trim()}\n`;
  });
  return header + parts.join("\n");
}

/** Sortie : { chemin relatif → contenu }. */
function buildAll() {
  const out = new Map();
  for (const id of Object.keys(data.pages)) {
    out.set(`${id}.html`, buildPage(id));
  }
  out.set("styles/main.css", buildCss());
  return out;
}

const built = buildAll();
let stale = 0;
for (const [rel, content] of built) {
  const abs = path.join(here, rel);
  const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
  const same = current === content;
  if (!same) {
    stale += 1;
    if (CHECK_ONLY) {
      console.error(`FAIL  ${rel} : sortie perimee (relancer \`npm run site:build\`).`);
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf-8");
      console.log(`écrit : ${rel}`);
    }
  }
}

if (CHECK_ONLY) {
  if (stale > 0) {
    console.error(`\n${stale} fichier(s) perime(s) — le site servi ne correspond pas aux sources.`);
    process.exit(1);
  }
  console.log("SITE BUILD À JOUR");
} else {
  console.log(`Site assemblé : ${built.size} fichiers (${stale} régénéré(s)).`);
}
