# ADR-074 — Réparation radicale sur conseil llm-council (2026-10-08)

## Contexte

Conseil llm-council (5 conseillers + 5 reviewers anonymes) sur les résidus de la
réparation du 08-10 (grilles vertes : `verify-migrations` 40/40, `tsc` ×2,
644 vitest, `vite build`). Verdict : un seul bloqueur réel, le reste =
exceptions documentées + garde-fous.

## Décisions

- **R6 (bloqueur, fix immédiat)** : `0037–0040` + arbre de travail commités
  (`cf63a77`, `2222685`) après `license:scan` vert et tri (secrets/`*.sqlite`/
  build exclus par `.gitignore`, `graphify-out/` ignoré car régénérable).
  Gate ajoutée : tout état vert n'est valable que sur arbre commité.
- **R1 (exception + test)** : mutations monétaires exigent `operationId`
  (`handle.ts:70-77` + use-cases domaine) ; ~20 schémas LWW
  (updates, brouillons `carts.*`, 9 réglages) restent optionnels (compat
  legacy, `peekOptional` no-op volontaire). Gelé par
  `tests/unit/operation-id-coverage.test.ts`. Forçage global interdit sans ADR.
  Manque remonté par la peer review (non résolu) : garantie DB
  (`UNIQUE(operationId)` + claim atomique + test double-submit concurrent).
  Correction trouvée par le garde lui-même : `purchaseReceiveSchema`
  (.superRefine) et tout schéma raffiné échappaient à
  `schemaRequiresOperationId` (ZodEffects sans `shape`) — le garde déballe
  désormais les effets (jamais Optional/Nullable) ; `breadUpdateSchema`
  rejoint la liste REQUIRED (l'audit le croyait optionnel à tort).
- **R2 (fix ciblé)** : `electron/ipc/handlers/sql-guard.ts`
  (`assertOrderClause`, fail-closed FR) appliqué aux 8 `ORDER BY ${order}`
  (bread, customers→fixe, expenses, finance, history, inventory, proformas,
  returns, suppliers). `VACUUM INTO` inchangé (placeholder impossible,
  échappement + rejet déjà en place). Garde : `tests/unit/sql-guard.test.ts`.
- **R3 (triage)** : OCR (`OcrImportDialog.tsx`) → FR + log partout, `notify`
  sur les recherches trompeusement vides ; shell/vigilance déjà loggés.
  Politique : mutation/formulaire = FR + log ; best-effort diagnostique =
  log + commentaire ; formateurs UI sûrs (`formatDzdSafe` → "—") inchangés.
- **R4 (mixte)** : `retention.ts:91` = exception documentée (DELETE
  mono-instruction atomique, hors-tx volontaire) ; `fifo.ts` =
  `assertCallerTransaction()` fail-closed sur `createLayer`/`consumeLayers`.
- **R5 (gel)** : canal wire `products.import` ↔ namespace bridge
  `productsExtra.import` documenté (`channels.ts:31`, `preload.ts:205`) +
  `tests/unit/channel-alias.test.ts`. Renommage interdit sans alias + ADR.
- **R7 (différé)** : parité épinglée par
  `tests/unit/quantity-money-parity.test.ts` (millièmes domaine = carts =
  FIFO TH ; round-trip `minorToInput`) ; unification OCR opportuniste.
- **R8 (exception)** : warning `NODE_MODULE_VERSION` = divergence ABI
  Node-test vs Electron, bénin (tests verts). Gate : smoke `better-sqlite3`
  dans l'Electron packagé à chaque release (AGENTS.md §9), déjà couvert par
  `ci.yml` (binding-presence) + `postinstall` rebuild.

## Conséquences

- 4 nouveaux tests-gardes ; `verify-migrations` couvre désormais `0037/0038`
  en contenu ; pipeline inchangé (format → typecheck → tests → build).
- Dette traçée : preuve DB d'idempotence (UNIQUE + replay concurrent),
  règle eslint `no-empty-catch` scopée, E2E packagé avec kill-9 mid-tx.
