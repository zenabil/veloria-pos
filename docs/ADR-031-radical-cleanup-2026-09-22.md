# ADR-031 — Nettoyage radical 2026-09-22 (hygiène + robustesse render)

## Contexte

Audit radical demandé (FR/AR) : projet à deux programmes (POS + License Manager),
État constaté :

- `format:check` en échec (14 fichiers), contrairement à la règle AGENTS.md n°8.
- 2 ZIPs (~16 Mo) à la racine, non ignorés, non versionnés (`Veloria POS11.zip`, `Veloria POSV2.zip`).
- README annonçant 269 tests alors que `vitest` en compte 394 / 63 fichiers.
- `build:manager` émettait du JS mort (`dist-license-manager/license-manager/renderer/*.js`,
  6 fichiers, jamais chargés — le renderer manager est servi par Vite depuis
  `dist-license-manager-renderer/`), empaqueté inutilement dans l'asar.
- 13 `formatDzd(Number(...))` en corps de render (JSX) : un `NaN`/négatif issu
  d'une ligne DB corrompue levait `MoneyError` pendant le render → crash React
  (aucune error boundary, aucun try/catch possible en render — règle P1-5).

## Décisions

1. `*.zip/*.7z/*.rar` ajoutés au `.gitignore` + suppression des 2 ZIPs racine
   (artefacts, jamais du source ; ~16 Mo récupérés).
2. `prettier --write` sur les 14 fichiers fautifs → `format:check` vert.
3. README corrigé : 394 tests / 63 fichiers (vérifié par exécution).
4. `build:manager` purge le JS mort après `tsc`
   (`rmSync dist-license-manager/license-manager/renderer`) ; `tsconfig.manager.json`
   inchangé (le `typecheck:manager --noEmit` continue de couvrir le renderer).
5. Nouveau garde-fou render : `formatDzdSafe(raw: unknown): string`
   (`src/shared/formatters/format.ts`) — ne lève jamais, `"—"` sur invalide.
   13 sites JSX migrés (`ProformaDialogs`, `DetailsDrawer`, `DebtDialogs`,
   `NewCustomerReturnDialog`) ; les totaux calculés validés gardent `formatDzd`.

## Conséquences

- Portes vertes : `format:check`, `typecheck`, `verify:migrations`,
  `license:scan`, ciblés `money/money-safety/fr-map` (18 tests), suite complète
  394/394 vérifiée avant correctifs.
- Aucun changement de schéma (pas de migration), aucun changement de contrat IPC,
  aucune clé touchée.
- Reste à faire (plan radical, non encore exécuté) : commit du chantier
  (132 modifiés + ~150 nouveaux), `lint` complet trop lent (>120 s, à profiler),
  E2E Playwright non rejoué ici, audit `step="any"` / `callChecked` systématique,
  déduplication WAL-companions (3 sites), snapshots pré-migration invisibles
  de `listBackups`, durcissement clé privée vendor au repos.
