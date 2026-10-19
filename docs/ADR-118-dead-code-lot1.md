# ADR-118 — Lot 1 du nettoyage dead-code : 21 symboles morts, aucun contrat touché

## Contexte

Audit dead-code du 2026-10-18 (`docs/reports/DEAD_CODE_AUDIT_2026-10-18.md`,
référence `4af1265`) : 219 candidats bruts issus de `knip` 6.42.0, dont
**212 faux positifs réfutés** (points d'entrée multi-paquets non modélisés,
exports consommés uniquement par leur propre fichier). 47 findings réels.

Le présent ADR arbitre le **lot 1** : code mort **sûr**, c'est-à-dire sans
effet runtime, **sans toucher au contrat de bridge**. Le lot 2 (6 canaux IPC
morts) fait l'objet d'un ADR distinct (ADR-119) car il évolue un contrat gelé.

Méthode : chaque symbole a été revérifié par recherche exhaustive avant
suppression (« ça ressemble à du code mort » sans preuve n'est pas un finding).
Les pièges suivants ont été **écartés explicitement** :

- `recovery.retry` / `recovery.exit` — absents de `ipc-client.ts`, donc
  faussement candidats ; ils sont appelés depuis le **HTML généré côté main**
  (`electron/main/recovery-view.ts:95,100`, `electron/main/license-view.ts:95`)
  via `window.veloria`. **VIVANTS**, conservés.
- `bindings` (« dépendance inutilisée ») — arête runtime **transitive**
  exigée par `better-sqlite3/lib/database.js:48` (`require('bindings')`).
  Décision ADR-005. **CONSERVÉE**.
- Les 22 fichiers `mobile/**` et 16 fichiers `license-manager/**` — points
  d'entrée Expo / electron-builder. **CONSERVÉS**.
- Le chantier impression non commité (20 fichiers modifiés + 3 nouveaux) :
  **hors périmètre**, jamais touché ni commité (cf. « Réserve »).

## Décision (supprimé)

Lot exécuté en une passe, **21 fichiers, 148 lignes supprimées / 3 ajoutées**
(les 3 ajouts sont la réécriture de commentaires devenus faux).

### `electron/`

| Symbole                                                                                                            | Emplacement                    |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `clearCartDrafts` (alias mort de `clearCartDraftsAtomic`)                                                          | `ipc/handlers/carts.repo.ts`   |
| `sumRemaining`                                                                                                     | `ipc/handlers/fifo.ts`         |
| `expirationDate` (schéma Zod non câblé, survivait à la garde `bridge-shape` car son nom ne finit pas par `Schema`) | `ipc/validators.common.ts`     |
| `LICENSE_SIGNATURE_ALG`, `EXPIRING_CRITICAL_DAYS`, `sha256Hex`                                                     | `licensing/protocol.ts`        |
| `clearIntegrityCache`                                                                                              | `licensing/integrity.ts`       |
| `clearFingerprintCache`                                                                                            | `licensing/fingerprint.ts`     |
| `setSecretBackendForTests`                                                                                         | `sync/sync.service.ts`         |
| `export type { TemplateRender }` (réexport mort)                                                                   | `printing/printing.service.ts` |

### `src/`

| Symbole                                                                                                                              | Emplacement                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| réexports `DENSITY_KEY`, `THEME_KEY`, `initialDensity`, `initialTheme`, `Density`, `Theme`                                           | `app/shell/shell-types.ts`          |
| `export type { ModuleId }` (réexport mort + commentaire « compat » périmé)                                                           | `app/shell/App.tsx`                 |
| `clampRetentionCount` (extrait par ADR-047, jamais appelé)                                                                           | `domain/backup/backup-rules.ts`     |
| `CLIENT_PIN_LENGTH`                                                                                                                  | `domain/customer/client-access.ts`  |
| `DebtAgingInput`, `agingBucketLabelFr`                                                                                               | `domain/customer/credit-policy.ts`  |
| `OcrDocumentKind`                                                                                                                    | `domain/ocr/types.ts`               |
| `STAFF_CODE_LENGTH`, `STAFF_RECOVERY_MAX_FAILED`, `STAFF_RECOVERY_LOCK_MINUTES`, `STAFF_PERMISSION_LABELS`, `assertValidDisplayName` | `domain/staff/staff.ts`             |
| `assertReceivableQuantity`                                                                                                           | `domain/suppliers/po-rules.ts`      |
| `ItemCondition` (doublon de `features/returns/types.ts`)                                                                             | `domain/returns/return-rules.ts`    |
| `LicensePageId`, `LicenseFeatureId` (doublons de `electron/licensing/catalog.ts`)                                                    | `features/license/catalog.ts`       |
| `CustomerDrawerState`                                                                                                                | `features/sales/sell/sell-types.ts` |

### Dossiers / tests

| Élément                                                           | Emplacement                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| 2 dossiers vides supprimés                                        | `src/shared/validation/`, `electron/database/migrations/` |
| `acceptNextConfirm` (0 appelant, 0 usage interne)                 | `tests/e2e/helpers.ts`                                    |
| entrée dupliquée `"electron/ipc/registry.core.ts"` dans `SCANNED` | `tests/unit/ipc-channel-inventory.test.ts`                |

### Nettoyage induit (obligatoire)

`noUnusedLocals` étant actif dans les deux tsconfig, la suppression a
nécessité de retirer les imports devenus orphelins : `createHash` et
`LICENSE_CRITICAL_DAYS` (`licensing/protocol.ts`). Sans cela, `tsc -b` échoue.

## Réserve — discipline d'arbre sale

Le dépôt portait **20 fichiers modifiés + 3 nouveaux** d'un chantier impression
**sans rapport** (`template-capabilities`, `capabilities`, `TemplateSettingsPanel`).
Conformément à AGENTS.md §10, **aucun de ces fichiers n'a été touché ni
commité** : le lot a été staffé par **chemins explicites**, jamais `git add -A`.
Les findings dead-code qui vivaient dans cette zone sont **différés** au lot 2 :
`receipt-documents.ts` (15 réexports morts), `receipt-documents/common.ts`
(9 réexports morts) et `printing.receipt.ts` (handler `printer.get`).

## Conséquences

- **Aucun canal IPC, validateur Zod, compteur gelé, snapshot ou fichier de
  configuration touché.** `bridge-shape`, `ipc-channel-inventory`,
  `validators-inventory` (114) et `operation-id-coverage` (R1) sont **strictement
  inchangés**.
- `STAFF_PERMISSION_LABELS`, `MINOR_PER_MAJOR`-like constants : le code vivant
  respectif (`features/staff/UsersAdmin.tsx:11`, `electron/…/staff.repo.ts:23-24`)
  n'est pas touché — ces doublons main/domaine ou intra-`src` restent du ressort
  d'un refactor ultérieur, **hors périmètre code mort** (règle 4).
- `EXPIRING_CRITICAL_DAYS` retiré : il n'existait qu'un état `EXPIRING_SOON`
  dans `licenseStatus` (`protocol.ts:342`). La suppression **constate** ce trou,
  elle ne le crée pas. Signalé comme dette produit.
- `clearSecureState` (`licensing/secure-state.ts`) et `RAW_GUARDED_CHANNELS`
  (`ipc/raw-guards.ts`) **conservés** : le premier est une fonctionnalité
  manquante, le second une garde non appliquée — deux décisions, pas du code mort.

## Vérification

Toutes les portes vertes, dans l'ordre AGENTS.md §8 :

| Porte                               | Avant                  | Après                                        |
| ----------------------------------- | ---------------------- | -------------------------------------------- |
| `npm run format`                    | —                      | ✓                                            |
| `npm run typecheck` (`tsc -b`)      | 0 erreur               | **0 erreur** (manifeste signé, 214 fichiers) |
| `npm run lint` (`--max-warnings 0`) | 0                      | **0**                                        |
| `npm run test`                      | 804/804 (121 fichiers) | **804/804 (121 fichiers)** — aucune perte    |
| `npm run build`                     | ✓                      | ✓                                            |
| `npm run build:electron`            | ✓                      | ✓                                            |
| `npm run verify:migrations`         | VERIFIED               | **MIGRATIONS VERIFIED**                      |
| `npm run verify:domain`             | VERIFIED               | **DOMAIN VERIFIED**                          |
| `graphify update .`                 | —                      | 6011 nœuds / 16430 arêtes                    |

**Preuve de non-régression** : `804 → 804`. Aucun test ne référençait les 21
symboles supprimés — établi beforehand, symbole par symbole.

## Fichiers affectés

21 fichiers. Liste exhaustive dans `docs/reports/DEAD_CODE_AUDIT_2026-10-18.md`
(§2.2). Point de retour arrière : `git revert` du commit du lot (aucune donnée,
aucun schéma, aucune migration).
