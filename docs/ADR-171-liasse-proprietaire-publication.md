# ADR-171 — Liasse de supervision propriétaire : le POS la calcule et la publie

## Contexte

Constat n°1 de la demande du 2026-11-02 : « publieur de liasse inexistant —
l'application propriétaire est une couche d'affichage au-dessus d'un pipeline
vide » — vérifié, et c'était le premier constat de la liste
« niveau zéro / meilleur rendement ».

État mesuré avant code :

- `publishOwnerSnapshot` n'existait **que dans les documents**
  (`docs/ADR-162…:144`, `handoff.md`) : `grep publishOwnerSnapshot` dans
  `electron/` et `src/` renvoyait **zéro**.
- Le contrat, lui, est écrit et consommé : `owner/src/store.ts:269-289`
  (`OwnerSnapshot` v1, cinq blocs), `owner/src/api.ts:137-176` (lecture
  PostgREST `owner_snapshots?shop_key=eq.veloria&order=generated_at.desc&limit=1`)
  et le portique de forme `isSnapshotShape` (`owner/src/api.ts:179-192`).
  Neuf écrans (`Today`, `Money`, `CashAudit`, `Stock`, `ProductDetail`,
  `Periods`, `Alerts`, `DebtorDetail`, `TransactionDetail`) dépendent de cette
  liasse ; sans elle, l'application affiche « Aucune liasse de supervision
  publiée. »
- Le cloud était prêt depuis ADR-163 (`cloud/supabase/owner.sql`) mais **jamais
  appliqué** ; vérifié et appliqué dans cette session (voir « Validation ») :
  table + RLS + politique `owner_snapshots_read`, `anon` révoqué. Les inscriptions
  Supabase étaient **ouvertes** — fermées au passage, sinon n'importe quel
  compte `authenticated` aurait pu lire la liasse entière.
- ADR-170 avait, la session précédente, créé les sessions de caisse
  (`cash_sessions`, migration 0059) précisément parce que le bloc
  `money.audit`/`money.sessions` n'avait **aucune source** ; le publieur est le
  second maillon de la même chaîne.

Contrainte structurante : `sync_outbox.kind` est un CHECK **fermé et immuable**
(migration 0032, déclarée « SOURCE AUTORITAIRE », reflétée à l'identique dans
`cloud/supabase/schema.sql` et `electron/ipc/handlers/client-access.repo.ts:13-28`).
On ne peut pas y ajouter un kind `owner_snapshot` sans éditer une migration
appliquée (interdit, AGENTS §12) ou en reconstruire une nouvelle pour une file
dont la liasse n'a pas besoin (pas de retry par ligne : la liasse est
entièrement recalculée à chaque cycle).

## Décision

1. **Constructeur dédié, en lecture seule** : `electron/sync/owner-snapshot.ts`,
   `buildOwnerSnapshot(now)`. Il **réutilise** les repos de lecture du POS
   (`getDashboardSummary`, `listClosings`, `getCashAuditSummary`,
   `getActiveCashSession`, `listExpensesUnified`, requêtes stock/dettes) et
   n'ajoute que les lectures strictes qui n'existaient nulle part : créances par
   débiteur avec seaux d'ancienneté, `lateDays`, dernier versement, rotation
   30 jours par produit, autonomie et proposition de réappro, mouvements par
   produit, `deadCount`. **Aucune règle métier ne bouge** : pas de seconde
   formule de marge, de dette ou de journée — le découpage horaire passe par
   `business-day.ts` (ADR-169), les montants restent des centimes entiers.
2. **Publication directe, append-only** : `publishOwnerSnapshotAtomic`
   (`electron/sync/sync.service.ts`) poste `[{ shop_key: "veloria", payload,
generated_at }]` sur `POST /rest/v1/owner_snapshots` avec les en-têtes
   `service_role` **déjà** utilisés pour le miroir client (`apikey`,
   `Authorization: Bearer`, `Prefer: return=representation`). Pas d'`on_conflict` :
   la table n'a aucune contrainte d'unicité et « la plus récente gagne » est la
   règle de lecture de l'app. Rejouer le même `operationId` **n'insère pas** une
   seconde liasse (`claimIdempotency` + résultat mémorisé), mais deux publications
   légitimes à des moments différents créent bien deux lignes (historique).
3. **Portes lues sur le doc persisté** : miroir actif + URL + clé service, **et**
   `ownerEnabled`. L'ordre compte — la validation du registre refuse déjà
   « liasse activée sans miroir », mais un doc hérité/altéré (miroir coupé après
   l'activation) doit rester refusé à la publication, avec un message FR qui dit
   quoi réactiver. Le détail serveur (JSON/anglais) part au log ; seule une phrase
   FR est persistée dans `lastOwnerError` (règle 6).
4. **Cadence autonome, défaut OFF** : `ownerEnabled` (faux par défaut) et
   `ownerIntervalMinutes` (60, bornes 15-1440) vivent dans le même doc
   `client_sync` chiffré (DPAPI) ; `isOwnerPushDue` est évalué par le timer
   60 s existant, en best-effort (`void … .catch()`), donc la publication ne peut
   jamais bloquer ni la fermeture ni une vente. Le timer reste le seul horodatage
   « automatique » — aucune dépendance à une file.
5. **Bornes explicites, calculées sur le quota** (`cloud/supabase/limits.md` :
   5 Go de sortie/mois, projet mis en pause après 7 jours d'inactivité) :
   `MAX_STOCK_PRODUCTS = 120`, `MAX_MOVEMENTS_PER_PRODUCT = 8`,
   `MAX_JOURNAL_ROWS = 60`, `MAX_TX_LINES = 20`, `MAX_DEBTORS = 60`,
   `MAX_INVOICES_PER_DEBTOR = 10`, `MAX_CLOSED_SESSIONS = 60`,
   `MAX_EXPENSE_ROWS = 60`, `MAX_STOCK_ALERTS = 40`, `MAX_DEBT_ALERTS = 20`,
   et garde-fou `MAX_LIASSE_CHARS = 900_000` : au-delà, **refus FR** plutôt
   qu'une publication obèse. À 60 min de cadence ≈ 720 liasses/mois ≈ 0,6 Go
   au pire de la garde — sous le quota, avec marge. La poussée quotidienne sert
   aussi d'anti-pause au projet.
6. **Jamais de donnée inventée** : `day.objectiveMinor` est typé `null` (aucun
   objectif d'achat n'existe dans le schéma POS — l'ajouter relève d'une décision
   produit, pas d'un défaut de publication) ; `Debtor.manager` idem (aucun
   commercial par client) ; `StockAlert.lossPerDayMinor` est `null` hors critique
   à rotation connue ; `ticketsDelta` est calculé quand la veille est disponible,
   `null` sinon. Ce qui n'a pas de source reste `null` là où le contrat
   l'autorise, et l'app Owner affiche « — ».
7. **Dérivations documentées** (faute de colonne dédiée) : `segment` du débiteur
   = lecture du classement réel (plafond dépassé / en retard / simple), jamais un
   segment marketing inventé ; `unit.singular/pluriel` = libellés FR connus,
   repli sur le code unité puis « Unité » ; `movementKindFr` réduit les
   `movement_type` de la base aux 4 grains du contrat (ajustement/casse/inventaire
   → `inventaire`, annulation de vente → `retour`) ; `autonomyDays` borne
   l'infini (produit sans vente sur 30 j) à une valeur sentinelle documentée au
   lieu de renvoyer `Infinity` (non sérialisable en JSON strict).
8. **Surface d'IPC explicite** (règle 3) : un seul canal nouveau
   `sync.pushOwnerSnapshot` (mutation → `operationId` requis), mêmes gardes
   licence + staff que `sync.pushNow`, `preload` typé, façade renderer, et un
   schéma de réponse qui ne renvoie **que** `{ published, chars, generatedAt,
lastOwnerPushAt }` — jamais la liasse, jamais un secret.

## Alternatives rejetées

- **Un kind `owner_snapshot` dans `sync_outbox`** : interdit par le CHECK immuable
  de 0032 sans casser la chaîne d'empreintes/`verify-migrations`, et sans
  bénéfice — le retry par ligne n'a aucun sens pour un agrégat recalculé en
  entier à chaque cycle. Refusé.
- **Edge Function `owner-sync`** (le reflexe, déjà discuté en ADR-163) :
  superflu — la lecture est un `GET` PostgREST avec jeton Auth, l'écriture est
  faite par le POS en `service_role`. Une fonction de plus = un secret de plus,
  un déploiement de plus, zéro gain. Refusé.
- **Publier à chaque vente** (fraîcheur maximale) : multiplierait la sortie réseau
  et ferait payer l'effort au quota mensuel pour des écrans de supervision que le
  propriétaire consulte quelques fois par jour. Cadence bornée + bouton manuel.
- **Stocker la liasse dans SQLite** (cache « prêt à poster ») : deux sources de
  vérité pour des agrégats qui se recalculent en millisecondes, et un risque
  d'affichage périmé. Refusé.
- **Publier seulement le delta** : l'app Owner lit une liasse complète à chaque
  fois ; un delta exigerait une table d'état côté cloud et une logique de
  fusion dans l'APK — contre-productif à ce volume.

## Fichiers

- Constructeur : `electron/sync/owner-snapshot.ts` (contrat `OwnerSnapshot` v1
  **jumelé** sur `owner/src/store.ts` — le workspace `owner/` n'est pas
  importable depuis `electron/`, parité de forme prouvée par le test
  d'intégration).
- Protocole pur : `electron/sync/sync.protocol.ts` (`ownerEnabled`,
  `ownerIntervalMinutes`, `OWNER_INTERVAL_MIN/MAX`, `isOwnerPushDue`,
  `ownerSnapshotsUrl`, vue masquée étendue).
- Service : `electron/sync/sync.service.ts` (`SyncDoc` enrichi —
  `lastOwnerPushAt`/`lastOwnerError` — `publishOwnerSnapshotAtomic`, crochet du
  timer, portes sur doc persisté).
- IPC : `electron/ipc/channels.ts`, `validators.customers.ts`,
  `registry.customers.ts`, `license-gates.ts`, `staff-gates.ts`,
  `electron/preload/preload.ts`, `src/vite-env.d.ts`,
  `src/shared/types/{ipc-client,ipc-contracts}.ts`.
- UI : `src/features/settings/SettingsSectionsB.tsx` (groupe « Liasse de
  supervision (application propriétaire) » : interrupteur, cadence, dernière
  publication, erreur courante, « Publier maintenant ») + `types.ts` (mots-clés
  de recherche).
- Emulateur local : `scripts/e2e-mirror-relay.mjs` (`POST /rest/v1/owner_snapshots`
  append-only + `GET` d'assertion) pour prouver la boucle sans cloud.
- Tests : `tests/unit/owner-snapshot-protocol.test.ts` (12),
  `tests/unit/owner-snapshot-publish.test.ts` (7, premier usage réel du
  `Transport` injectable), `tests/integration/owner-snapshot.test.ts` (13, base
  migrée réelle, chiffres calculés à la main), plus les inventaires gelés
  (`ipc-channels.json`, schémas, exports, `operationId`).
- Cloud : `cloud/supabase/owner.sql` **appliqué** au projet `veloria-pos`
  (aucun fichier de schéma modifié) — voir Validation.

## Conséquences

- L'application Owner passe de « pipeline vide » à des données réelles dès
  qu'un marchand active le miroir, crée son compte propriétaire (ADR-164) et
  active la liasse. Rien n'est publié **sans** activation explicite (défaut OFF).
- `owner_snapshots` est **append-only sans rétention** : à 60 min de cadence,
  ~720 lignes/mois de ~1 Mo au pire de la garde. `cloud/supabase/limits.md`
  chiffre la base à 500 Mo en plan gratuit ⇒ **une purge est nécessaire avant
  d'augmenter la cadence ou le nombre de boutiques** (constat ouvert, à traiter
  côté cloud : suppression des lignes au-delà de N jours, ou bascule sur un seul
  slot `shop_key` updaté — ce qui casserait l'« historique » voulu par ADR-163).
- Le `security_invoker` de la vue `latest_client_payloads` a été réaligné sur le
  dépôt pendant l'application du cloud : le miroir client est désormais conforme
  à `cloud/supabase/schema.sql` (c'était une dérive silencieuse).
- La politique `owner_snapshots_read` donne `SELECT` à **tout** utilisateur
  `authenticated` : avec les inscriptions désormais fermées et un compte créé
  uniquement par le POS (Admin API), la surface est maîtrisée ; un durcissement
  par `auth.uid()` reste une décision à prendre (voir « Reste ouvert »).
- Coût de calcul côté POS : la liasse est lue en une salve de requêtes nées des
  mêmes chemins indexés que le tableau de bord (bornes `created_at >= ? AND < ?`) ;
  `verify:perf` reste vert.

## Validation

- `npm run check` **vert** : `format:check`, `eslint . --max-warnings 0`,
  `tsc -b`, `typecheck:electron`, `typecheck:manager`, `typecheck:mobile`,
  `typecheck:owner`.
- `npx vitest run` **180 fichiers / 1 274 tests, 0 échec** (dont les 32 tests de
  cette tranche : protocole 12, publication à transport injecté 7, liasse sur
  base migrée réelle 13).
- `npm run verify` **vert** (migrations 59, domaine, FR-only, encodage, perf,
  version, `secret-scan` 1 521 fichiers) · `npm run knip` **0**.
- Preuves de publication (test, sans cloud) : URL `…/rest/v1/owner_snapshots`,
  en-têtes `apikey` + `Bearer <service_role>`, corps `[{ shop_key, payload,
generated_at }]`, **rejouement du même `operationId` = une seule ligne**, refus
  FR sans requête quand la liasse est désactivée ou le miroir coupé/clé vidée,
  HTTP 500 ⇒ `lastOwnerError` en français (le détail serveur n'est **pas**
  persisté) et `lastOwnerPushAt` inchangé.
- Preuves de liasse (base réelle, chiffres calculés à la main) : vente à
  00:30 Africa/Algiers rattachée à sa journée (ADR-169), `basketMinor`, parts par
  moyen de paiement, `money.audit`/`money.sessions` alignés sur les sessions de
  caisse (ADR-170), seaux d'ancienneté d'une dette qui **somment** au reste dû,
  `lateDays`, `sold30`/`perDay`/`autonomyDays`/`suggestedRestock`, `periods.days`
  complété sans trou, cohérence `journal[].kind` ↔ `tx.kind`, taille sous la
  garde, et **déterminisme** (deux constructions au même `now` ⇒ même JSON).
- Cloud, sur `veloria-pos` (`ynktschorbwukxovjzcz`) : `owner.sql` exécuté
  (« Success. No rows returned »), puis vérification
  `relrowsecurity=true`, politique `owner_snapshots_read:SELECT:authenticated`,
  `anon` **sans aucun droit** (contrôlé par requête HTTP réelle :
  `42501 permission denied`), `client_payloads.kind` déjà conforme à la liste de
  0032 (avec `announcement`), vue `latest_client_payloads` avec
  `security_invoker=true`, fonction `client-sync` déployée (répond son erreur FR
  `AUTH_ERROR`), inscriptions verrouillées (`signup_disabled`), 1 compte Auth
  confirmé. `owner_snapshots` à 0 ligne **normalement** : aucun POS reconstruit
  n'a encore publié.
- **Non testé** : boucle réelle POS → cloud → APK (aucun poste marchand n'est
  couplé à ce projet depuis cet atelier ; le relais E2E émule la publication), et
  les suites `test:e2e` / `test:coverage` complètes, toujours reportées §94.

## Reste ouvert (décisions à valider)

1. Purge/rétention de `owner_snapshots` avant toute cadence < 60 min ou
   multi-boutiques.
2. Durcissement de la politique en `USING (auth.uid() = <compte propriétaire>)` :
   plus sûr, mais casse silencieux si le compte est recréé avec un autre
   identifiant.
3. `objectiveMinor` (objectif de vente du jour) et `Debtor.manager` : réclament
   une décision produit + une colonne, pas une publication.

## Statut

Accepté — 2026-11-02. Ferme le constat n°1 de la demande (« le publieur
n'existe pas ») et débloque l'application Owner telle que décidée en
ADR-162/163/164/170.
