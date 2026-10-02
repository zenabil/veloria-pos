# ADR-057 — Réparation radicale 2026-10-02 (audit zéro-tolérance)

> Statut : accepté. Périmètre : `src/` + `electron/` + `database/migrations/` (0034) + `tests/` + configs + racine. Méthode : 4 inventaires parallèles + relecture manuelle + exécution des gardes.

## Contexte

Audit du 2026-10-02 (branche `chore/root-layout`, ~450 fichiers suivis + ~120 untracked) : 0 violation bloquante des 7 règles hardcor (SQLite seule source, renderer `window.veloria` seul, pas de `run-sql`, centimes + TX, migrations immuables, FR seul, pas de mocks), mais 6 critiques idempotence, 12 majeurs (catches muets, lectures brutes `raw.format`, interpolations SQL sans garde, configs laxistes, seuils tests faibles, homonymies rapports, orphelins racine).

## Décisions

1. **Idempotence totale (AGENTS §4)** : `carts.save/clear`, `printer.save`, `backup.autoSave`, `database.relocate/reset` honorent `operationId` optionnel via `peekOptional/claimOptional/storeOptional` dans la TX appelante (même motif que `settings.save`, `products.update`). Retry même UUID = résultat rejoué, pas de 2e effet. Renderer génère `newOperationId()` par commande (caisse, impression, backup, relocate). `database.reset` propage `operationId` (stocké après reopen sur base vierge).
2. **Logs best-effort** : tout `catch` qui masquait une panne DB/imprimante/synchro/licence journalise `WARN` (`thermalWidth.unreadable`, `qr.unavailable`, `companyIdentity.unreadable`, `sync.read_failed/pending_count_failed`, `license.gate_best_effort`, `relocate.checkpoint_fallback/companion_skipped`, `backup.schema_version/retention.unreadable`). Nominal (fichier absent, sidecar manquant) reste silencieux + commentaire.
3. **Zod frontière** : `format: enum(A4,80mm).optional()` sur `paymentTicket`, `delivery`, `returnSlip`, `purchaseOrderDoc`. Impression lit le format validé uniquement (jamais de cast `raw.format`). `operationId` optionnel sur `cartsSave/cartsClear/printerSave/backupAuto/relocate` (compat legacy + honnête).
4. **SQL interpolé** : allow-list runtime sur `history-query` (`HISTORY_KINDS`, event regex, tables `customers/suppliers/products`) + `PRODUCT_USAGE_TABLES` documenté comme littéraux internes seuls. Valeurs toujours en `?`.
5. **Renderer** : `windowOnMaximizedChanged` exposé via `api` (plus de `window.veloria` hors `ipc-client.ts`), `roundQuantity` centralisé (DetailsDrawer, SupplierPOsDialog), `execCommand` conservé comme repli non-sécurisé documenté.
6. **Configs strictes** : `clean` couvre `dist*/tsbuildinfo/test-results/coverage/playwright-report` + `clean:logs`, `package:pos` = alias `package:win` (zéro duplication), `tsconfig.electron noUnusedParameters:true` (parité main/renderer). `electron-builder warningsAsErrors:false` conservé (warnings NSIS tolérés, documentés ici) — `eslint --max-warnings 0` + `vitest thresholds` + `verify-migrations` restent bloquants.
7. **Tests** : shim `transaction` réel (BEGIN/COMMIT/ROLLBACK) sur `dashboard-cancelled-payments` + `retention-critical`, seuils `migrations.test` exacts (34 fichiers, 0001→0034), cas 0031 (triggers) + 0034 (téléphone unique), nouveau `idempotency-config.test.ts` (repos réels carts/printer/backup).
8. **Racine** : `src/domain/payment|supplier` (singuliers vides, 0 import) supprimés. `src/application/*` vides conservés per ADR-048 (réserve use-cases, churn sans gain). `stitch_veloria_client_mobile_app/`, `mobile/`, `cloud/`, `release/` conservés (fonctionnels, ignorés ou assumés) — à trancher en ADR dédiée si extraction repo séparé. Homonymies `PHASE_*`/`AUDIT_*` racine vs `docs/reports/` documentées ici (racine = canonique Phase 2-4+client, `docs/reports/` = archive Phase 0-8) ; interdiction de nouveaux homonymes.
9. **Non-faits volontairement** : découpage `SellScreen`/`ClientDialogs`/`SettingsSectionsB` (>800l.) reporté (risque régression, couvert par ErrorBoundary + tests) ; `/100` affichage dispersé toléré (affichage seul, `formatDzd` recommandé pour neuf) ; `mobile/.expo`, `mobile/node_modules` ignorés (jamais committés).

## Conséquences

- `npm run format && npm run typecheck && npm test && npm run verify:migrations && npm run verify:domain` verts exigés avant commit.
- Chaque nouvelle mutation : schéma Zod + `operationId` (requis ou optionnel honoré) + TX + test SQLite réel.
- Tout nouveau `catch` best-effort : commentaire + `log WARN` si panne masquée.
