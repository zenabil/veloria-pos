# ADR-170 — Sessions de caisse : le poste, le comptage physique et l'écart (migration 0059)

## Contexte

Demande opérateur : « اصلح التالي جذريا و اكمل هاته المزايا », premier constat —
**le publieur de liasse propriétaire n'existe pas**. L'application Owner
(`owner/`) est une couche d'affichage au-dessus d'un pipeline vide :
`owner/src/store.ts:269-289` décrit un `OwnerSnapshot` dont le bloc
`money.audit` + `money.activeSession` + `money.sessions` exige des **sessions de
caisse** (poste, ouverture, comptage, écart, conformité) — et rien, dans tout le
POS, ne pouvait les produire.

État mesuré avant code :

- Une seule granularité temporelle d'argent existait : `daily_closings`
  (migration 0001), **une ligne par `business_date`**, sans poste, sans
  opérateur, sans comptage physique. `closing_balance_minor` est un solde
  **calculé**, jamais confronté à un tiroir réel.
- `grep cash_session|CashSession|counted_minor|variance_minor` dans `electron/` :
  **zéro**. Aucun tableau, aucune colonne, aucun canal. L'écran
  `owner/src/screens/CashAudit.tsx` consommait donc des chiffres que personne ne
  produisait.
- Un commerce réel tient **plusieurs tiroirs** (2 caisses, 2 opérateurs) et
  **compte** en cours et en fin de service. Sans cette notion, l'écart
  (fonctionnaire de contrôle le plus basique du gérant) était indéfinissable :
  une clôture de journée ne dit pas ce qu'il y avait dans **le** tiroir.

Question produit posée en début de session : construire de vraies sessions de
caisse, ou fabriquer le bloc audit à partir de `daily_closings`. **Décision
opérateur : de vraies sessions de caisse** (« مزايا صندوق فعلية »), pas une
projection trompeuse d'un agrégat de journée.

## Décision

1. **Nouvelle table `cash_sessions`** (migration **0059**, purement additive) :
   une ligne = une session d'un poste.
   `uuid`, `post` (1-40), `label` (1-60), `staff_user_id` (NULL toléré :
   l'auteur n'est jamais inventé), `status ∈ {open, closed}`,
   `opening_float_minor`, `counted_minor`, `expected_minor`, `note`,
   `opened_at`, `closed_at`, `created_at`, `updated_at`.
2. **Le poste est l'unité de concurrence.** Index partiel UNIQUE
   `ON cash_sessions (post) WHERE status = 'open'` : la **base** refuse deux
   sessions ouvertes sur le même poste (message FR remonte le refus), pas l'UI.
   Deux postes différents restent ouvrables en parallèle (`activeRegisters` de
   l'Owner a un sens).
3. **L'attente est figée à la fermeture, jamais avant.** Une session ouverte
   calcule son `expected_minor` **en direct** sur sa fenêtre d'instants ; à la
   fermeture la valeur est écrite et devient immuable (`WHERE id = ? AND
status = 'open'`). C'est ce qui rend l'écart opposable après coup : un
   historique qui se recalcule n'est pas une trace.
4. **L'écart n'est jamais stocké** : `variance = counted − expected`, dérivé à la
   lecture (domaine ET repo), signé (un manque reste négatif, jamais écrasé à 0).
5. **Formule identique au rapport Z**, sur une fenêtre différente :
   `fond + ventes espèces + encaissements autonomes − dépenses payées −
remboursements`. Deux grains (journée / session), une seule arithmétique —
   sinon la caisse et le Z ne raconteraient pas la même histoire d'argent. La
   fenêtre compare des **instants** (`created_at ≥ ouvertures AND < clôture`),
   pas des jours : le tiroir suit l'argent au moment où il bouge ; le découpage
   en journée métier (ADR-169) ne s'applique qu'aux **listes** (`cash.list` sur
   `opened_at`).
6. **Frontières en base (défense en profondeur, règle 4)** : `*_minor` entiers,
   float et comptage ≥ 0, forme verrouillée par un `CHECK` (ouverte ⇒ ni
   `closed_at` ni `expected_minor` ; fermée ⇒ les deux + un comptage).
7. **Slice verticale complète** (règle 7) : domaine pur
   `src/domain/cash/session-rules.ts` (jumeau main dans le repo, parité prouvée),
   repo transactionnel + `operationId` idempotent
   (`electron/ipc/handlers/cash-session.repo.ts`), 5 canaux explicites
   `cash.open|count|close|current|list` + validateurs Zod + bridge preload +
   façade renderer + schémas de réponse, UI française dans Rapports
   (`CashSessionsSection.tsx`, à côté des clôtures Z), tests.
8. **Aucun nouveau module de navigation ni nouvelle page de licence.** La
   caisse est une carte de l'écran Rapports (page `reports` déjà sous licence,
   permission staff `closings` déjà définie) ⇒ ni 18ᵉ page dans le manifeste
   licence, ni nouvelle permission dans les rôles, ni compteur de modules E2E à
   revoir.
9. **`cash.current` est justifié par la pratique** : une session ouverte hier
   doit être fermable aujourd'hui, alors que la liste est bornée par la période
   choisie. Le bouton « session active » ne dépend donc pas du filtre de période.

## Alternatives rejetées

- **Projeter `daily_closings` en sessions** (une « session » par journée,
  `counted = null`). Rapide, mais l'écran CashAudit de l'Owner afficherait un
  audit sans comptage physique : une façade de contrôle qui n'en est pas un.
  Refusé par l'opérateur.
- **Stocker `variance_minor`** en base : deux sources de vérité pour une seule
  soustraction, et tout correctif de comptage devrait réécrire la colonne.
  Refusé.
- **Un `expected_minor` constamment recalculé, y compris après fermeture** : la
  valeur d'une session fermée bougerait au gré des écritures ultérieures (une
  dépense re-datée changerait un écart déjà signé). Refusé — figement à la
  fermeture.
- **Nouvelle permission staff `cash` + nouvelle page de licence** : surface de
  configuration et de rotation de manifeste pour un bénéfice nul (mêmes
  acteurs, même périmètre que `closings`/`reports`). Refusé.

## Fichiers

- Migration : `database/migrations/0059_cash_sessions.sql` (+ porte dans
  `scripts/database/verify-migrations.mjs`)
- Domaine : `src/domain/cash/session-rules.ts` (+jumeau dans le repo),
  `src/domain/common/errors.ts` (`CASH_SESSION_ERROR`)
- Main : `electron/ipc/handlers/cash-session.repo.ts`,
  `electron/ipc/validators.finance.ts`, `electron/ipc/channels.ts`,
  `electron/ipc/registry.finance.ts`, `electron/ipc/{license,staff}-gates.ts`,
  `electron/preload/preload.ts`
- Renderer : `src/features/reports/CashSessionsSection.tsx`,
  `src/features/reports/ReportsScreen.tsx`, `src/shared/types/{ipc-client,ipc-contracts}.ts`,
  `src/vite-env.d.ts`
- Tests : `tests/unit/cash-session.test.ts` (9), `tests/integration/cash-sessions.test.ts`
  (10), inventaires gelés (`ipc-channels.json` 190 canaux, schémas 125→129,
  exports de validation 134→138, `operationId` requis +3), compte de migrations
  58→59

## Conséquences

- Le bloc `money.audit` de la liasse propriétaire a désormais une source réelle
  (fonds des sessions ouvertes, écart net et conformité des sessions fermées,
  postes actifs) — condition de la session « publieur de liasse » (ADR à venir).
- Une session fermée est une **trace** : modifiable uniquement en réouvrant la
  journée (E-21) puis en refermant, jamais par un simple UPDATE.
- `verify-migrations` refuse désormais deux sessions ouvertes d'un même poste,
  une session ouverte portant une attente, un comptage négatif ⇒ la dérive se
  voit à la porte, pas en production.
- Les montants de session ne sont **pas** une seconde clôture : le rapport Z
  reste la journée, la session reste le tiroir. Les deux peuvent diverger
  (deux postes sur une journée) — c'est le but.

## Validation

- `npm run check` **vert** (format, lint `--max-warnings 0`, typecheck
  root/electron/manager/mobile/owner) · `npm test` **vert** (177 fichiers) ·
  `npm run verify:migrations` **59** avec
  `OK 0059 sessions de caisse (poste unique ouvert, forme, bornes)` ·
  `npm run verify` **vert** · `npm run knip` **0**.
- Preuves fonctionnelles : ouverture refuse le doublon de poste (FR), deux
  postes parallèles, attente live qui suit les espèces de la fenêtre (et ignore
  ce qui précède l'ouverture), comptage intermédiaire sans fermeture, fermeture
  qui **gèle** l'attente (une vente postérieure ne la change pas), refus de
  refermer, rejouement du même `operationId` = une seule ligne et **premier**
  résultat conservé, comptage négatif refusé, liste calée sur le jour métier,
  audit (conformité 50 %, écart net −100).
- **Non testé** : rendu visuel de la carte dans l'application réelle
  (`npm run test:e2e` non relancé dans cette session), impression, et les
  sessions multi-postes sous concurrence réelle ( deux caissiers simultanés).

## Statut

Accepté — 2026-11-02. Préalable technique indispensable au publieur de liasse
propriétaire (constat n°1 de la demande).
