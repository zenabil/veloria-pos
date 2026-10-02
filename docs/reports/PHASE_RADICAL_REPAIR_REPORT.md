# Rapport — Réparation radicale (2026-09-28)

## Périmètre vérifié

`electron/`, `src/`, `database/migrations` (0001→0031), `scripts/`,
`tests/`, `license-manager/`, racine (package/vite/builder/tsconfig/eslint).

## Réparations appliquées (vérifiées par exécution)

- **P0 IPC** : 25 canaux `null` → `V.emptyPayloadSchema` ; `backup.create/list/
status/autoGet` validées Zod + log. Décision : unification centrale complète
  reportée (exige `electron/ipc/handle.ts` pour casser le cycle
  `registry ↔ backup/printing`).
- **P1 Idempotence** : `operationId` optionnel honoré sur 13 mutations
  (products/customers/suppliers/expenses/sales-dueDate/proformas-2/company/
  settings-8/zakat-params/categories/setSuppliers) + `auditOperationId()`
  déterministe ; `categories.create` retry-safe ; `bread.pay/updateQty`
  requis (plus de fallback).
- **P2 DB** : migration **0031** (6 triggers remises) ; `verify-migrations`
  0027–0031 ; `retention` sélective (critiques 365 j) ; `restoreToLayers`
  borné ; `exportBackupToFolder` + `vacuumInto()` durcis.
- **P3 Hygiène** : `engines <23`, `README`, 5 commentaires AR, `minorToInput`
  entier, `license-anchor ?`, `history` allowlist, `eslint` +4 cjs + 4 types.

## Preuves

- `typecheck` ✓, `typecheck:electron` ✓, `verify:migrations` ✓ (0031),
  `test` ✓ (410/65), `license:scan` ✓, `verify:domain` ✓,
  `build` ✓, `build:electron` ✓, prettier ✓ (fichiers touchés).
- `lint` : fichiers touchés ✓ ; échecs restants hors périmètre
  (stitch\_ mockups + voir ADR-042).

## Reste (non-bloquant, planifié)

1. Extraire `electron/ipc/handle.ts` + migrer `backup/printing/ocr/recovery`.
2. Envoyer `newOperationId()` depuis chaque dialogue d'édition (renderer).
3. Unifier `licenses.status` vs `license_status` (Manager).
4. Chiffrer `private/vendor-keys/private.key` au repos.
5. `.prettierignore` pour `stitch_/` ou reformat assumé.
