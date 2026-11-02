# ADR-173 — File de synchronisation : une ligne condamnée ne gèle plus la poussée

## Contexte

Découvert en branchant réellement le POS sur Supabase (2026-11-02, soir) : la
poussée échouait et le miroir ne recevait **rien**, même des clients sains.

Le journal technique (`push.http`) montrait deux natures d'échec **traitées
identiquement** :

- `HTTP 409` avec `{"code":"23503","details":"Key (customer_id)=(1) is not
present in table \"client_access\""}` — **définitif** : le couple
  `(operation_id)` du cliché vise un `client_id` que le miroir ne connaît pas.
  Aucun nombre de réessais ne le fera passer.
- `HTTP 401` / `503` / erreur réseau — **temporaire** : la file doit rester
  telle quelle et on retente.

La cause structurelle est dans `buildMirrorRequests` : **tous** les clichés en
attente partent dans **une seule** requête `POST /rest/v1/client_payloads`, que
PostgREST applique en **une seule instruction**. Une ligne coupable fait donc
échouer le lot entier (jusqu'à 200 lignes), `pushNowAtomic` ressortait en
exception, aucune ligne ne passait à `sent`, et le tick suivant rejouait le même
lot — **blocage indéfini**, silencieux côté commerçant à part une `lastError`
générique.

Le cas n'est pas théorique : la base réelle contenait 6 clichés du client 1
(en file depuis le 2026-10-13, à une époque où son accès existait) pour un
`customer_access` local réduit au client 2. Les 9 clichés sains du client 2
étaient derrière, et ne sont jamais passés.

## Décision

1. **La distinction temporaire/définitif est une règle du domaine, pas du
   service.** `electron/sync/sync.protocol.ts` porte
   `isPermanentMirrorRejection(status)` : `400`, `404`, `409`, `410`, `415`,
   `422` = condamné ; **401 et 403 restent temporaires** (identité, RLS, clé
   mal saisie : rien ne doit être écarté pendant qu'on se trompe de clé) ;
   `408`, `429`, `5xx` et réseau = temporaire.
2. **`MirrorRejectionError`** (statut + détail serveur) remplace l'exception
   opaque pour les rejets définitifs, et le service garde le message FR
   `Miroir injoignable (HTTP n).` pour les temporaires (contrat `lastError`
   inchangé, règle 6).
3. **Division binaire du lot refusé** (`splitMirrorRequest`) : un lot condamné
   est coupé en deux moitiés et re-posté, récursivement, jusqu'à isoler la
   ligne seule. Coût `k·log n` requêtes pour `k` coupables sur `n ≤ 200`, au
   lieu d'un échec total. Les lignes sains d'un lot mélangé **passent** dès la
   tentative suivante.
4. **La ligne seule condamnée devient `status='failed'`**, jamais `pending`.
   `sync_outbox` prévoyait déjà cet état (CHECK de la migration 0032/0038) sans
   que personne ne l'écrive : c'est désormais l'état d'audit des rejets
   définitifs. Elle ne revient pas dans la file (`WHERE status='pending'`), et
   si le client est ré-activé plus tard, `enqueueCustomerRefresh` produira de
   nouveaux `operationId` — pas de rejouement d'un payload périmé.
5. **Le contrat de `sync.pushNow` gagne `failed`** (`src/shared/types/
ipc-contracts.ts`, schéma `.loose()`), et l'UI le dit :
   « Miroir poussé : 9 cliché(s), 1 accès — 6 écarté(s) (données client
   incohérentes). » en ton `warn`, plus une `lastError` FR persistée dans le doc
   quand `failed > 0` (le commerçant doit voir qu'une partie est restée).
6. **Volontairement non fait** : ne pas purger `failed` automatiquement (la
   rétention existante s'en charge), ne pas ré-essayer les `failed` périodiquement
   (un rejet 23503 ne se résout pas tout seul), ne pas changer l'ordre
   `client_access` → `client_payloads` ni la pagination par `customer_id`.

## Conséquences

- Une file empoisonnée ne bloque plus jamais le reste : le miroir reste vivant
  pour les clients corrects même quand la donnée d'un autre est incohérente.
- Le nombre de requêtes cloud monte uniquement **en cas d'échec** (coût
  borné : ≤ 2·n dans le pire cas de lots tous coupables, sur un lot de 200 =
  400 POST, et ces lignes-là partent `failed` une fois pour toutes).
- Un échec d'identité (401) reste **total et visible** : c'est le bon signal,
  rien n'est détruit silencieusement pendant qu'on corrige la clé.
- La notion « la file est rejouable » est enfin exacte : elle l'est pour ce qui
  est rejouable, et ce qui ne l'est plus est écrit.

## Prises

- `tests/integration/sync-push-queue.test.ts` (6 tests, base migrée réelle,
  transport injecté) : 6 orphelins + 9 sains → `{pushed: 9, access: 1,
failed: 6}` et plus aucun `pending` ; `lastPushAt` posé et `lastError` FR ;
  idempotence sur le même `operationId` ; **503 → tout reste `pending`** ;
  **401 → tout reste `pending`** ; bissection réellement émettrice de plus de
  3 requêtes.
- `tests/unit/sync-protocol.test.ts` (+5) : classification des codes (dont 401
  et 403 **non** condamnés), `splitMirrorRequest` [3,2] sur 5 lignes avec
  reunion exacte, ligne seule non divisible, `MirrorRejectionError` porteur.
- Journal du poste : `push.row_rejected` remplace l'ancienne mort muette du lot.
