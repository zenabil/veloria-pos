# ADR-030 — Réparation radicale P0–P5 (2026-09-21)

## Statut

Accepté — branche `chore/root-layout` (non mergée, sans commit imposé).

## Contexte

Audit complet (4 couches : domaine, UI, main, tests) : 7 critiques (H1–H5 +
FIFO + OCR arabe + remise), ~60 moyennes, dette de contrat (NaN, e.message
brut, operationId partiel), UI empilées, zéro son, zéro CI.

## Décisions structurantes

1. **Remise par prix unitaire (P0-7)** : `sale-rules` sans discountType ;
   `sales.discount_amount_minor` = Σ remises de lignes, `discount_type='none'`.
   Use-case pur (`buildSalePayload`, operationId fourni ou refus).
   Migration 0027 (`original_unit_price_minor`, `discount_minor`).
2. **Atomicité pain (P0-1)** : update/status/transfer en 1 tx + idempotence
   (schémas `breadUpdateSchema`/`breadStatusSchema`/`breadTransferSchema` exigent
   l'UUID) ; P1-6 étend aux produits/clients/zakat + couche centrale
   `schemaRequiresOperationId` dans `handle()`.
3. **Restauration fail-loud (P0-2)** : `reopenWithRetry` (3 tentatives) —
   jamais de db=null silencieux, message FR + écran de récupération.
4. **Intégrité (P0-4 + P2)** : manifeste vide/incomplet = refus (garde pure
   testée) + échec de build si critique absent ; `builtAt` hors signature
   (builds reproductibles, repli legacy vérifié).
5. **Brouillons paniers en SQLite (P4)** : table `cart_drafts` (migration 0030),
   jamais de LocalStorage métier ; hydrate + sauvegarde différée 800 ms.
6. **Sons WebAudio zéro-asset (P5)** : moteur `shared/sound`, préférence
   `sound.enabled` (clé settings + UI + tête de caisse), unlock au 1er geste,
   hook global `notify(err)` + 25 points d'attache.
7. **CI + seuils (P3)** : `.github/workflows/ci.yml` (chaîne §8 complète) ;
   coverage thresholds 80/75/88/80 (état : 84/79/94/84) ; `@vitest/coverage-v8`
   ajouté (manquant).
8. **TVA : REFUSÉE** (décision produit) — aucun `domain/tax`, HT↔TTC, rapport
   TVA. Reportée explicitement, jamais en catimini.

## Non-fait volontairement (avec raison)

- `apps/` monorepo : voir ADR-029 (déclencheurs futurs inchangés).
- Import `src/` depuis `electron/` : impossible (rootDir) — parité prouvée par
  tests (`main-domain-parity`), pas par import.
- `toUserMessage` passe encore les FR métier inconnus : voulu (défense en
  profondeur renderer via `frError` derrière).
- Anciennes migrations 0001..0029 : JAMAIS touchées (0028 restaure l'index
  perdu par 0025 ; collision 0010/0025 prouvée impossible : même format PAR id
  - WHERE IS NULL).

## Vérification

format ciblé + typechecks ×3 + 394 tests (63 fichiers) + builds ×4 +
verify-migrations (0030) + verify:domain + license:scan + coverage seuils :
TOUT VERT (voir `docs/reports/PHASE_6_REPORT.md`).
