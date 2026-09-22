# PHASE_7 — Réparation radicale + renaissance E2E (2026-09-22)

## Portes qualité (tout vert)

- `vitest run` : **394/394 (63 fichiers)** — logique, idempotence, licence, migrations.
- `playwright test` : **23 passed, 3 skipped, 0 failed (13.1 min)** — Electron réel,
  base vierge par test. Skips documentés : installeur (exige le setup packagé),
  drag/resize (souris réelle).
- `typecheck` / `typecheck:electron` / `typecheck:manager` : 0 erreur.
- `prettier --check .` : vert. `verify:migrations` : 30/30 + invariants.
- `license:scan` : 464 fichiers, aucun secret/bypass. `eslint` ciblé : vert.
- Builds : `build` + `build:electron` + `build:manager-client` + `build:manager` : OK.
- `manager-smoke.mjs` : boot réel du License Manager, titre + capture FR vérifiés.

## Réparations radicales (pas de cache-misère)

1. **E2E ressuscitée (7 échecs → 0)** :
   - `helpers.settlePayment` : traverse le wizard PayDialog en 3 étapes
     (montant → Continuer → [échéance → Continuer] → Valider). Les 7 sites
     cliquaient « Valider » directement → timeouts 120 s systématiques.
   - `customer-invoice` : la vente vide le panier (voulu) → re-sélection client
     avant Fiche ; locators aria-label corrigés (« Ouvrir la fiche de … »,
     « Apercevoir la facture … » — l'aria-label remplace le texte visible,
     les anciens sélecteurs ne pouvaient jamais matcher).
2. **Render anti-crash** : `formatDzdSafe` (jamais de throw en JSX), 13 sites DB
   brutes migrés (ProformaDialogs, DetailsDrawer, DebtDialogs,
   NewCustomerReturnDialog).
3. **Hygiène** : ZIPs racine supprimés + `*.zip/*.7z/*.rar` ignorés,
   `format:check` vert (14 fichiers), README 394 tests, `build:manager` purge
   le JS mort du renderer, `manager-smoke.mjs`, `ADR-031`.
4. **Git** : 349 entrées en chantier → 9 commits propres par couches
   (cleanup, db, pos-main, pos-ui, manager, quality, e2e ×2, locators).

## Vérifié sans compromis (échantillon strict)

- Aucun `run-sql` ; Zod partout ; `contextIsolation:true/nodeIntegration:false` ;
  11 iframes `sandbox=""` ; argent en centimes ; domaine sans framework ;
  transactions atomiques + `operationId` (updates idempotentes par valeur :
  contrat documenté P18/M-3, pas d'`operationId` factice) ;
  fragments SQL dynamiques = littéraux fixes, valeurs en `?` ;
  `step="any"` gardé par `roundQuantity` + Zod ; `cartsClear` exposé mais
  inutile en UI (la sauvegarde différée persiste l'état vidé).

## Restes connus (non masqués)

- `npm run lint` complet > 120 s (projectService) — contourné par lint ciblé ;
  à profiler (découpage config).
- `private/vendor-keys/private.key` au repos non chiffré (scan l'exclut
  volontairement) — durcir (mot de passe/HSM) côté vendor.
- WAL-companions dupliqués ×3 sites ; snapshots pré-migration invisibles de
  `listBackups` ; `lint` E2E `installer.spec` non joué (exige `package:win`).
