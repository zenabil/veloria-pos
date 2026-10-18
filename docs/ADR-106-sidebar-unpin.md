# ADR-106 — Suppression des épingles de navigation (Sidebar)

## Contexte

La barre latérale (`src/app/shell/Sidebar.tsx`) affichait les modules
épinglés deux fois : section `Épinglés` + groupes complets sans exclusion
(`visibleModules` contient les épinglés, aucun filtre `pinnedSet` côté
groupes) — le commentaire D6 (« jamais de doublon affiché ») était faux.
De plus : zéro test sur l'épingle (grep `tests/` vide), bouton étoile en
`opacity-0` au survol uniquement (inopérant au tactile, cible ergonomie
caisse), coût (~40 lignes + état `App` + clé `localStorage` + helpers).

## Décision

Suppression pure du système d'épingles (pas de réparation) :

- `Sidebar.tsx` : section `Épinglés`, bouton étoile, props
  `pinned`/`onTogglePin` retirés — chaque module n'apparaît qu'une fois,
  le doublon disparaît par construction.
- `App.tsx` : état `pinned` + `togglePin` + props retirés.
- `shell-types.ts` : `PINNED_KEY` + `initialPinnedModules` retirés (preuve
  grep : seul `App.tsx` les consommait, zéro test).
- Clé `localStorage` orpheline ignorée (préférence locale, jamais la base).

## Conséquences

- Navigation : 17 modules, 5 groupes, recherche, vigilance, repli — inchangés.
- FR-only et offline-first inchangés ; aucun changement métier/DB/IPC.

## Fichiers affectés

- `src/app/shell/Sidebar.tsx`, `src/app/shell/App.tsx`,
  `src/app/shell/shell-types.ts`
