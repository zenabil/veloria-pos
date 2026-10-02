# ADR-055 — Interface APK V3 « Veloria Fintech » (Revolut/Wise) + kit UI partagé

Date : 2026-10-02
Statut : accepté (APK client, lecture seule)

## Contexte

L'APK client (V1) appliquait le design Stitch `veloria_industrial_client` écran
par écran : styles en ligne, écarts d'espacement, boutons sans état pressé,
aucune icône, aucun état vide ni squelette de chargement. Les retours employés
demandent une interface « comme les applications mondiales » (Revolut, Wise)
sans perdre l'identité Veloria ni la double direction RTL/LTR.

## Décision

- **Identité conservée et verrouillée par tests** : `headerBg #051424`,
  `primary #fbbf24`, `SIZES.touchMin 48`, `SIZES.pageSize 20`
  (`tests/unit/mobile-foundation.test.ts`).
- **Système de design V3** dans `mobile/src/tokens.ts` :
  `TYPE` (échelle typographique), `SPACE` (rythme 4/8), `GRADIENTS` (héros, or,
  succès, danger), `SHADOW` (carte / surélevée / nav / halo or), `tint()` pour
  les pastilles teintées, `RADIUS` étendu (champ 16, sheet 28).
- **Kit de composants partagé** `mobile/src/ui/` :
  - `kit.tsx` : `Tap` (scale 0.97 + haptics), `Card`, `Button` (6 variantes),
    `Chip`, `Badge`, `IconBubble`, `SectionHead`, `Amount` (Mono tabulaire),
    `Field`, `Dashed`, `flow()`/`farEdge()` (un seul point de bascule RTL/LTR) ;
  - `states.tsx` : `Skeleton` (pulsation), `SkeletonList`, `EmptyState` ;
  - `nav.tsx` : `TabBar` (dock flottant 4 onglets à icônes) et `PageBar`.
- **Écrans réécrits en V3** (logique inchangée : mêmes props, mêmes
  view-models `views.ts`, mêmes codes d'erreur) : Login (carte blanche sur
  dégradé + cases PIN à état actif), Home (héros dégradé + carte solde en
  débord + actions rapides + bento KPI + fidélité or + aperçus cliquables),
  Invoices (recherche à icône, puces défilantes, cartes statut dépliables),
  Payments (mois sur dégradé, résumé surélevé, timeline à tuiles icônes),
  Account (héros profil, groupes à icônes/chevrons), InvoiceDetail (PageBar +
  ticket + totaux navy + squelette), ReceiptSheet (bottom-sheet à poignée),
  QrScanner (coins de visée + barre haute), App (splash, top-app-bar, toast
  d'erreur, notifications en bottom-sheet, dock à icônes).
- **Dépendances APK autorisées** (choix explicite du mainteneur) :
  `@expo/vector-icons ~14.0.4` (icônes, déjà transitive d'`expo`),
  `expo-linear-gradient ~14.0.2`, `expo-haptics ~14.0.1` (no-op sur web, garde
  `Platform.OS !== "web"`). Aucune autre brique (pas de Blur) pour limiter le
  coût de build EAS.
- **Garde-fou type ajoutée** : `mobile/tsconfig.json` sorti du « hors tsc » —
  `strict` + `allowImportingTsExtensions` (imports `.ts`/`.tsx` existants) +
  `include: ["src"]` ; `npx tsc -p mobile/tsconfig.json --noEmit` devient une
  porte au même titre que `tsc -b` racine.
- Glossaire ADR-051 : nouvelles clés `loading`, `connected`, `showPin`,
  `hidePin`, `syncNow` (ar + fr obligatoires). Correction sémantique : le
  bouton d'affichage du PIN disait « Masquer les montants » → `showPin`/`hidePin`.

## Conséquences

- Tout écran futur s'assemble avec `ui/kit.tsx` + `ui/states.tsx` + `ui/nav.tsx`
  (aucun style en ligne nouveau sans passer par `tokens.ts`).
- `expo-haptics` et `expo-linear-gradient` doivent être présents sur la machine
  de build (`npm install` dans `mobile/` avant `eas build`).
- Playwright `scripts/e2e-mobile-shots.mjs` reste le contrat visuel :
  libellés `دخول/Entrer`, `عرض التفاصيل`, `الوصل`, `تفاصيل الفاتورة`,
  aria-labels `phone`/`pin`/`search` intacts.

## Vérification

- `npx vitest run` : 78 fichiers / 491 tests verts.
- `npx tsc -b` (racine) et `npx tsc -p mobile/tsconfig.json --noEmit` : 0 erreur.
- `npx eslint "mobile/src/**/*.{ts,tsx}" --max-warnings 0` + `prettier --check` : verts.
- Démo web `:8099` (relay) + Expo `:8083` : login → 4 onglets, capture d'écrans.
