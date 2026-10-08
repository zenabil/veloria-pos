# ADR-073 — Bandeau unique + navigation icônes + icône Manager

Date : 2026-10-07. Statut : accepté (demande caisse + vendor).

## Contexte

Après ADR-072 (nav haute), le haut empilait 3 bandes (bandeau fin +
en-tête module + navigation). Demande : fusion en un bandeau, nom de
page visible uniquement sur la sélection, icône fenêtre du Manager.

## Décision

1. `TopBar` + `Sidebar` rendus dans un seul conteneur `bg-[#0a0f1c]`
   (`App.tsx`) : une bandeau (badges, module courant inline,
   impression, Caisse, horloge 24 h, actions) + une rangée navigation.
   Mêmes `TopBarProps`/`SidebarProps`, `F1`/`F2`, badges, filtre,
   `data-path` inchangés.
2. Pastille nav : icône seule sauf l'actif (nom + `kbd` + indicateur
   or). Infobulle `label — hint` partout : aucun geste à réapprendre.
3. Manager : `icon: resolveManagerIcon()` (`manager-icon.ico`, repli
   dev `public/icons`, packagé `extraResources/icons` comme le POS).
   Le `.ico` existait déjà, seule la fenêtre l'ignorait.

## Coupé pour sobriété

Ancien en-tête module pleine largeur + bloc logo de la nav + libellés
sur les 17 pastilles : supprimés (titre inline + actif seul).

## Vérification

`typecheck` + `typecheck:manager` verts, scope `vitest` vert,
`grep` pont vide, captures bureau + 390 px.
