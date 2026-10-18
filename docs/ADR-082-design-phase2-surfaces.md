# ADR-082 — Design Phase 2 : surfaces (état, héros, marques)

Date : 2026-10-12. Statut : accepté. Direction : bold mesuré (cf. ADR-081).
Méthode : skill `impeccable`, mode Operate, craft-floor respecté
(adaptations documentées ci-dessous).

## Contexte

Phase 1 (ADR-081) : fondations (sélection, mouvement unique, chiffres
héros). Phase 2 : six surfaces à fort impact décisionnel, zéro
changement de comportement.

## Décision

- **D10 Manager** (`renderer/App.tsx`) : pastille d'état (vert/ambre/
  rouge, `STATUS_DOT`) + chip `J-X` (temporaires ≤ 30 j, calcul UTC
  `daysToExpiry`, jamais de `border-left` coloré banni).
- **D7 Dashboard** : bande « Aujourd'hui » (ventes jour UTC depuis
  `summary.daily`, dépassées, ruptures) au-dessus des 8 KPI — la
  décision avant l'analyse.
- **D12 Mobile** (`Home.tsx`, `i18n.ts`) : salut selon l'heure
  (`greetingEvening` AR/FR, glossaire fermé respecté) + ligne
  dynamique des impayés (rien si zéro — propre).
- **D13 Mobile** : barre de crédit continue → 10 segments (danger
  ≥ 90 %), jamais d'anneau décoratif banni.
- **D11 POS** (`primitives.tsx`) : `◌` Unicode remplacé par marques
  SVG géométriques (`box`/`doc`/`shield`/`cart`, défaut `box` —
  les 24 `EmptyState` en profitent) ; `cart`/`doc` câblés sur
  Caisse et Commandes fournisseurs.
- **D14 vérifié existant** : haptics déjà dans `Tap` (`kit.tsx:32`,
  `expo-haptics` installé) — aucun changement.

## Vérification

- `tsc -b` + `manager --noEmit` + `mobile typecheck` = 0 ;
  `eslint` = 0 ; `prettier` OK ; `vitest` 661/661 ;
  `build` + `build:electron` couplés + manifests signés ;
  `package:win` + `package:manager` + `smoke` + `SHA256SUMS.txt`.
- Reste Phase 3 (D2 étendu/barre sticky, D5 densité, D6 épinglés,
  D8 durcissement clair, D16 compte à rebours) sur demande.
