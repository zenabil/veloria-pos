# PHASE 1-2 — Fondation + Domaine + SQLite + Electron + UI socle (2026-09-14)

## Completed
- **Configs** : `package.json` (versions épinglées), `tsconfig.json` + `tsconfig.electron.json` (strict), `vite.config.ts` (`base:"./"`, alias), `vitest.config.ts`, `electron-builder.yml` (NSIS + portable, `deleteAppDataOnUninstall:false`, asarUnpack `.node`), ESLint strict (`no-explicit-any`, retours explicites), Prettier, `.npmrc`, `.gitignore` (jamais de `.sqlite` commité).
- **Domaine** : `money` (centimes, `formatDzd` fr-FR), `common` (ids UUIDv7, quantity, invoice-number, errors FR), `product-rules`, `sale-rules` (`computeSaleTotals` déterministe), `debt-rules`, `stock-rules`, `return-rules`, `zakat` (reporting, taux/nisab explicites).
- **Application** : `CreateSale` (totaux domaine + `operationId` idempotent), `CreateProduct`.
- **SQLite** : 0001 schéma 21 tables + CHECK financiers, 0002 19 index, 0003 vues + trigger ; pragmas 06 (WAL/FULL/FK/busy 10s) ; `schema_migrations` + vérif checksums ; `integrity_check`/`foreign_key_check` au démarrage et à la demande.
- **Electron sécurisé** : `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true` ; preload minimal typé (56 canaux nommés, zéro `fs`/`sqlite` exposé) ; registry avec Zod + mapping erreurs FR + logs ; navigation restrictive ; single-instance ; crash-recovery (checkpoint WAL, reload renderer, écran FR) ; chemins validés.
- **Transactions atomiques** : vente (facture+items+paiement+stocks+solde+audit = 1 tx, idempotente), annulation (restock + solde inversé), retour (retour+restock+remboursement/crédit+audit = 1 tx).
- **Backup** : `VACUUM INTO` `.vposdb` + sidecar JSON (version/checksum), rotation 30, restore validé (header SQLite + snapshot sécurité).
- **Impression/Hardware** : `buildReceiptText` déterministe (80mm : lignes, remise, livraison, payé, soldes, merci), print silencieux main-only, adapters tiroir/balance/scanneur (HID clavier).
- **UI FR dark** (réf. screenshots) : shell canonique (top bar + bottom nav 14 modules), design tokens, focus visible, reduced-motion ; caisse keyboard-first (F3 recherche, F10 finaliser, code-barres auto) ; dashboard agrégats SQL ; catalogue/clients/historique/paramètres réels ; placeholders FR pour phases suivantes (aucun bouton mort).
- **Tests** : vitest unitaires (money/sale/debt/stock/product) + intégration migrations ; vérifications exécutées sans dépendances : voir ci-dessous.

## Files Created
~45 fichiers (voir git status). Points d'entrée : `src/main.tsx`, `electron/main/main.ts`, `electron/preload/preload.ts`.

## Tests
- `node scripts/database/verify-migrations.mjs` → **MIGRATIONS VERIFIED** (3 migrations, CHECK overpayment rejeté, UNIQUE barcode, integrity ok, FK 0).
- `node scripts/quality/verify-domain.ts` → **DOMAIN VERIFIED** (12 assertions : centimes, totaux vente 18500, crédit, over-limit, zakat 8250, retour 30000).
- vitest complet + `npm run typecheck/lint/build` : **en attente réseau** (ping registry 47s ; `npm install` à relancer avec `--ignore-scripts`).

## Problems
- Réseau extrêmement lent (npm PONG 47s) : install complet (Electron ~100Mo) impossible dans les timeouts courts ; contourné par vérifications sans dépendances (node:sqlite + type-stripping natifs).
- Node système v26 vs LTS 22 ciblé : `engines` assoupli (`>=20`) ; CI/build doivent utiliser Node 22 + `npm run rebuild`.

## Decisions
- Pas de Dexie/Firebase/Sheets/sync/tenantId/rôles : supprimés du scope (00/01 + audit 02).
- `sales.operation_id UNIQUE` : base de l'idempotence retry-UI.
- Paiement client sans vente : `sale_payments.sale_id` réutilisé avec garde applicative (amélioration schéma prévue : migration 0004 nullable).

## Remaining Work
1. `npm install --ignore-scripts` (réseau OK) → `typecheck` → `lint` → `vitest` → `vite build` → `electron-builder` → smoke `scripts/release/smoke.js`.
2. Phase 6 : stock/entrées/fournisseurs UI. Phase 7 : UI retours. Phase 8 : dépenses/rapports/clôture Z/zakat UI. Phase 9 : pain/proformas UI.
3. Migration 0004 : `sale_payments.sale_id` nullable + index ; import CSV produits/clients validé-avant-commit.
4. Tests E2E Playwright (vente/crédit/retour/backup) + perfs 10k/100k.
5. Installateur testé sur machine Windows propre + persistence restart + uninstall sans perte.
