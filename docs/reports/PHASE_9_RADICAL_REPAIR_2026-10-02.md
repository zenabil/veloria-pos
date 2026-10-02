# PHASE 9 — Réparation radicale post-audit 2026-10-02 (idempotence totale + gardes strictes)

> Branche : `chore/root-layout` → commit `6ee2862` (+ suite). ADR : `docs/ADR-057-radical-repair-2026-10-02.md`.
> Méthode : 4 audits parallèles (src / electron / DB-tests-configs / racine) + correctifs + re-vérification + smoke release.

## Correctifs livrés (comportement inchangé, contrat durci)

1. **Idempotence AGENTS §4** : `carts.save/clear` (`carts.repo.ts`), `printer.save` (`printing.service.ts`), `backup.autoSave` (`backup.service.ts`), `database.relocate/reset` (`registry.ts` + `sqlite.service.ts`) honorent `operationId` optionnel (`peekOptional/claimOptional/storeOptional` en TX). Renderer envoie `newOperationId()` (`SellScreen`, `SettingsSectionsB` ×5, `PrintTemplatesScreen`).
2. **Zod frontière** : `printFormatSchema` (`validators.ts`) sur `paymentTicket/delivery/returnSlip/purchaseOrderDoc` ; impression lit le format validé (0 `raw.format` restant).
3. **Logs WARN** : `thermalWidth/qr/companyIdentity` (printing), `sync.read/pending`, `license.gate_best_effort`, `relocate.checkpoint/companions`, `backup.schema_version/retention`.
4. **SQL** : allow-list `history-query.ts` (kinds/event/tables) ; `PRODUCT_USAGE_TABLES` = littéraux internes.
5. **Renderer** : `api.windowOnMaximizedChanged` (plus de `window.veloria` direct hors garde), `roundQuantity` centralisé (2 fichiers), bloc 360 erroné supprimé de `ClientsScreen` (typecheck vert).
6. **Configs** : `clean` étendu + `clean:logs`, `package:pos` = alias `package:win`, `noUnusedParameters:true` electron, `.gitignore` += `.expo/`.
7. **Tests** : shim TX réel (2 fichiers), `migrations.test` exact 34 + cas 0031/0034, nouveau `idempotency-config.test.ts` (4 repos réels), `bridge-shape` exempt helpers.
8. **Suite (post-commit)** : `release:smoke` rouge → artefact `manager preload.js` périmé (`require("../ipc/channels")`) → `npm run build:manager` → smoke vert. Cause : dist ignoré/périmé, pas de bug source.

## Gardes (toutes vertes)

`format` ✓ · `format:check` ✓ · `typecheck` ✓ · `typecheck:electron` ✓ · `typecheck:manager` ✓ · `verify:migrations` (0034) ✓ · `verify:domain` ✓ · `verify:perf` ✓ · `test:db` 85 ✓ · `unit` 427 ✓ · `vite build` ✓ · `build:electron` ✓ · `build:manager` ✓ · `release:smoke` ✓ · `license:scan` ✓ · `eslint` src/electron/tests ✓ (`npm run lint` global : timeout poste, voir ADR-048).

## Volontairement reporté (voir ADR-057 §9)

Découpage fichiers >800 l. · `/100` inputs (helper `minorToInput` à créer) · `warningsAsErrors:false` (NSIS) · `mobile/cloud/stitch/release` (trancher extraction repo).
