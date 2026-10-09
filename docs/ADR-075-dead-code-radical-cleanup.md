# ADR-075 — Nettoyage radical du code mort (audit 2026-10-09)

## Contexte

Audit dead-code du 2026-10-09 : trois passes parallèles (sous-agents
`refactor-cleaner` ×2 sur `src/` + `electron/`, `explore` sur
`tests/`+`scripts/`+`docs/`+racine), chaque finding revérifié par
l'opérateur (`grep` repo-wide + lecture directe) avant toute suppression.
Règle applicable : AGENTS.md §13 (audit d'abord, jamais de suppression
automatique) — suppressions exécutées après approbation explicite
(« tout en une fois »), avec garde `bridge-shape` + `ipc-channel-inventory`
comme filet.

## Décisions (supprimé)

1. **10 canaux IPC sans appelant renderer** (vérifié : 0 référence hors
   `vite-env.d.ts` type-only + snapshot) : `app.getVersion`,
   `products.get`, `customers.import`, `stock.lowStock`, `stock.valuation`,
   `reports.full`, `carts.clear`, `backup.autoGet`, `license.getInfo`,
   `license.getPermissions`. Retirés de : `channels.ts`, `handle()` des
   8 registres + bloc `ipcMain.handle` backup, `preload.ts`,
   `src/vite-env.d.ts`, `license-gates.ts` (8 entrées : protected +
   PAGE_GATED + FEATURE_GATED), snapshot `ipc-channels.json`.
   Canaux remplacés par : `app.diagnostics`, `products.search/getByBarcode/
barcodes`, `stock.overview`, `reports.summary`+`closings.get`,
   `carts.save/load`, `backup.status`.
2. **5 fonctions repo devenues orphelines** (définition + handler mort
   uniquement, 0 test direct) : `Inventory.listLowStock`,
   `Inventory.getInventoryValuation`, `Imports.importCustomersAtomic` (+
   interface `CustomerImportRow`), `Finance.getPeriodReport`,
   `Products.getProduct`. Fonctions sœurs conservées car testées ou
   appelées en interne : `clearCartDraftsAtomic`, `getBackupAuto`,
   `getLicenseStatus`, `fifoValuation`.
3. **3 schémas Zod orphelins** (garde `bridge-shape` « uses every Zod
   validator » l'exigeait après retrait des handlers) : `cartsClearSchema`,
   `customersImportSchema`, `periodSchema` (inliné dans
   `closingsListSchema`, forme inchangée). Tests ajustés sans perte de
   couverture métier : `idempotency-config` (parse schéma retiré, bloc
   repo conservé + renommé), `operation-id-coverage` (1 entrée R1 retirée
   — évolution autorisée par le présent ADR), `update-operationid`
   (assertions `customersImport`, `productsImport` conservé),
   `validators-inventory` (compte gelé 125 → 122 sous le présent ADR).
4. **3 exports renderer morts** (0 importeur repo-wide) :
   `PAGE_LABELS_FR` + `FEATURE_LABELS_FR` (`license/catalog.ts`),
   réexport `ZakatForm` (`zakat/types.ts`). Doublon d'import
   `backup.service.ts:28-29` unifié vers `V.*`.
5. **Unifications sans changement de comportement** (vérifiées par tests
   pinning préexistants) : `UNIT_CODES`/`UnitCode`/`normalizeUnitCode`
   (`product-rules.ts` → source unique `domain/units`, divergence `CL`
   résorbée) ; `BackupFrequency`/`backupFrequencyMinutes`
   (`settings/backup-frequency.ts` → réexport du domaine, bornes
   [5,10080] ; libellés FR + `backupFrequencyFromAuto` restent en feature).
   `STOCK_STATUS_CASE` : fragment CASE unique (3 sites adjust/intake/
   inventory, mêmes `?`, valeurs liées).
6. **Artefacts ignorés** : 8 `scripts/maintenance/*.log` (non suivis par
   git, régénérables) supprimés ; `.ps1` + `.jpg` d'archive conservés.

## Décisions (conservé délibérément — ne pas « nettoyer »)

- **D1** (`registry.core.ts:79-95` peek manuel) : sémantique différente
  voulue sur le chemin relocate/récupération (garde de forme
  `{moved,path}`, pas de check `op_type`, silencieux base non ouvrable).
- **D2** (compagnons WAL ×3) : opérations différentes (copie vs snapshot
  vs purge), seule la liste de suffixes est commune — extraction sans valeur.
- **D4** (catch UNIQUE + `peek` sur chemins monétaires) : variantes
  `op_type` intentionnelles ; refactor sans test d'ancrage = risque > gain.
- **D5** (`printing/enrich.ts` receipt vs payment) : paramétrisation = design,
  suivi séparé.
- **F-E** (Drawers/dialogs par feature) : unification structurelle future,
  pas suppression.
- **`paymentTicketFormatSchema`** : membre officiel du set `nested` du
  test `bridge-shape` (alias 1 ligne) — conservé.
- **`handoff.md` racine** : fichier de travail actif suivi par git — pas un
  rapport ; déplacement refusé (ne pas casser les sessions).
- **77 ADR** : immuables par construction (ADR-NEW-docs-hygiene).

## Conséquences

- Surface bridge : −10 canaux (193 → ~183) ; snapshot régénéré ;
  liste gelée R1 évoluée sous le présent ADR (exigé par
  `operation-id-coverage.test.ts:1-4`).
- `verify:migrations` inchangé (aucune migration : aucun changement schéma).
- Index `docs/INDEX.md` mis à jour (ADR-071→075 + `ADR-NEW-*`).

## Vérification

`prettier` propre, `tsc -b` + `tsc electron` verts, `eslint`
`--max-warnings 0` vert sur fichiers touchés, `vitest run` complet vert
(dont `bridge-shape` 3/3, `ipc-channel-inventory` 2/2, atomic/rollback),
`verify:migrations` vert.
