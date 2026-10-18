# ADR-081 — Design Phase 1 : fondations (sélection, mouvement, chiffres)

Date : 2026-10-12. Statut : accepté. Direction : « دفع جريء محسوب »
(bold mesuré, identité sombre-industrielle conservée, fonctions
inchangées). Méthode : skill `impeccable` (context chargé, craft-floor
lu avant toute retouche UI, mode Operate).

## Contexte

L'audit visuel a montré un système Stitch déjà solide (échelle typo
Inter + JetBrains Mono, `--focus-ring` or, strip d'accent Kpi,
thème clair CSS-only, `prefers-reduced-motion` global) avec trois
trous : surfaces navigateur non thémées, zéro mouvement composé,
chiffre du rendu monnaie timide.

## Décision

- **Sélection + caret** (`globals.css`) : `::selection` or translucide,
  `caret-color: #fbbf24` sur champs — le signal le moins cher d'un
  système « construit ».
- **Un unique moment de mouvement** : `veloria-dialog-in` (160 ms,
  ease-out exponentiel `cubic-bezier(0.22,1,0.36,1)`, scale .97→1 +
  translateY) sur la carte `Modal` partagée (tous les dialogues en
  héritent), `veloria-toast-in` (180 ms, translateX) sur les toasts.
  Aucun autre effet dispersé ; le garde-fou `prefers-reduced-motion`
  existant les neutralise.
- **D2** (`PayDialog`) : « Monnaie à rendre » en héros
  (`.font-mono-currency-xl` 30 px, nouvelle utilité) ; total en
  `.font-mono-currency-lg`. Un seul héros par écran.
- **Refusés et pourquoi (craft-floor)** :
  - `border-left` coloré (propositions D1/D10 initiales) : défaut
    banni — remplacé par strip supérieur existant (Kpi), pastille
    d'état + chip de compte à rebours (Phase 2).
  - Anneau de progression (D13) : banni comme substitut de contenu —
    remplacé par barre segmentée (Phase 2).
  - Kpi en mono : refusé — `font-display-kpi` Inter est un littéral
    Stitch épinglé ; le mono reste aux chiffres de transaction.
  - Migration hex partielle : refusée (ADR-080, même rationale).

## Vérification

- `tsc -b` = 0 ; `eslint` fichiers touchés = 0 erreur ;
  `prettier --check` OK ; `build` + `build:electron` couplés +
  manifest re-signé (194 fichiers, pas de risque `tampered`).
- Vérification visuelle par captures avant/après : Phase 2 (gated
  sur demande opérateur, session admin pour E2E packagé si besoin).
