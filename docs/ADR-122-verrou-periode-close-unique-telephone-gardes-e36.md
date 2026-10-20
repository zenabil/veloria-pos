# ADR-122 — Verrou de période close (Z), unicité du téléphone client et gardes E-36

## Contexte

Vague **W3** du plan de remédiation de l'audit intégral du 2026-10-19
(`docs/reports/FULL_AUDIT_2026-10-19_PLAN.md`, §« vague W3 »). Elle porte sur
la **souche de vérité** : la base SQLite. Cinq constats y sont traités :

| #    | Constat                                                                                                                                                          | Sévérité    | Statut      |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------- |
| E-21 | `daily_closings` n'était qu'un ENREGISTREMENT : une journée close pouvait encore être écrite                                                                     | High        | **Corrigé** |
| E-28 | `customers.phone` sans contrainte d'unicité (0034 ne porte que sur `customer_access.phone_hash`)                                                                 | Medium-High | **Corrigé** |
| E-31 | `paginationSchema.page` sans borne ⇒ `OFFSET` illimité                                                                                                           | Medium      | **Corrigé** |
| E-36 | La couche de vérification ne contrôlait ni l'atomicité, ni la couverture `operationId`, ni la pureté de l'argent ; 0045→0047 n'étaient assumées par aucune porte | Medium-High | **Corrigé** |
| F-08 | La connexion secondaire (sonde de vérification d'une copie de base) tournait sans pragma                                                                         | P3          | **Corrigé** |

Deux **contrats gelés** sont modifiés (ADR-075 §3 impose un ADR) :

| Contrat                      | Avant | Après                           |
| ---------------------------- | ----- | ------------------------------- |
| Canaux IPC servis + snapshot | 176   | **177** (`closings.reopen`)     |
| `FROZEN_SCHEMA_COUNT`        | 113   | **114** (`closingReopenSchema`) |
| Nombre réel de schémas Zod   | 120   | **121**                         |
| Migrations                   | 47    | **49** (0048 + 0049)            |

## Décision 1 — E-21 : une journée close devient IMMUABLE (migration 0048)

### Principe

Le rapport Z est un **acte comptable** : une fois la journée clôturée, ses
nombres ne doivent plus bouger. Avant, n'importe quelle écriture datée du jour
clôturé (vente, encaissement, dépense, retour, paiement fournisseur) pouvait
passer : le tiroir physique et le rapport divergeaient **sans trace**.

La garantie est posée **dans la base** (15 triggers `RAISE(ABORT)`), pas dans
le code applicatif : une écriture qui contournerait le main (script de
maintenance, import, régression future) serait refusée quand même.

| Table               | INSERT | UPDATE (montants) | DELETE |
| ------------------- | ------ | ----------------- | ------ |
| `sales`             | refus  | refus             | refus  |
| `sale_payments`     | refus  | refus             | refus  |
| `expenses`          | refus  | refus             | refus  |
| `returns`           | refus  | refus             | refus  |
| `supplier_payments` | refus  | refus             | refus  |

La date d'activité est `substr(<date>, 1, 10)` (`created_at` pour `sales` et
`returns`, `payment_date` pour `sale_payments` et `supplier_payments`,
`expense_date` pour `expenses`) — même convention que les requêtes de clôture
existantes (`finance.repo.ts:222-254`), donc pas de décalage.

### Ce qui n'est PAS bloqué (décisions explicites)

- l'INSERT dans `daily_closings` (c'est la clôture elle-même) ;
- les écritures d'une **autre** journée ;
- les tables hors périmètre du rapport Z (stock, catalogue, paramètres) : elles
  ne figurent dans aucune colonne de la clôture ;
- **l'annulation d'une vente** n'a PAS d'exception : c'est une écriture
  financière, donc elle exige la réouverture. C'est le prix de la garantie
  (« le rapport Z ne bouge plus »), et c'est pourquoi la réouverture existe.

### La seule issue : `closings.reopen` (gérant, tracée, rejouable)

Verrouiller sans issue = impasse (une erreur de saisie du jour deviendrait
irréversible). Le chemin de sortie est **explicite** :

| Propriété        | Mise en œuvre                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autorisation     | session **OBLIGATOIRE** + rôle **gérant** (`getStaffRole`) ⇒ fail-closed sans session                                                                                        |
| Permission canal | `closings` (`staff-gates.ts`)                                                                                                                                                |
| Idempotence      | `operationId` **REQUIRED** (schéma Zod) + `claimIdempotency` ⇒ rejouer = effet unique                                                                                        |
| Traçabilité      | `audit_log` : `closing.reopened` avec les montants d'origine + l'auteur + l'horodatage                                                                                       |
| Effet            | la ligne de clôture est **supprimée** (les montants d'origine restent dans l'audit) ⇒ la journée redevient modifiable, puis peut être **re-clôturée** (la clôture recalcule) |
| UI               | bouton « Rouvrir la journée » (écran Rapports), affiché **aux seuls gérants**, avec confirmation explicite                                                                   |

Le message utilisateur est en français et actionnable :
« Journée déjà clôturée : réouverture requise pour la corriger. »
(`electron/ipc/ipc-errors.ts` — sans ce mapping, SQLite renvoie un code
`SQLITE_CONSTRAINT_TRIGGER` et l'opérateur aurait vu « Une erreur inattendue
est survenue »).

### Pourquoi supprimer la ligne plutôt que la garder

`daily_closings.business_date` est **UNIQUE** : on ne peut pas garder une
clôture « rouverte » et en créer une seconde pour la même date. Supprimer la
ligne (et journaliser ses montants) est la seule option qui préserve
l'unicité, permet la re-clôturation, et garde l'historique lisible.

## Décision 2 — E-28 : le téléphone client est unique (migration 0049)

### Pourquoi un TRIGGER et pas un index UNIQUE

1. un `CREATE UNIQUE INDEX` **échoue** si l'historique contient déjà des
   doublons ⇒ la migration ferait tomber l'application au démarrage sur une
   base client réelle (donnée non détruite = migrable) ;
2. un index UNIQUE interdirait aussi de réutiliser le numéro d'un client
   **archivé** (`deleted_at IS NOT NULL`) ;
3. un trigger n'interdit **que les nouvelles écritures** : aucune donnée
   existante n'est touchée, la migration est toujours applicable.

### Comparaison

Sur les **chiffres** (miroir exact de `PHONE_DIGITS_EXPR` dans
`customers.repo.ts` et de la migration 0049) : « 0550 12 34 56 » et
« 0550123456 » sont le même numéro. Les 8 séparateurs normalisés (espace,
tiret, point, slash, parenthèses, `+`, insécable) sont retirés. Un téléphone
vide est toléré.

La base est l'autorité **finale** ; l'application (`assertPhoneAvailable`)
donne un message FR clair **avant** l'écriture (création ET modification).

## Décision 3 — E-31 : `page` est borné

`paginationSchema.page` passe de `.min(1)` à `.min(1).max(10_000)`. Le
`OFFSET` maximal devient 2 000 000 lignes (10 000 × 200). Au-delà, l'appelant
doit filtrer (bornes de dates) ou cibler une recherche. Clé de pagination
(keyset) : **reportée** (refonte des 7 appels paginés, hors périmètre W3).

## Décision 4 — E-36 : les gardes deviennent ÉCHECABLES

ADR-120 : « les gardes qui ne peuvent pas échouer ne sont pas des gardes ».
Trois portes nouvelles, toutes non vacuouses :

| Porte                                       | Emplacement                              | Ce qu'elle vérifie                                                                                                                      |
| ------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:migrations` — blocs 0045/0046/0047  | `scripts/database/verify-migrations.mjs` | 0045 (colonne + CHECK + défaut), 0046 (`staff_user_id` sur **7/7** tables + FK `ON DELETE SET NULL`), 0047 (colonne + index + backfill) |
| `verify:migrations` — blocs 0048/0049       | idem                                     | 15 triggers de période, refus FR sur 3 types d'écriture, réouverture ; 2 triggers d'unicité téléphone, tolérance NULL/archivé           |
| `verify:migrations` — pureté de l'argent    | idem                                     | **toutes** les colonnes `*_minor` de **toutes** les tables sont `INTEGER` (jamais REAL/NUMERIC/TEXT)                                    |
| `verify:domain` — atomicité + `operationId` | `scripts/quality/verify-domain.ts`       | toute fonction de repo **appelée par un registre IPC** qui écrit : (a) est dans `db.transaction(...)`, (b) accepte un `operationId`     |

La porte `verify:domain` est **auto-vérifiée** : elle compte les mutations
analysées et **échoue si elle n'en analyse pas au moins 40** (une garde qui
scanne 0 fichier est vacuous). Mesure au 2026-10-20 : **59 mutations**.

Exception documentée : `staff.repo.ts::authenticateAtomic` (tentative
d'authentification) écrit **une instruction SQL atomique par branche**
(compteur anti-brute-force / remise à zéro) et n'a pas d'`operationId` —
rejouer une authentification n'a pas de sens et le compteur d'échecs DOIT
parfois s'incrémenter.

## Décision 5 — F-08 : la sonde de vérification a des pragmas

`verifyDbFileCopy` ouvrait la copie candidate sans **aucun** pragma :
`busy_timeout` absent (⇒ `database is locked` aléatoire pendant une copie),
`foreign_keys` absent (le `foreign_key_check` perdait son cadre), et aucune
garantie de lecture seule. Correction : `busy_timeout = 10000`,
`foreign_keys = ON`, `query_only = ON`, `trusted_schema = OFF` (best effort).
`journal_mode`/`synchronous` ne sont **pas** ré-appliqués : en lecture seule
les écrire échoue, et le fichier candidat ne doit jamais être modifié.

## Conséquences

- **Comportement visible** : après une clôture Z, toute écriture sur cette
  journée est refusée (message FR). Pour corriger, le gérant rouvre la
  journée (bouton dédié, confirmation) puis la re-clôture.
- **Contrats gelés** : 176 → 177 canaux servis (snapshot mis à jour),
  `FROZEN_SCHEMA_COUNT` 113 → 114 (le vrai total passe de 120 à 121).
  La cible de la vague W4 (`validators.staff.ts` ⇒ 120) devient donc **121**.
- **Migrations** : 47 → 49. `0001..0047` restent **IMMUABLES** (AGENTS §12) ;
  0048/0049 sont **nouveaux** et non destructifs (triggers uniquement, aucun
  recalcul, aucune suppression, aucune modification de donnée existante).
- **Garde d'organisation** : l'arête inter-features `reports>staff` est
  ajoutée à la liste blanche du test A3 (`staff` est une feuille : arête
  unidirectionnelle, zéro cycle possible).
- **Point de retour arrière** : `git revert` du commit (aucune donnée
  touchée). Sur une base déjà migrée, 0048/0049 peuvent être « désappliquées »
  en supprimant les triggers (`DROP TRIGGER`) — jamais en éditant le fichier.

## Non traité (reporté, décisions en attente)

| #    | Sujet                                                         | Décision                                                                                                                       |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Q6   | avoir en cours (E-23) ⇒ migration 0050                        | **(a) refus FR** : pas de migration 0050 en W3                                                                                 |
| Q7   | source de vérité de la dette (E-24)                           | reporté                                                                                                                        |
| Q8   | `app_meta` + colonnes orphelines + `bread_orders` (G-22/G-23) | **(a) on conserve** — aucun DROP (SQLite : opération risquée) ; documenté ici                                                  |
| E-35 | fuseau du « jour métier » (UTC vs `Africa/Algiers`)           | **(a) `Africa/Algiers`** — décision de la vague suivante ; le verrou 0048 utilise la convention existante (`substr(...,1,10)`) |

## Vérification

Toutes les portes vertes (AGENTS.md §8), arbre sale (chantier impression
intact, non commité) :

| Porte                               | Avant                    | Après                                                          |
| ----------------------------------- | ------------------------ | -------------------------------------------------------------- |
| `npm run format:check`              | 0                        | **0**                                                          |
| `npm run typecheck` (`tsc -b`)      | 0                        | **0**                                                          |
| `npm run typecheck:electron`        | 0                        | **0**                                                          |
| `npm run typecheck:manager`         | 0                        | **0**                                                          |
| `npm run lint` (`--max-warnings 0`) | 0                        | **0** (exit 0)                                                 |
| `npm test`                          | 130 fichiers / 857 tests | **130 fichiers / 857 tests** (+3 fichiers, +17 tests)          |
| `npm run test:db`                   | 36 fichiers / 162 tests  | **36 fichiers / 162 tests**                                    |
| `npm run verify:migrations`         | VERIFIED                 | **MIGRATIONS VERIFIED** (blocs 0045→0049 + pureté de l'argent) |
| `npm run verify:domain`             | VERIFIED                 | **DOMAIN VERIFIED** (3 gardes E-36)                            |
| `npm run verify:perf`               | VERIFIED                 | **VERIFIED**                                                   |
| `npm run license:scan`              | 0                        | **0** (1343 fichiers)                                          |
| `npm run build` + `build:electron`  | ✓                        | **✓** (manifeste signé, 217 fichiers)                          |

Nouveaux tests :

- `tests/database/closing-period-lock.test.ts` (6) — 15 triggers, refus
  INSERT/UPDATE sur 5 tables, autres journées ouvertes, réouverture.
- `tests/database/customers-phone-unique.test.ts` (6) — doublon refusé (FR),
  NULL toléré, archivé toléré, UPDATE vers un numéro pris refusé.
- `tests/integration/closing-reopen.test.ts` (5) — refus sans session, refus
  utilisateur simple, réouverture + audit, rejouement idempotent, date sans
  clôture.

## Fichiers affectés

- **Migrations (nouvelles)** : `database/migrations/0048_closing_period_lock.sql`,
  `database/migrations/0049_customers_phone_unique.sql`.
- **Main** : `electron/ipc/handlers/finance.repo.ts` (réouverture),
  `electron/ipc/handlers/customers.repo.ts` (unicité téléphone),
  `electron/ipc/validators.common.ts` (borne `page`),
  `electron/ipc/validators.finance.ts` (`closingReopenSchema`),
  `electron/ipc/channels.ts` (`closings.reopen`),
  `electron/ipc/registry.finance.ts` (handler), `electron/ipc/staff-gates.ts`
  (permission), `electron/ipc/ipc-errors.ts` (messages FR des triggers),
  `electron/database/sqlite.service.ts` (pragmas de la sonde),
  `electron/preload/preload.ts` (pont).
- **Renderer** : `src/shared/types/ipc-client.ts`,
  `src/features/reports/ReportsScreen.tsx` (bouton « Rouvrir »),
  `src/vite-env.d.ts` (type du pont).
- **Portes** : `scripts/database/verify-migrations.mjs`,
  `scripts/quality/verify-domain.ts`.
- **Tests** : 3 nouveaux fichiers + `tests/database/migrations.test.ts`
  (47 → 49), `tests/unit/validators-inventory.test.ts` (113 → 114),
  `tests/unit/a3-organisation.test.ts` (arête `reports>staff`),
  `tests/unit/__snapshots__/ipc-channels.json` (+1 canal).
