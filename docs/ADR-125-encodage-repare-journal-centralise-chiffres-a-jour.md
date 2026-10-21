# ADR-125 — Encodage réparé, porte U+FFFD, journal centralisé et chiffres à jour (vague W9)

## Contexte

Vague **W9** du plan de remédiation (audit intégral 2026-10-19, §« vague
W9 ») : « corriger tout chiffre obsolète + réparer le corruption d'encodage +
documenter le gouffre ».

| #    | Constat                                                                              | Sévérité | Statut                             |
| ---- | ------------------------------------------------------------------------------------ | -------- | ---------------------------------- |
| O-01 | **113 caractères U+FFFD** (REMPLACEMENT CHARACTER) dans 20 fichiers `electron/ipc/*` | P2       | **Corrigé**                        |
| O-04 | 11 `console.*` en `electron/` (le journal du projet est `log()`)                     | P3       | **Corrigé**                        |
| N-02 | `docs/STRUCTURE.md` : « 0001..0036 », « 001→058 » (périmés)                          | P3       | **Corrigé**                        |
| N-03 | `handoff.md` : chiffres périmés (tests, migrations, ADR)                             | P3       | **Corrigé**                        |
| N-04 | `docs/reports/FULL_PROJECT_QA_AUDIT.md` : « 21 migrations »                          | P3       | **Corrigé (mention d'historique)** |
| M-03 | `scripts/maintenance/elevated-step*.ps1` : chemin ABSOLU du poste                    | P3       | **Corrigé**                        |
| M-04 | `scripts/maintenance/brand-veloria-*.jpg` (assets marketing dans `scripts/`)         | P3       | **Déplacé**                        |

## Décision 1 — O-01 : les 113 caractères corrompus sont restaurés

Le symptôme : des commentaires français illisibles dans 20 fichiers
`electron/ipc/*` (ex. `rootDir) U+FFFD?" même règle calendaire.`). Aucun effet
runtime (commentaires), mais la documentation du code — la partie qui sert à
comprendre les règles métier — était perdue.

### Diagnostic

Chaque caractère UTF-8 sur 3 octets avait été remplacé par une séquence
`[U+FFFD, "?", X]` (X = le dernier octet décodé en CP1252, ou U+FFFD quand
il n'existe pas). La séquence **ne contient plus l'octet du milieu** : deux
caractères distincts (« — » E2 80 94 et « → » E2 86 92) donnent la même
signature pour le milieu, et « — » peut rendre `[U+FFFD, "?", '"']` ou
`[U+FFFD, "?", U+FFFD]` selon le caractère suivant. La restauration **ne
pouvait donc pas être automatique** : elle a été faite **par contexte**, à
partir des occurrences relevées (121) et de la grammaire du domaine.

| Séquence relevée              | Caractère d'origine  | Exemple restauré                                  |
| ----------------------------- | -------------------- | ------------------------------------------------- |
| `U+FFFD ? "`                  | — (tiret cadratin)   | `rootDir) — même règle calendaire.`               |
| `U+FFFD + ? + "'"`            | → (flèche)           | `draft → ordered → partially_received → received` |
| `U+FFFD + ? + U+FFFD`         | ≤ ≥ » (selon le cas) | `quantités ≥ 0`, `≤ 1M`, `« fetch failed »`       |
| `U+FFFD + ^ + "'"`            | − (signe moins)      | `(original − final) − qty`                        |
| `U+FFFD + tiret`              | × (multiplier)       | `prix×qté`                                        |
| `U+FFFD + ? + <lettre>`       | É (majuscule)        | `Écraser`, `FACTURÉS`, `LITTÉRALE`, `étiquettes`  |
| `U+FFFD + ? + <fin de ligne>` | ≠                    | `(total ≠ subtotal-remise+livraison…`             |

Règle de parité : toute formule du domaine (`prix×qté`, `Σ lignes`,
`original ≥ 0`) a été recoupée avec sa source non corrompue
(`src/domain/sales/sale-rules.ts`, `src/domain/suppliers/po-rules.ts`,
`tests/unit/a1-p0-boundary.test.ts`) avant validation.

**Résultat : 0 caractère U+FFFD** dans tout le dépôt, sauf
`docs/reports/FULL_AUDIT_2026-10-19.md` qui **cite** les séquences
corrompues (preuve du constat O-01) — exclusion documentée.

## Décision 2 — une porte qui empêche le retour du corruption

`scripts/quality/verify-encoding.mjs` (`npm run verify:encoding`, branchée
dans le CI) scanne 853 fichiers (code + docs + SQL + scripts PowerShell) et
**échoue** si un U+FFFD réapparaît. La liste d'exclusion est explicite et
commentée (une seule : le rapport d'audit qui documente le constat).

Rappel de la règle qui a produit la corruption : **ne jamais écrire un
fichier texte via `Set-Content` / un pipeline PowerShell** (double
encodage) — utiliser l'outil d'édition ou un script Node en UTF-8.

## Décision 3 — O-04 : `console.*` → `log(...)`

`electron/` Bartonne 11 appels `console.warn` / `console.error` hors du
logger lui-même : les traces partaient à la console **sans** passer par le
journal fichier (ni le format JSON, ni la rotation, ni le niveau). Tous
passent désormais par `log(niveau, composant, évènement, données)` :

| Fichier                                      | Évènements                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `electron/main/window-manager.ts`            | `main.loadURL_failed`, `main.loadFile_failed`, `recovery.loadURL_failed`, `license.loadURL_failed` (FATAL) |
| `electron/main/main.ts`                      | `startup.rejected`, `unhandled_rejection` (FATAL)                                                          |
| `electron/database/database-path.service.ts` | `path.config_unreadable` (WARN)                                                                            |
| `electron/ipc/handlers/idempotency.ts`       | `result.corrupted`, `peek.failed` (WARN)                                                                   |
| `electron/ipc/handlers/inventory.repo.ts`    | `fast_lookup_failed` (WARN)                                                                                |
| `electron/ipc/handlers/sales.repo.ts`        | `operation_race_replayed`, `invoice_race_retry` (WARN)                                                     |
| `electron/ipc/handlers/settings.repo.ts`     | `row.corrupted` (WARN)                                                                                     |

## Décision 4 — chiffres à jour, historique préservé

- `docs/STRUCTURE.md` (carte **vivante**) : `0001..0036` → `0001..0049`,
  `001→058` → `001→125`, `0001..0034 rejouées` → `0001..0049 rejouées`,
  et les portes de vérification complètes (`verify:fr`, `verify:encoding`,
  `test:coverage:features`).
- `docs/reports/FULL_PROJECT_QA_AUDIT.md` (rapport **daté**) : ajout d'un
  encadré « chiffres historiques » qui renvoie vers `handoff.md` §1 et
  `docs/STRUCTURE.md`. **Le rapport n'est pas réécrit** : un rapport daté
  reste la trace de ce qu'il a mesuré (falsifier un audit passé serait
  pire que de le dater).
- `handoff.md` : chiffres rafraîchis (section 1 + section de session).

## Décision 5 — M-03 / M-04 : scripts de maintenance portables

- `scripts/maintenance/elevated-step{1..8}.ps1` : le chemin **absolu** du
  poste (`C:\Users\<moi>\Desktop\Veloria POS dev zenagui bilal\...`) est
  remplacé par un chemin relatif au script :
  `Join-Path (Split-Path -Parent $PSScriptRoot) '..\docs\reports\maintenance\<fichier>.log'`.
  Le dépôt est désormais déplaçable.
- `scripts/maintenance/brand-veloria-*.jpg` (assets marketing, 745 Ko)
  déplacés dans `docs/archive/brand/` — `scripts/` ne contient plus que des
  scripts.

## Conséquences

- **0 caractère U+FFFD** dans le dépôt (hors la preuve historique), et une
  porte qui le garantit.
- Les 20 fichiers `electron/ipc/*` sont relisibles (règles métier
  documentées : bornes, parenthèses, formules).
- Toutes les traces techniques de `electron/` passent par le journal unique
  (fichier + console, format JSON, rotation).
- Le dépôt est portable (plus de chemin absolu) et `scripts/` est propre.
- Aucun changement de comportement métier, aucune migration, aucun changement
  de contrat.

## Vérification

| Porte                                      | Valeur                          |
| ------------------------------------------ | ------------------------------- |
| `npm run verify:encoding`                  | **OK** (853 fichiers, 0 U+FFFD) |
| `npm run lint`                             | exit 0                          |
| `npm run typecheck` / `typecheck:electron` | 0                               |
| `npm test`                                 | 136 fichiers / 926 tests        |
| `npm run format:check`                     | 0                               |
| `npm run build` + `build:electron`         | ✓                               |

## Fichiers affectés

- `electron/ipc/**` (20 fichiers) : caractères FR restaurés.
- `electron/main/{main,window-manager}.ts`, `electron/database/database-path.service.ts`,
  `electron/ipc/handlers/{idempotency,inventory.repo,sales.repo,settings.repo}.ts` :
  `console.*` → `log(...)`.
- `scripts/quality/verify-encoding.mjs` (nouveau), `package.json`, CI.
- `eslint.config.mjs` : les 2 nouveaux fichiers hors tsconfig entrent dans
  `allowDefaultProject` (sinon ESLint refuse de les parser).
- `docs/STRUCTURE.md`, `docs/reports/FULL_PROJECT_QA_AUDIT.md`,
  `scripts/maintenance/elevated-step*.ps1`, `docs/archive/brand/*.jpg`.
