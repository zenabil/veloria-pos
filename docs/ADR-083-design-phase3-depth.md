# ADR-083 — Design Phase 3 : profondeur (densité, épinglés, héros, clair)

Date : 2026-10-12. Statut : accepté. Direction : bold mesuré (cf. ADR-081).
Méthode : skill `impeccable`, mode Operate, zéro changement de comportement.

## Contexte

Phases 1-2 (ADR-081/082) : fondations + surfaces. Phase 3 : cinq
chantiers profonds, chacun derrière un motif existant du codebase.

## Décision

- **D5 densité** (`use-density.ts`, `shell-types.ts`, `TopBar.tsx`,
  `App.tsx`, `globals.css`) : miroir exact du motif `useTheme`
  (localStorage `veloria.density`, défaut confortable) ; bouton `Rows3`
  à côté du thème ; `[data-density="compact"]` resserre `th`/`td`
  (spécificité (0,1,2) > utilitaires, garantie effective).
- **D6 épinglés** (`Sidebar.tsx`, `App.tsx`, `shell-types.ts`) :
  étoile `Star` par ligne (hover/focus + persistante si épinglé),
  groupe « Épinglés » doré en tête, ordre d'épinglage conservé,
  recherche appliquée aussi aux épinglés (jamais de doublon),
  IDs inconnus filtrés au chargement, même pattern localStorage que
  `SIDEBAR_KEY`. Lignes factorisées en `renderRow` (zéro duplication).
- **D2 barre sticky** (`SellTotalsPanel.tsx`) : carte total +
  Encaisser en `sticky top-0` avec liseré or + ombre portée —
  total et paiement visibles pendant le défilement de l'aperçu.
- **D16 compteur** (`use-count-up.ts`, bande D7) : tween 300 ms
  ease-out exponentiel, `prefers-reduced-motion` = final immédiat,
  nombres uniquement.
- **D8 durcissement clair** (`globals.css`) : `bg-[#171207]` →
  `#fdf3e0`, `bg-[#1c1113]` → `#fdeceb`, `text-amber/red-100` →
  bruns/rouges sombres. Inventaire exhaustif : 10 hex `bg-[#…]`
  en usage, tous couverts désormais.

## Vérification

- `tsc` ×3 = 0 ; `eslint` = 0 ; `prettier` OK ; `vitest` 661/661 ;
  `build` + `build:electron` + manifests ; E2E ciblé vert
  (`window-chrome` 6/6, `sale-flow` 4/4 — Sidebar/TopBar/totaux
  validés dans la vraie app) ; suite restante en cours ;
  `package:win` + `package:manager` + `smoke` + `SHA256SUMS.txt`
  après le vert E2E.
