# ADR-181 — Site vitrine : organisation en composants (partials + couches CSS)

**Décision** : le site vitrine cesse d'être six copies d'une même page. Il
devient un **système de composants** : HTML partagé dans `src/partials/`,
textes dans `src/data/site.json`, CSS en **couches** (une couche = un
fichier), assemblés par un build statique **zéro dépendance**
(`website/build.mjs`). La sortie générée est **vérifiée** par la porte
`verify:site` (fraîcheur) : on ne peut plus servir un site qui ne correspond
plus à ses sources.

**Date** : 2026-11-10
**Statut** : accepté

## 1) Constat

L'ADR-180 avait fait un site **beau**, mais son **organisation** restait
celle d'une page unique recopiée :

- `website/styles.css` : **1 900 lignes** monolithiques — tokens, reset,
  en-tête, boutons, héros, bento, formulaires, reçu, pied de page, media
  queries et print, tout à la suite ;
- l'en-tête, la navigation, le pied de page et l'appel à l'action étaient
  **dupliqués à la main dans les 6 pages** (donc désynchronisables : il
  fallait corriger le même bloc 6 fois) ;
- les métadonnées (titres, descriptions, WhatsApp, e-mail) étaient
  dispersées dans le balisage ;
- aucune porte ne vérifiait que le site servi corresponde à ses sources.

## 2) Décision

### 2.1 HTML : un composant = un partial

```
src/partials/head.html        métadonnées + CSS + favicon
src/partials/skip.html        lien d'évitement
src/partials/header.html      en-tête + navigation (générée depuis site.json)
src/partials/footer.html      pied de page + scripts
src/partials/cta-receipt.html appel à l'action « reçu »
src/pages/<id>.html           le contenu PROPRE de chaque page
```

- Le squelette est assemblé par `website/build.mjs` (Node pur, **zéro
  dépendance**) : résolution des includes `<!-- @include x -->` et des
  variables `{{clé}}` (avec `{{clé.sous-clé}}`).
- Les textes transverses (titres, descriptions, WhatsApp, e-mail, textes du
  CTA) vivent dans `src/data/site.json` : une seule source, une seule
  correction.

### 2.2 CSS : des couches, un seul fichier servi

```
styles/tokens.css        variables (couleurs, typo, rayons, ombres, mouvement)
styles/base.css          reset + éléments + fonds
styles/layout.css        .wrap, .section, .section-head, .kicker, grille
styles/components/*.css  un fichier par composant (17 fichiers)
styles/responsive.css    media queries transverses
styles/preferences.css   prefers-reduced-motion / prefers-contrast / print
```

- Le build **concatène** les couches dans `styles/main.css` : **une seule
  requête HTTP**, et surtout **aucune cascade `@import`** (qui coûterait
  17 requêtes séquentielles et dégraderait le LCP).
- La découpe est **prouvée sans perte** : la concaténation des couches a été
  comparée au fichier monolithhe d'origine (normalisation des commentaires
  d'en-tête) ⇒ **chaîne identique, 37 482 caractères de part et d'autre**.

### 2.3 Sortie générée + porte de fraîcheur

- La sortie (`index.html`, `pos.html`, `client.html`, `pricing.html`,
  `contact.html`, `styles/main.css`) est **un artefact** : elle est versionnée
  (le site reste hébergeable tel quel) mais **jamais éditée à la main**.
- `npm run site:check` (ou `build.mjs --check`) sort en 1 si la sortie ne
  correspond pas aux sources ; `npm run verify:site` l'appelle **avant** les
  contrôles de rendu ⇒ une retouche oubliée dans `src/` est détectée avant
  la mise en ligne.
- `admin.html` reste **hors build** (outil local `noindex`, navigation
  propre) : il est formaté et vérifié comme les autres pages.
- Les fichiers générés sont **exclus de Prettier** (`.prettierignore`) : le
  formatage est la responsabilité du build, sinon `format:check` et
  `build --check` se contrediraient.

## 3) Pourquoi pas un vrai générateur (Eleventy, Astro, Vite…)

- Le site est **statique par nature** (5 pages, aucune donnée dynamique) et
  doit rester hébergeable tel quel, sans `node_modules` ni étape de build
  chez l'hébergeur ;
- le projet pose la règle « **aucune nouvelle dépendance sans ADR** » et
  privilégie les outils zéro dépendance (`node:http`, `node:crypto`) ;
- un build maison de 150 lignes couvre 100 % du besoin : partials,
  variables, concaténation CSS, vérification de fraîcheur.

Limite assumée : pas de **pagination**, pas de **markdown**, pas de
**minification** — le site n'en a pas besoin (aucune page de contenu longue).
Si le site grossit (blog, docs), le moment de reconsidérer un générateur
sera documenté dans un nouvel ADR.

## 4) Portes

`verify:site` vert (fraîcheur du build + 5 pages × 2 viewports) ·
`site:check` vert · `verify:docs` · `verify:migrations` · `verify:domain` ·
`verify:fr` / `verify:encoding` · `verify:perf` · `format:check` ·
`eslint` · `tsc -b` ×5 · suite complète verte.
