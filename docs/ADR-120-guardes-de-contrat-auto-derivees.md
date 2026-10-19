# ADR-120 — Gardes de contrat auto-dérivées (les gardes qui ne peuvent pas échouer ne sont pas des gardes)

- **Statut** : Proposé (soumis à l'approbation du propriétaire)
- **Date** : 2026-10-19
- **Décideur** : propriétaire du projet Veloria PoS
- **Réf** : `docs/reports/FULL_AUDIT_2026-10-19.md` §3.G, §3.I ·
  `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` §2 (W4) ·
  `docs/ADR-075-dead-code-radical-cleanup.md` · `docs/ADR-087-staff-full-matrix.md`

## Contexte

Le dépôt Veloria PoS repose sur un ensemble de « gardes de contrat » (tests
d'inventaire) dont le rôle est d'empêcher qu'un découpage de fichiers ou
l'ajout d'un canal/modèle modifie silencieusement un contrat gelé. Exemples :

| Garde                   | Fichier                                    | Intention déclarée                                                                      |
| ----------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `FROZEN_SCHEMA_COUNT`   | `tests/unit/validators-inventory.test.ts`  | « the count of `export const XSchema` across validators.\*.ts equals the frozen total » |
| `operation-id-coverage` | `tests/unit/operation-id-coverage.test.ts` | « inventaire gelé des schémas exigeant `operationId` »                                  |
| `bridge-shape`          | `tests/unit/bridge-shape.test.ts`          | « chaque validateur Zod est consommé (pas de schéma mort) »                             |
| `ipc-channel-inventory` | `tests/unit/ipc-channel-inventory.test.ts` | « union of `handle(IPC_CHANNELS["x"])` … must equal the checked-in snapshot »           |
| `RAW_GUARDED_CHANNELS`  | `electron/ipc/raw-guards.ts:31`            | « garde-fou de revue : tout nouveau handler brut doit s'y ajouter »                     |
| Arabic-free `src/`      | `eslint.config.mjs:126-142`                | « POS UI FR uniquement : littéral €/arabe interdit dans src/ »                          |

L'audit intégral du 2026-10-19 (228 findings, 23 High, 0 Critical) a montré que
**cinq de ces six gardes ne peuvent pas échouer** :

1. `FROZEN_SCHEMA_COUNT = 113` alors que le dépôt contient **120** schémas
   `*Schema` : la liste `MODULES` (`tests/unit/validators-inventory.test.ts:8-19`)
   **exclut `validators.staff.ts`** (7 schémas). Ajouter ou retirer un schéma
   staff ne fait pas échouer le test.
2. `operation-id-coverage` énumère 41 schémas sur 120 et **ne vérifie pas le
   complément** : un nouveau schéma monétaire sans `operationId` passe
   inaperçu.
3. `bridge-shape` ne couvre que les noms suffixés `*Schema`
   (`/export const (\w+Schema)/g`) : les 8 validateurs Zod non suffixés de
   `validators.common.ts` (`businessDate`, `quantity`, `moneyMinor`,
   `moneyMinorPositive`, `optionalOperationId`, `quantityNonNegative`,
   `isRealCalendarDate`, `schemaRequiresOperationId`) échappent à la garde ;
   en outre son seuil `toBeGreaterThan(10)` est tautologique (120 réels) et
   8 schémas sont exemptés à la main.
4. `ipc-channel-inventory` scanne une **liste de fichiers en dur**
   (`SCANNED`, 21 entrées) et ne voit pas un handler brut créé dans un fichier
   nouveau.
5. `RAW_GUARDED_CHANNELS` n'est lue **par aucun code ni aucun test** (grep sur
   tout le dépôt : 1 définition + 18 occurrences dans `docs/`) et la liste
   elle-même est périmée (34 entrées pour 42 canaux bruts réels).
6. La garde ESLint « pas d'arabe dans `src/` » est **inerte** : le sélecteur
   `Literal[value=/[€\u0600-\u06FF]/]` ne peut pas exprimer une classe de
   caractères non-ASCII dans l'`esquery` d'ESLint ; le sélecteur entier
   devient silencieusement inactif. Vérification exécutée le 2026-10-19 :
   `src/domain/ocr/numbers.ts` (qui contient `دج` ligne 22) passe `eslint`
   avec `exit 0`.

Autrement dit : le dépôt paie le coût d'un inventaire figé (ADR-075 → ADR-119 :
221 candidats bruts, 47 findings réels, 2 lots exécutés) **sans obtenir la
garantie promise**, parce que la garde elle-même est une liste écrite à la
main, donc omissible exactement comme le code qu'elle devait surveiller.

Deux aggravants structurels :

- **La couverture ne voit pas 93 % du code applicatif.**
  `vitest.config.ts:27` limite `coverage.include` à
  `src/domain/**` + `src/application/**`. `src/features/**` (119 fichiers /
  28 784 lignes), `src/shared/**` et `src/app/**` sont hors périmètre, et
  `test:coverage` n'est appelé ni par le CI ni par un script `package*`.
  Constat mesuré : `npm run test:coverage` sort en `EXIT=1` avec 18 dépassements
  de seuil sur 5 fichiers domain — une **porte rouge non branchée**.
- **Les outils de couverture de périmètre sont eux-mêmes des listes en dur** :
  `knip.json:10` (`project`) exclut `license-manager/**` et `cloud/**` ;
  `tsconfig.json:30-39` exclut `mobile/` — alors que `mobile/tsconfig.json`
  et `mobile/package.json` (« typecheck ») existent et que le typecheck du APK
  passe (`exit 0`) : 13 des 22 fichiers de `mobile/src` (tous les écrans React
  et `App.tsx`) ne sont vérifiés par aucune commande.

La règle AGENTS.md §3 (« canaux IPC explicites + validateurs Zod ») et la règle
§4 (« `operationId` idempotent ») reposent sur ces gardes pour tenir dans la
durée. Des gardes omissibles transforment ces règles en conventions.

## Décision

**Toute garde de contrat doit être Auto-dérivée : elle doit recalculer
l'inventaire depuis la source de vérité (le code) et le comparer à une valeur
gelée — jamais énumérer l'inventaire à la main dans le test.**

Concrètement, cinq règles :

1. **Dérivation, pas énumération.** Un test d'inventaire ne liste pas les
   éléments surveillés : il les **découvre** (scan du dépôt) puis compare. La
   liste gelée est un **compteur**, pas une liste.
2. **Exhaustivité obligatoire.** Quand un univers est fini et connu
   (tous les `export const *Schema`, tous les schémas Zod, tous les canaux
   bruts), la garde doit **prouver l'exhaustivité** : l'ensemble découvert
   doit être couvert, et le complément doit être explicitement Asserté. Un
   inventaire partiel est un défaut, pas une approximation.
3. **Aucune exemption non justifiée.** Toute liste d'exceptions doit être
   justifiée par un commentaire qui nomme la raison structurelle ; les
   exemptions doivent être **constantes named** (donc revérifiables), pas des
   chaînes littérales copiées dans le test.
4. **Un seuil est une valeur, pas un plancher.** `toBeGreaterThan(10)` sur une
   base de 120 est un garde-fou inerte ; un seuil doit être la valeur gelée
   elle-même.
5. **Un périmètre hors couverture est un périmètre non surveillé.** Tout
   répertoire contenant du code livré (POS, `electron/`, `license-manager/`,
   `mobile/`, `cloud/`) doit être couvert par **au moins** : un type-check, une
   règle lint type-aware, un scan d'inventaire, et un seuil de couverture —
   et ce périmètre doit être **vérifié par une garde** (par exemple un test
   qui échoue si `knip.json`/`tsconfig.json` cessent de couvrir un répertoire
   livré).

Corollaire : **une garde qui ne peut pas échouer doit être supprimée ou
réécrite**, jamais laissée en place pour donner l'illusion d'une protection
(« une garde qui ment coûte plus cher que pas de garde du tout »).

## Alternatives considérées

| Option                                                                                                                  | Pour                                                                                                                                                                                    | Contre                                                                                                                                                           | Verdict                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **A. Statu quo** (listes figées, seuils souples)                                                                        | Aucun coût de migration ; les ADR-118/119 ont déjà « gelé » plusieurs comptes                                                                                                           | Cinq gardes ne peuvent pas échouer ; régressions silencieuses ; `test:coverage` rouge non branchée ; 93 % du code hors couverture ; la règle §3/§4 perd sa force | **Rejeté** — le coût caché (régressions non détectées) dépasse le coût affiché |
| **B. Supprimer les gardes douteuses** (`RAW_GUARDED_CHANNELS`, `expirationDate`) et ne garder que ce qui est vérifiable | Simplifie ; supprime les garde-fous « trompeurs »                                                                                                                                       | Laisse `FROZEN_SCHEMA_COUNT`, `operation-id-coverage` et `bridge-shape` dans le même état ; ne traite pas la cause (listes manuelles)                            | **Rejeté** — traite le symptôme                                                |
| **C. Compter manuellement et corriger les compteurs** (113 → 120, etc.)                                                 | Correctif immédiat, faible risque                                                                                                                                                       | Le problème se reproduit à chaque nouveau schéma ; aucune garantie de non-régression                                                                             | **Partiellement rejeté** — fait partie de W4 mais insuffisant seul             |
| **D. Auto-dérivation + exhaustivité + couverture de périmètre** (retenue)                                               | Rend chaque garde vérifiable par construction ; supprime la maintenance manuelle ; rend `test:coverage` franchissable ; fait entrer `mobile/`/`license-manager/`/`cloud/` sous contrôle | Migration de 5 gardes + une vague de tests nouveaux (W4) ; certaines gardes devront tolérer des « valeurs gelées » legitimately rheumatismes (snapshot IPC)      | **Retenu**                                                                     |

## Conséquences

- **Positives** :

  - Les règles AGENTS.md §3 (§2 de la présente) et §4 deviennent **vérifiables
    automatiquement** au lieu d'être des conventions.
  - `FROZEN_SCHEMA_COUNT` passe de 113 (figé, partiel) à **120** (valeur réelle,
    exhaustive) — un changement de contrat, tracé par ADR.
  - `RAW_GUARDED_CHANNELS` devient soit **effectif** (un test d'énumération
    vérifie que tout `ipcMain.handle` brut est listé), soit **supprimé** — plus
    jamais une liste morte qui prétend protéger.
  - `src/features/**` (93 % du code applicatif) entre dans le périmètre de
    couverture, avec un seuil explicite et un plan de montée progressive.
  - `mobile/`, `license-manager/` et `cloud/` entrent dans un périmètre
    vérifié (type-check / lint / scan), avec `typecheck:mobile` branché sur le
    CI.
  - La règle « aucune garde sans preuve qu'elle peut échouer » devient une
    **définition de fini** de la vague W4.

- **Négatives / risques** :

  - Un test d'inventaire auto-dérivé est **plus coûteux à écrire** qu'un
    inventaire figé (il faut un scanner de fichiers robuste) et **plus lent**
    (scan du dépôt) — d'où l'usage de scanners déjà écrits pour d'autres usages
    (`sql-guard`, `assertOrderClause`) plutôt que d'un nouveau moteur.
  - Passer de seuils souples à des seuils exacts peut faire **échouer la suite**
    sur des écarts historiques (§ I-01 : 18 dépassements). Ces écarts doivent
    être **corrigés ou explicitement exceptés avec raison**, jamais masqués.
  - L'exigence « exhaustivité » impose de **réviser** les 80 schémas Zod non
    classifiés dans `operation-id-coverage` : un travail de fond, pas un
    correctif ponctuel.
  - Le passage de `FROZEN_SCHEMA_COUNT` de 113 à 120 est un **changement de
    contrat gelé** : il doit être traité comme tel (ADR + mise à jour du
    compteur + ligne dans `handoff.md`, dans le **même** commit).

- **Contrats touchés (IPC / schéma / snapshots)** :
  - `tests/unit/validators-inventory.test.ts` : `FROZEN_SCHEMA_COUNT`
    **113 → 120** + ajout de `validators.staff.ts` à `MODULES`.
  - `tests/unit/operation-id-coverage.test.ts` : ajout d'une assertion de
    complément ; reclassement des 39 schémas exigeant `operationId` (21 déjà
    listés, 18 à ajouter) et des 20 exceptions LWW (inchangées).
  - `tests/unit/bridge-shape.test.ts` : passage de `/export const (\w+Schema)/g`
    à l'ensemble **des** exports Zod ; seuil `toBe(names.length)` ; exemptions
    nommées.
  - `tests/unit/ipc-channel-inventory.test.ts` : `SCANNED` devient une
    **découverte** de fichiers ; `PUSH_ONLY` complété (`ocr.progress`).
  - `electron/ipc/raw-guards.ts` : `RAW_GUARDED_CHANNELS` — branché sur un test
    d'énumération, ou supprimé (décision du propriétaire, Q9).
  - `vitest.config.ts` : `coverage.exclude` pour les fichiers de types seuls ;
    `include` étendu à `src/features/**` avec seuil dédié.
  - `package.json` : `typecheck:mobile` ; `test:coverage` et
    `verify:licensing` branchés sur `.github/workflows/ci.yml`.
  - `eslint.config.mjs` : la garde « pas d'arabe/€ dans `src/` » doit être
    réécrite avec un mécanisme **capable** d'exprimer la classe de caractères
    (p. ex. `Literal[value=/[^\x00-\x7F]/]` avec exception nommée pour
    `src/domain/ocr/numbers.ts`, ou un script `verify-fr-only.mjs`).
  - `knip.json` : `project` étendu à `license-manager/**` et `cloud/**`.
  - **Aucune migration SQL** n'est touchée par ce ADR (AGENTS.md §12).

## Vérification

- [ ] `npm run format:check` (0)
- [ ] `npm run typecheck` (0) · `typecheck:electron` (0) · `typecheck:manager` (0)
- [ ] `npm run typecheck:mobile` (0) — **nouveau**
- [ ] `npm run lint` (0)
- [ ] `npm test` (≥ 804/804, 121 fichiers)
- [ ] `npm run test:db` (0)
- [ ] `npm run test:coverage` (**EXIT 0**) — **nouveau** (la porte est
      aujourd'hui rouge : 18 dépassements)
- [ ] `npm run verify:migrations` (MIGRATIONS VERIFIED)
- [ ] `npm run verify:domain` (DOMAIN VERIFIED)
- [ ] `npm run verify:perf` (PERF VERIFIED)
- [ ] `npm run license:scan` (0)
- [ ] `npm run build && npm run build:electron` (✓ + manifeste signé)
- [ ] `npx knip` → `Unused files = 0` **et** `Unused exports = 0`
- [ ] Preuve de non-régression : injecter un schéma Zod **hors** `*Schema` et
      un canal brut **hors** `SCANNED` doit faire **échouer** `bridge-shape` et
      `ipc-channel-inventory` respectivement.

## Références

- `docs/reports/FULL_AUDIT_2026-10-19.md` §3.G-01..G-12, §3.G-13 (garde ESLint
  inerte), §3.I-01..I-05
- `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` §2 (W4), §8 (registre des
  contrats déverrouillables)
- `docs/ADR-075-dead-code-radical-cleanup.md` (audit d'abord, jamais de
  suppression automatique)
- `docs/ADR-118-dead-code-lot1.md`, `docs/ADR-119-dead-code-lot2.md`
- `docs/ADR-087-staff-full-matrix.md` (matrice d'autorisation complète)
- `AGENTS.md` §3 (canaux IPC + Zod), §4 (centimes + `operationId`), §12
  (migrations immuables)
- `tests/unit/validators-inventory.test.ts`,
  `tests/unit/operation-id-coverage.test.ts`, `tests/unit/bridge-shape.test.ts`,
  `tests/unit/ipc-channel-inventory.test.ts`, `electron/ipc/raw-guards.ts`,
  `eslint.config.mjs`, `vitest.config.ts`, `knip.json`
