# ADR-180 — Site vitrine : design system « Terminal d'Or » + porte `verify:site`

**Décision** : le site vitrine (`website/`) passe d'une page « dark glass »
générique à un **système de design** dérivé de l'identité réelle du produit
(encre `#051424`, or `#fbbf24`, chiffres monospace, reçu thermique), et
s'accompagne d'une **porte automatique** (`npm run verify:site`) qui refuse
une page cassée : erreur console, débordement horizontal, structure manquante,
image sans dimensions, lien interne mort.

**Date** : 2026-11-10
**Statut** : accepté

## 1) Constat (revue visuelle + mesure)

Le site précédent (rebuild 2026-11-09) était correct mais ** générique** :
palette indigo/rose/cyan d'un SaaS quelconque, alors que le produit a une
identité forte (POS encre + or, chiffres exacts, tickets). Et surtout : rien
ne vérifiait qu'il **rendait**. Trois défauts ont été trouvés en vérifiant
le nouveau site :

1. **`content-visibility: auto`** sur les sections basses : en capture pleine
   page, les sections restaient **non peintes** (page de 8 664 px dont 7 000
   blanches) — et la navigation par ancre sautait des blocs.
2. **Révélation au défilement sans filet** : `[data-reveal] { opacity: 0 }`
   s'appliquait même **sans JavaScript** et en capture pleine page : le
   contenu restait invisible (information cachée par défaut).
3. **`.rotator`** (mot tournant de l'héros) mal construit en `inline-grid` :
   les mots non actifs tombaient sur une **deuxième ligne**, d'où un titre
   chevauché.

## 2) Décision

### 2.1 Un langage, pas un habillage

- **Palette = celle du produit** : encre `#03080f`/`#051424`, or `#fbbf24`
  (action), cyan `#38bdf8` (écran), papier `#f7f2e7` (reçu), plus états
  mint/rose. Aucun dégradé « SaaS » générique.
- **Typographie** : pile système (0 octet, 0 requête, **0 CLS**) + une pile
  **monospace** pour les chiffres, les libellés et les reçus — le geste
  « terminal » du produit.
- **Motifs** : règle pointillée (séparation « ticket »), **perforations** de
  reçu (CTA final et grand livre Z), cadre d'application (barre de fenêtre),
  onglets produit.

### 2.2 Composants signature

| Composant                      | Rôle                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `.app-frame`                   | fenêtre « application » (barre + écran) qui présente les **captures réelles**                  |
| `.tabs`                        | `tablist` accessible (clavier ←/→) qui fait défiler les écrans du produit                      |
| `.chapters` + `.chapter-frame` | **scrollytelling** : le cadre reste collant, l'image change au fil des chapitres               |
| `.ledger-paper`                | le **grand livre Z** : la formule réelle de clôture, imprimée en papier, avec compteurs animés |
| `.receipt-cta`                 | appel à l'action en forme de **reçu perforé**                                                  |
| `.stats`                       | bandeau de chiffres en monospace, compteurs animés à l'entrée                                  |
| `.rotator`                     | mot tournant de l'héros (crossfade, sans JS = mot fixe)                                        |

### 2.3 Robustesse (le vrai « extraordinaire »)

- **Zéro police web** ⇒ pas de saut de mise en page au chargement.
- **`content-visibility` désactivé** : le gain de peinture était nul sur un
  site de 5 pages, le risque de rendu réel.
- **Révélation conditionnée au JS** (classe `js` posée en `<head>`) : sans
  JS, tout le contenu est **visible** ; filet de sécurité à 2,6 s.
- **Images** : `width`/`height` obligatoires (CLS), `fetchpriority="high"`
  sur l'image LCP, `loading="lazy"` sous la ligne de flottaison.
- **Accessibilité** : lien d'évitement sur chaque page, un seul `h1`,
  `lang="fr"`, focus visible ≥ 3:1 (WCAG 2.2), cibles ≥ 24 px,
  `prefers-reduced-motion` neutralise **toute** animation,
  `prefers-contrast: more` renforce les contrastes, impression soignée.
- **Mouvement** : bascule d'onglets, mot tournant, projecteur au curseur,
  boutons magnétiques, défilement doux — tous désactivés en mouvement réduit.

### 2.4 La porte `verify:site` (nouvelle)

`npm run verify:site` — intégré à `npm run verify` (donc à la CI). Elle
sert le dossier en HTTP local (`node:http`, zéro dépendance), ouvre Chromium
(Playwright déjà présent) et **refuse** :

- toute erreur console ou exception page ;
- tout débordement horizontal (le symptôme n°1 d'un design cassé) ;
- toute structure manquante (en-tête, navigation, pied, `main#main`, lien
  d'évitement, `lang`, `title`, un seul `h1`) ;
- toute image sans `width`/`height` (source de CLS) ;
- tout lien interne mort.

**Grâce** : sans navigateur installé, la porte **saute** (note + exit 0) —
un runner sans navigateur ne doit pas bloquer la chaîne. Elle rend aussi des
captures (`docs/shots/site/`, gitignoré : artefact régénérable).

## 3) Portes

`verify:site` vert (5 pages × 2 viewports) · `verify:docs` vert ·
`verify:migrations` / `verify:domain` / `verify:fr` / `verify:encoding` /
`verify:perf` verts · `format:check` · `eslint` (script + `website/app.js`) ·
`tsc -b` ×5 · suite complète verte.
