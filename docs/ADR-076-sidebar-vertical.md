# ADR-076 — Barre latérale verticale repliable (remplace le topnav compact)

## Contexte

Depuis ADR-073, la navigation (`Sidebar.tsx`) était une bande horizontale
compacte sous le TopBar (nom visible sur le seul module actif). Demande :
navigation sur le côté, repliable, sans changer les contrats (un seul
`<nav aria-label="Navigation principale">`, noms accessibles stables pour
le clavier et `gotoModule` e2e, préférence `SIDEBAR_KEY` persistée).

## Décisions

1. `Sidebar.tsx` devient une colonne verticale à gauche : `w-60` dépliée
   (recherche + groupes + libellés + badges + kbd), `w-[68px]` repliée
   (icônes seules, `title` + `aria-expanded`), bascule en bas (FR :
   « Réduire » / « Réduire le menu » / « Développer le menu »).
2. `App.tsx` : `flex-row` — sidebar + colonne (TopBar, main, footer).
   Aucune prop de shell ne change ; `collapsed`/`toggleSidebar` inchangés
   (localStorage, prefs UI uniquement).
3. Nommage accessible : le nom des boutons vient du `title`
   (« Label — hint »), comme avant — un `aria-label` dédié a été testé
   puis retiré car il créait des doublons `getByLabel` avec les formulaires
   (ex. « Stock ») et cassait `sale-flow` e2e.
4. Monde visuel inchangé (Stitch Industrial Dark, tokens, 44px tactiles) ;
   indicateur actif = fond ambre seul (pas de barre latérale colorée,
   cf. craft-floor). Détecteur impeccable : aucun finding.

## Conséquences

- `sale-flow` e2e 4/4 vert après le changement (même niveau qu'avant).
- Leçons build : tout `npm run build` renderer invalide le manifest
  d'intégrité → toujours suivre de `build:electron` (re-signature) avant
  tout e2e avec licence, sinon verdict `tampered` systématique.
- Échecs e2e préexistants (sélecteurs UI dérivés, fenêtrage OS) inchangés,
  hors périmètre (voir rapport de session).
