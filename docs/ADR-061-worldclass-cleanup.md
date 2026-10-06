# ADR-061 — World-Class Stabilisation P0 (Phase A1)

Date : 2026-10-03. Statut : accepté (A1 clôturée, pipeline vert).

## Contexte

Deep bug hunt 7 axes (TS strict, races, transactions, money float, IPC/Zod,
stock négatif/FIFO, imports renderer, migrations drift, N+1, memory).
4 ratissages parallèles + lecture directe des fichiers (evidence before synthesis).

## Décisions

1. Frontière Zod durcie : tout montant en centimes utilise
   `moneyMinor` (0..1e9) ou `moneyMinorPositive` (1..1e9) — 30+ champs
   (ventes, paiements, retours, dépenses, intakes, proformas, pain,
   clôtures, zakat, imports, impressions, étiquettes). Paiement orphelin
   (ni client ni vente) rejeté par `superRefine`.
2. Quantités : `quantity` (3 décimales, >0) pour lignes positives,
   `quantityNonNegative` (3 décimales, ≥0) pour stocks/dégâts/imports —
   rejet au lieu d'arrondi silencieux (`Math.round(qty*1000)/1000` supprimé
   comme normalisation implicite).
3. `expirationDate` : calendrier réel validé (vide/null = sans péremption).
4. `sales.setDueDate` : lecture + `UPDATE … WHERE is_cancelled = 0` DANS la
   transaction (TOCTOU annulation concurrente fermée).
5. `purchase.transition` : `UPDATE … WHERE status = from` + `changes === 1`
   (perte-mise-à-jour ordonné/annulé fermée).
6. Annulation retour fournisseur (fallback pré-0023) : restauration bornée
   par capacité `(original − remaining)` par couche + excédent en couche
   `legacy` — plus d'ABORT brut du trigger 0023 sur toute la transaction.
7. `carts.clear` : `operationId` transmis par le preload (`p ?? {}`) —
   retry/double-clic idempotent.
8. Recherche client caisse : compteur `customerSearchSeq` (même garde que
   produits) — le stale dropdown ne gagne plus.

## Non-décisions (documentées, pas de migration)

- `products.quantity` sans CHECK `>= 0` : volontaire (survente autorisée par
  `allowNegativeStock`, couches FIFO restant `>= 0` + tranche NULL-layer).
  Divergence `SUM(layers) ≠ stock` en survente = comportement accepté et tracé.
- `BEGIN IMMEDIATE` global : non appliqué (better-sqlite3 DEFERRED + UNIQUE
  operation_id/invoice_number comme trancheurs + retry). Concurrence
  bi-caisse réelle = P2 (mono-poste Electron actuel).
- `Math.round(prix × qty)` : conservé comme règle d'arrondi centrale
  (centime le plus proche), désormais derrière bornes Zod + `assertSafe*`.

## Preuves

- `tests/unit/a1-p0-boundary.test.ts` : 6 tests (9e15 rejeté, orphelin rejeté,
  4-décimales rejetées, expiration, print, proforma/pain).
- Pipeline : `format` + `typecheck` + `test` (85 fichiers, 529 tests) +
  `verify:migrations` (34/34 + invariants) + `build` — tous verts le 2026-10-03.

## A2 — Nettoyage radical (2026-10-03, vert)

- Ratissage : 0 TODO/FIXME, 0 `any`, barrels `*Dialogs` tous vivants,
  `console.*` uniquement technique volontaire, `dist/release/*.tsbuildinfo`
  gitignorés, deps racine toutes utilisées (`bindings` = transitif
  better-sqlite3, KEEP), scripts hors `package.json` mais vivants
  (tests/docs/eslint, KEEP), deps mobile `expo-asset/font/constants` = défauts
  Expo (KEEP).
- Fixes : `mobile/.../Account.tsx:92` variable `rtl` morte supprimée ;
  `eslint.config.mjs` : `vite.license-manager.config.ts` retiré de
  `allowDefaultProject` (déjà dans `tsconfig.json`, cause du parsing error).
- Unification : `editionLabel` + `formatDateFr` extraits vers
  `src/shared/formatters/format.ts` (source unique), doublons supprimés dans
  `LicenseBadge.tsx` + `LicenseScreen.tsx` ; `tests/unit/a2-cleanup.test.ts` 2/2.
- Gardes : `npm run lint -- --max-warnings 0` vert (2 erreurs → 0),
  `format:check` vert, `typecheck` + `test` (86 fichiers, 531 tests) +
  `verify:migrations` + `build` verts.

## Suites P1/P2 restantes (→ phases suivantes)

- P1 : `call` brut `as T` majoritaire (migrer vers `callChecked`), `optionalOperationId`
  sans retry idempotent quand omis, N+1 boucles (import 5000, inventaire 200),
  `strictOrNeg -1` (+1c preview), `Number()` renderer sans garde.
- P2 : `console.error` UI → logger fichier, timers `notify`, `emptyPayload`
  non-strict, `printFormat` optional nu, circular types-only (acceptable).

## B4 — Libs & packages (2026-10-03, vert, zéro mise à jour)

- Racine : `npm audit --omit=dev` = **0 vulnérabilité**. `npm outdated` :
  tout est épinglé exact (`Wanted == Current`), tous les `Latest` sont des
  sauts majeurs (electron 37→44, better-sqlite3 12→13, zod 3→4, vite 6→8,
  eslint 9→10, TS 5→7, react 19.1→19.3) → AUCUNE mise à jour (règle : jamais
  de breaking silencieux).
- Mobile : 48 vulnérabilités, TOUTES toolchain dev (metro/jest/tar/postcss
  via `@expo/cli`) — jamais dans l'APK ; chaque fix exigerait un saut SDK
  breaking (`expo@44`) → refusé, documenté (builds EAS isolés, aucun secret
  en repo via `license:scan`).
- Matrice (preuves) : better-sqlite3 12.2.0 `engines: node 20/22/23/24` +
  projet `engines >=22.5 <23` + Electron 37.2.0 embarquant **Node 22.17.0**
  (sonde réelle) → compatible. (Le Node système v26 du poste est hors
  `engines` — environnemental, les tests utilisent `node:sqlite`.)
- `npm run rebuild` : exit 0. `npm run build:electron` : exit 0.
- Sonde runtime Electron réel (sans fenêtre) : better-sqlite3 12.2.0 chargé,
  vraie base `%APPDATA%/Veloria PoS/Data` ouverte en lecture seule,
  `sqlite_version 3.50.2`, `integrity_check ok`, 34 migrations appliquées.
- `npm run release:smoke` : 13/13 OK (POS + Manager, preloads sandbox-safe).
