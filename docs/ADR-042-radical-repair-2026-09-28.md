# ADR-042 — Réparation radicale P0–P3 (2026-09-28)

## Contexte

Audit profond (chaque dossier/fichier/ligne) : 30+ problèmes confirmés par
exécution (pas d'inférence). Les plus graves :

1. `registry.ts` : 24 canaux `schema=null` (violation littérale AGENTS.md §3) ;
   `backup/printing/ocr` via `ipcMain.handle` direct (pas de `requestId`, pas
   de `toUserMessage` central, gardes licence tripliquées → risque drift).
2. `audit.operation_id = randomUUID()` neuf sur chaque update (sales:63,
   products:341, customers:179, suppliers:238, proformas:164/335, company:100,
   settings:69, categories:495) → replay = audit gonflé, incorrélable.
3. `bread.recordPayment/updateQuantity` : `operationId?` optionnel + fallback
   `randomUUID()` (contrat caller-owned cassé) alors que Zod l'exige.
4. `verify-migrations.mjs` : assertions dures jusqu'à 0026 seulement ;
   0027–0030 appliquées sans vérification.
5. `retention.ts` : purge 90 j de `idempotency_keys` y compris pour les
   opérations SANS garde UNIQUE métier (cancel/adjust/returns/updates) →
   rejouement tardif ré-exécutable.
6. `fifo.restoreToLayers` : pas de borne haute proactive (dépend du trigger
   0023, message SQL brut).
7. `sale_items.discount_minor` (0027) : aucune borne DB (négatif/excessif via
   SQL direct).
8. `exportBackupToFolder` : `assertSafeUserFolder` seulement dans le handler ;
   `VACUUM INTO '${esc}'` avec échappement manuel dispersé.
9. `license-anchor.ts:51` : interpolation `${CONST}` (constante sûre mais
   incohérente) ; `history.repo` : `${table}/${col}` sans allowlist explicite.
10. `engines: >=22.5` (autorise Node 24/26, ABI `.node` Electron 37 cassée —
    ADR-002 exige `<23`) ; `README` (394/63 obsolète, réel ~410/65).
11. `src` : 5 commentaires arabes, `minorToInput` en float (`/100 + toFixed`).
12. `lint --max-warnings 0` rouge pré-existant : 4 `.cjs` hors
    `allowDefaultProject` + 4 erreurs types (`return-policy`, `po-rules`,
    `sound`, `useSellShortcuts`).

## Décisions

- **P0 IPC** : `V.emptyPayloadSchema = z.object({}).strict()` pour les 24
  lectures ; `backup.create/list/status/autoGet` validées (Zod) + log.
  Unification complète `backup/printing/ocr` via `handle()` central reportée
  (cycle d'import `registry ↔ backup/printing` : exige extraction
  `electron/ipc/handle.ts` dédié — planifié, pas de rustine).
- **P1 Idempotence honnête (v2)** : updates = `operationId OPTIONNEL honoré`.
  Sans UUID (legacy) : last-write-wins + `auditOperationId()` déterministe
  (`sha256(entity|id|payload)`, préfixe `det-`) au lieu de `randomUUID()`.
  Avec UUID : `peek/claim/store` (`products.update`, `customers.update`,
  `suppliers.update`, `expenses.update`, `sales.setDueDate`,
  `proformas.update/status`, `company.update`, `settings.save*`,
  `zakat.saveParams`, `categories.create`, `products.setSuppliers`).
  `categories.create` : retry même UUID = même id (plus de doublon
  double-clic). `bread.*` : `operationId: string` requis (plus de fallback).
- **P2 DB** : migration **0031** (immuable, `DROP IF EXISTS + CREATE`) —
  6 triggers remises (`discount >= 0`, `origine >= 0`, `discount <=
origine×qty + 1ct`) ; `verify-migrations` étendu 0027–0031 (colonnes, index
  restauré, séquence CMD, `cart_drafts`, 6 triggers + rejet négatif/excessif +
  acceptation saine) ; `retention` sélective (critiques 365 j) ;
  `restoreToLayers` borne proactive (`> origine` → `DomainError` FR) ;
  `exportBackupToFolder` assert interne + `vacuumInto()` centralisé.
- **P3 Hygiène** : `engines >=22.5 <23` ; `README` (~410/65) ; commentaires AR
  supprimés ; `minorToInput` entier (`dzd,cc` sans float) ; `license-anchor`
  en `?` ; `history` allowlist + asserts ; `eslint.allowDefaultProject` +4
  `.cjs` ; 4 erreurs types corrigées sans changer le comportement.
- **Non-faits (assumés)** : `ORDER BY ${order}` whitelist (documenté, pas de
  saisie) ; `settings.save`/`company` singleton sans `UNIQUE` métier (couvert
  par rétention 365 j) ; `printing/ocr` toujours en `ipcMain.handle` direct
  mais avec Zod + FR + log (unification centrale = prochaine étape
  structurelle).

## Conséquences

- `verify:migrations` vert (0001→0031 + `integrity_check=ok`).
- `typecheck` + `typecheck:electron` verts ; `test` 410/65 verts ; `license:scan`
  - `verify:domain` verts ; prettier vert sur tous les fichiers touchés.
- `lint` : fichiers touchés verts ; reste du repo à finir (fichiers hors
  périmètre : voir `PHASE_RADICAL_REPAIR_REPORT.md`).
- Renderer legacy (sans `operationId` sur updates) : compatible (optionnel) ;
  les nouveaux dialogues DOIVENT envoyer `newOperationId()` par édition
  (retry = no-op).
