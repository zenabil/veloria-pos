# ADR-169 — Jour métier Africa/Algiers (E-35) : une seule frontière de journée pour tout Veloria

## Contexte

Demande opérateur : « اصلح التالي جذريا » — la liste des constats incluait
E-35, ouvert depuis la session 37 et re-listé « non corrigé » à chaque audit :
**tous les découpages de journée se faisaient en UTC alors que le magasin est à
UTC+1**.

Deux faits techniques commandent la décision :

- Le stockage est correct : chaque `created_at` est un **instant** ISO UTC avec
  suffixe `Z` (`new Date().toISOString()`, 92 points d'émission dans
  `electron/ipc/registry.*.ts`). Aucune conversion n'est nécessaire en écriture.
- Le découpage, lui, était UTC : 37 `substr(<colonne>, 1, 10)` dans
  `electron/ipc/handlers/`, 13 `date('now')`, et les bornes
  `${from}T00:00:00.000Z` de `electron/ipc/handlers/history-query.ts`.
  Conséquences mesurées :
  1. la journée commence à **01:00 heure d'Alger** — une vente de 00:30 est
     comptée la veille, et le rapport Z d'hier devient faux après coup ;
  2. le **verrou de période close** (migrations 0048 et 0051, 15 triggers)
     compare `substr(created_at,1,10)` à `daily_closings.business_date` : la
     vente de 00:30 du jour clôturé passait la garde (E-21 non couvert sur ce
     créneau) ;
  3. **G-18** (audit 2026-10-19, High/P1, PROUVÉ) : trois conventions
     d'affichage coexistaient — `Intl` sans `timeZone` (donc l'heure de
     l'ordinateur) dans `src/shared/formatters/format.ts`, `iso.slice(0, 10)`
     (UTC) dans `mobile/src/format.ts`, getters locaux dans
     `owner/src/format.ts`, et troncature UTC brute dans
     `src/features/history/types.ts`. La même vente portait deux dates
     différentes sur le ticket de caisse et dans l'APK du client.

La décision produit était déjà prise, jamais appliquée : `Q17` du plan
d'audit (`docs/reports/FULL_AUDIT_2026-10-19_PLAN.md:531`) tranche « **(a) le
jour métier = Africa/Algiers** », justifié par la zakat ; `ADR-122:176` reporte
explicitement ce choix à « la vague suivante » en notant que le verrou 0048
reste sur `substr(...,1,10)`. Cet ADR exécute la vague.

## Décision

1. **Le stockage ne change pas.** Les instants restent ISO UTC `…Z`. Aucun
   backfill, aucune migration de données, aucun `utc_offset` par ligne : une
   seule horloge en base, un seul fuseau d'interprétation au-dessus.
2. **Une seule définition du jour métier**, en code et non en commentaire :
   `src/domain/common/business-day.ts` (pur, sans framework) et son jumeau
   `electron/shared/business-day.ts` (frontière `rootDir`, même algorithme)
   exposent `businessDayOf`, `todayBusinessDate`, `businessMonthOf`,
   `businessTimeOf`, `businessWallClock`, `addCalendarDays`,
   `businessMonthStart`, `businessDayRangeUtc`, plus les fragments SQL
   `businessDaySql` / `businessWeekSql` / `businessMonthSql` /
   `sqlBusinessToday` / `businessDaysAgoSql` / `calendarDaySql` /
   `calendarWeekSql` / `SQL_BUSINESS_DATE_PREFIX` et
   `formatBusinessDateTimeFr`.
   `todayUtcDate` et `monthStartUtc` sont **supprimés** (aucun alias de
   compatibilité) : le code qui reste parle « jour métier ».
3. **Africa/Algiers = UTC+1 fixe.** L'Algérie n'applique pas d'heure d'été,
   donc le décalage est une constante (`BUSINESS_DAY_OFFSET_MS = 3 600 000`) et
   l'équivalent SQL un modificateur unique et vérifiable :
   `date(col, '+1 hour')`. Pas d'`Intl`, pas de ICU côté Hermes, pas de
   dépendance à l'horloge de l'ordinateur ou du téléphone.
4. **Deux sortes de colonnes, deux traitements, écrits noir sur blanc.**
   - colonnes d'**instant** (`created_at`, `updated_at`, `closed_at`,
     `sent_at`, `expires_at`) → `businessDaySql(col)` ou des bornes
     `businessDayRangeUtc(jour)` ;
   - colonnes **date-seule** (`business_date`, `payment_date`, `expense_date`,
     `due_date`, `invoice_date`) → `calendarDaySql(col)`, jamais décalées :
     elles portent déjà une date métier.
     Une troisième variable (`businessDayRangeUtc`) fournit les bornes `[from,
toExclusive)` UTC d'une journée, donc les filtres restent comparables à un
     index sur `created_at` — la performance W8 (F-06) n'est pas perdue.
5. **Le verrou de clôture suit la même frontière** : migration **0058** qui
   `DROP`+`CREATE` les six triggers d'instant de 0048/0051 (`sales`, `returns`)
   avec `date(NEW.created_at, '+1 hour')`. Les neuf triggers date-seule ne
   bougent pas. 0048/0051 restent immuables (AGENTS §12).
6. **L'affichage est calé sur le magasin** : `Intl.DateTimeFormat` du POS
   reçoivent `timeZone: "Africa/Algiers"` (dont l'horloge du bandeau
   `TopBar`), le `splitDateTime` de l'Historique rend le jour et l'heure
   d'Alger, les `toLocaleString("fr-FR")` des tickets sont épinglés, et
   l'éditeur d'annonce (`datetime-local`) lit/écrit l'heure murale d'Alger
   (`businessWallClock` + suffixe `+01:00`) au lieu de celle du poste.
7. **Les deux APK adoptent la même convention** : `mobile/src/format.ts` et
   `owner/src/format.ts` exportent un `businessDay(iso)` arithmétique
   (Hermes-safe) et n'affichent plus jamais une tranche UTC à côté d'une heure
   locale. `owner` conserve `parseInstant` pour les durées (fraîcheur de
   synchronisation) et `parseIso` (décalée) pour l'affichage.
8. **Garde automatique, sinon la dérive revient.** `tests/unit/business-day.test.ts`
   interdit dans `electron/` et `src/` : tout `substr(<colonne d'instant>,1,10)`,
   tout `date('now'` hors du module métier, toute troncature
   `toISOString().slice(0, 10|7)`, et toute référence à `todayUtcDate` /
   `monthStartUtc`. Il prouve aussi la **parité JS ↔ SQL** (le bucket SQLite
   rend exactement `businessDayOf`) et la **parité POS ↔ APK client ↔ APK
   owner** sur les mêmes instants.

## Alternatives rejetées

- **Convertir le stockage en heure locale (+01:00 dans SQLite).** Casserait
  les instants, les bornes de rétention, l'anti-rollback du licence-anchor,
  les clés d'idempotence et l'horodatage des miroirs ; imposerait une migration
  de données sur toutes les bases client. Rejeté.
- **Un « jour métier » réglable dans Paramètres.** Le produit a une seule
  géographie (Algérie, DZD, français/arabe). Une option de plus = une surface
  d'erreur pour les totaux, sans bénéfice. Rejeté ; la constante est unique et
  nommée, un changement de besoin passerait par un nouvel ADR.
- **Réécrire les 37 `substr` en plages d'index.** Fait là où c'était gratuit
  (clôture Z, filtres d'historique) mais pas partout : `GROUP BY` une série
  journalière a besoin d'une **expression**, pas d'une plage. Rejeté en
  bloc ; la performance réelle est couverte par `verify:perf`.
- **`Intl` avec `timeZone` dans l'APK.** Hermes n'expose pas `Intl` complet
  selon la plateforme ; l'arithmétique fixe est déterministe et testée. Rejeté.

## Fichiers

- Nouveau : `src/domain/common/business-day.ts`, `electron/shared/business-day.ts`,
  `database/migrations/0058_business_day_closing_lock.sql`,
  `tests/unit/business-day.test.ts`, `tests/integration/business-day-reports.test.ts`
- Modifiés (extrait) : `electron/ipc/handlers/{finance,dashboard,history-query,history,expenses,customers,inventory,proformas,returns,client-access,sales,purchases,proformas,fifo,debt-status}.repo.ts`,
  `electron/sync/sync.service.ts`, `electron/services/logger.ts`,
  `electron/printing/**`, `electron/ipc/registry.customers.ts`,
  `src/shared/{dates/dates.ts,formatters/format.ts,documents/sale-ticket.ts}`,
  `src/app/shell/TopBar.tsx`, `src/features/{reports,dashboard,history,stock,zakat,settings,sales,customers,debts,expenses,proformas,products,returns,suppliers,users}/**`,
  `mobile/src/format.ts`, `owner/src/format.ts`,
  `scripts/database/verify-migrations.mjs`, `tests/database/{migrations,closing-period-lock}.test.ts`,
  `tests/unit/{history,stock,reports}.test.ts`

## Conséquences et risques

- **Un jour déjà clôturé peut voir son périmètre changer** : la vente de 00:30
  algérienne du 2 septembre appartenait jusqu'ici à la journée clôturée du 1er.
  Après mise à jour, elle relève du 2. C'est le **bon** comportement (le Z du
  1er avait été signé sans elle), mais un commerçant qui re-clôture peut
  constater un écart d'une heure de chiffre d'affaires, dans le sens réel.
  Les clôtures passées ne sont pas recalculées (aucune donnée modifiée).
- Les rapports d'un poste dont l'horloge est mal réglée restent justes : seul
  le fuseau du magasin compte, plus l'heure de l'ordinateur.
- `date(...,'+1 hour')` sur une colonne d'instant n'est pas indexable — comme
  `substr` avant lui ; les **filtres** utilisent les bornes UTC, seuls les
  `GROUP BY`/comparaisons de buckets utilisent l'expression.
- Les libellés existants (billets, exports CSV, noms de fichiers de sauvegarde)
  prennent le jour métier : un CSV exporté à 00:30 sera nommé du jour nouveau.

## Validation

- `npm run check` (format, lint `--max-warnings 0`, typecheck root/electron/manager/mobile/owner) : **vert**.
- `npm test` : **175 fichiers / 1 223 tests**, 0 échec.
- `npm run verify:migrations` : **vert**, porte `OK 0058 verrou de clôture sur le jour métier Africa/Algiers`.
- `npm run verify` (domaine, FR, encodage, perf, version, secret-scan) : **vert**.
- `npm run knip` : **vert**.
- Nouveaux tests dédiés : parité jumeaux + parité JS↔SQL + parité POS/APK
  (G-18) + garde de source (`tests/unit/business-day.test.ts`, 18 tests) ;
  agrégats frontière 00:30 sur base migrée réelle — dashboard, rapports,
  clôture Z, historique, trigger 0058
  (`tests/integration/business-day-reports.test.ts`, 6 tests) ;
  `tests/database/closing-period-lock.test.ts` étendu de 5 cas frontière.
- **Non testé** : rendu sur un vrai téléphone réglé hors UTC+1 (aucun appareil
  connecté) ; les E2E complets (`npm run test:e2e`) et `test:coverage`, non
  relancés dans cette session.

## Statut

Accepté — 2026-11-02. Ferme **E-35** et **G-18**, et applique la décision
**Q17** du plan d'audit ainsi que le report acté en `ADR-122:176`.
