# ADR-126 — Chemins chauds indexés, N+1 supprimés, bundle découpé (vague W8)

## Contexte

Vague **W8** du plan de remédiation (audit intégral 2026-10-19, §« vague
W8 ») : « 6 requêtes chaudes sans index + 4 N+1 + tempête de re-rendu ».

| #    | Constat                                                                                                      | Sévérité | Statut            |
| ---- | ------------------------------------------------------------------------------------------------------------ | -------- | ----------------- |
| F-06 | 6 requêtes chaudes sans index adapté (dettes ×2, stats dettes, recherche clients, tri stock, historique)     | P2       | **Corrigé**       |
| J-01 | N+1 : `consumptionsOfSale()` appelé **dans la boucle** des lignes de retour (1 requête par ligne)            | P2       | **Corrigé**       |
| J-01 | N+1 : l'import produits **re-préparait** 3 statements par ligne (better-sqlite3 ne cache pas les statements) | P2       | **Corrigé**       |
| J-04 | Bundle renderer : un seul chunk de 485 Ko, seuil d'alerte à 1 200 Ko (la dérive de taille était invisible)   | P3       | **Corrigé**       |
| J-05 | `substr(due_date,1,10)` / `substr(created_at,1,10)` : colonnes **non indexables** dans les filtres           | P2       | **Corrigé**       |
| J-08 | `useCountUp` déclenchait un `setState` à chaque frame rAF                                                    | Medium   | **Corrigé en W5** |

## Décision 1 — migration 0050 : les index des chemins chauds

`database/migrations/0050_perf_indexes.sql` (nouveau ; `0001..0049` restent
immuables, AGENTS.md §12) :

| Index                                                                                                                    | Chemin chaud servi                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `sales(is_cancelled, remaining_balance_minor)`                                                                           | branche clients de `debts.list` + `debts.stats`         |
| `suppliers(outstanding_balance_minor)`                                                                                   | branche fournisseurs + `debts.stats`                    |
| `customers(deleted_at, outstanding_balance_minor, settlement_day)`                                                       | règlement mensuel (échéances dépassées / proches)       |
| `stock_intakes(supplier_id, status)`                                                                                     | branche fournisseurs de `debts.list`                    |
| `sale_payments(created_at)`, `supplier_payments(created_at)`, `stock_intakes(created_at)`, `stock_movements(created_at)` | filtre par date de l'historique (UNION à 17 branches)   |
| `products(name COLLATE NOCASE)`                                                                                          | tri du stock (l'index BINARY forçait un tri en mémoire) |
| `customers(phone_digits)` + colonne générée `phone_digits`                                                               | unicité du téléphone + recherche                        |

### La colonne générée `phone_digits`

La recherche client appliquait **8 `REPLACE()`** à la colonne `phone` pour
chaque ligne lue (`0550 12 34 56` ⇒ `0550123456`). La normalisation est
désormais une **colonne générée VIRTUAL** (migration 0050) : elle est calculée
à l'**écriture** et non à chaque lecture, et elle est **indexée** ⇒ le
contrôle d'unicité (E-28) est une recherche indexée au lieu d'un parcours de
table. Sémantique identique : la chaîne de `REPLACE()` est la même que
celle de la migration 0049 (parité garantie par la migration et par le test
`tests/database/customers-phone-unique.test.ts`).

Limite assumée : la recherche par `LIKE '%…%'` reste non indexable (il faut un
index FTS pour cela) — le gain porte sur le CPU (plus de `REPLACE` par ligne)
et sur le contrôle d'unicité.

## Décision 2 — filtres d'historique et d'échéance désormais indexables

- `history-query.ts` : `substr(created_at,1,10) >= ?` → `created_at >= ?` avec
  une borne **horodatée** (`from + T00:00:00.000Z`), et borne haute
  **exclusive** (`(to + 1 jour) + T00:00:00.000Z`) ⇒ le jour `to` reste
  entièrement inclus (la borne `<=` sur la date tronquée l'excluait à tort
  pour les lignes horodatées de la journée). La sémantique est donc
  **préservée et corrigée**, et le filtre devient indexable.
- `finance.repo.ts` : `substr(due_date,1,10) = date('now')` →
  `due_date >= date('now') AND due_date < date('now','+1 day')` (index
  `idx_sales_due` désormais utilisé).

## Décision 3 — les N+1 supprimés

- `returns.repo.ts` : `consumptionsOfSale(originalSaleId)` était appelé
  **dans la boucle** des lignes de retour (une requête par ligne). La
  lecture est désormais **hoistée** avant la boucle (1 requête par retour).
- `import.repo.ts` : les statements (`SELECT id FROM product_barcodes …`,
  `INSERT INTO products …`, `INSERT INTO product_barcodes …`) étaient
  **re-préparés à chaque ligne** — `better-sqlite3` ne met **pas** les
  statements en cache : le SQL était recompilé 3 fois par ligne importée.
  Ils sont désormais préparés **une fois** hors boucle.

## Décision 4 — bundle renderer découpé et seuil honnête

`vite.config.ts` : `manualChunks` explicite (`react` / `vendor`) et
`chunkSizeWarningLimit` **1200 → 600 Ko** (le seuil précédent masquait la
dérive). Mesure : chunk principal **485 Ko → 376 Ko** + chunk vendor 114 Ko,
et le build échoue si un chunk dépasse 600 Ko (seuil d'avertissement
visible).

## Décision 5 — une porte qui vérifie les PLANS, pas l'existence des index

`tests/database/query-plans.test.ts` (nouveau) : pour chaque chemin chaud,
le test demande à SQLite le **plan d'exécution réel**
(`EXPLAIN QUERY PLAN`) et exige que l'index soit **UTILISÉ**
(`USING INDEX`) et que le nom attendu apparaisse. Un index créé mais jamais
choisi par le plan (ou une colonne redevenue non indexable) fait **échouer**
la porte — la mesure est donc dans le CI, pas dans un commentaire.

## Conséquences

- Les requêtes chaudes servies par index (mesuré par le plan SQLite).
- Deux N+1 supprimés (retours, import produits).
- Le filtre historique garde sa sémantique (jour `to` inclus) et devient
  indexable.
- Bundle renderer : chunk principal 376 Ko (+ vendor 114 Ko), seuil 600 Ko.
- **Migration 0050** (index + colonne générée VIRTUAL) : non destructive,
  aucune donnée réécrite, aucun recalcul. Point de retour arrière :
  `git revert` + (le cas échéant) `DROP INDEX`.
- Aucun changement de comportement métier : les bornes d'historique ont été
  ré-écrites pour préserver l'inclusion du jour `to` (cf. le test
  `tests/unit/history.test.ts`, mis à jour avec les valeurs attendues).

## Vérification

| Porte                                               | Valeur                   |
| --------------------------------------------------- | ------------------------ |
| `npm run test:coverage`                             | **EXIT 0**               |
| `npm test`                                          | 137 fichiers / 934 tests |
| `npm run test:db`                                   | 37 fichiers / 177 tests  |
| `npm run verify:migrations`                         | MIGRATIONS VERIFIED      |
| `npm run verify:perf`                               | PERF VERIFIED            |
| `npm run verify:domain`                             | DOMAIN VERIFIED          |
| `npm run lint` / `typecheck` / `typecheck:electron` | 0                        |
| `npm run build` + `build:electron`                  | ✓ (manifeste signé)      |

## Fichiers affectés

- `database/migrations/0050_perf_indexes.sql` (nouveau).
- `electron/ipc/handlers/customers.repo.ts` (colonne générée),
  `finance.repo.ts` (échéance indexable), `history-query.ts` (bornes
  horodatées), `returns.repo.ts` (N+1), `import.repo.ts` (statements hoistés).
- `vite.config.ts` (manualChunks + seuil).
- `tests/database/query-plans.test.ts` (nouveau), `tests/database/migrations.test.ts`
  (49 → 50), `tests/unit/history.test.ts` (bornes attendues).
