# ADR-176 — Contrat client-sync : CORS réel, accès miroir orphelins et identité de boutique

- Date : 2026-11-06
- Statut : **appliqué** pour le diagnostic et le cloud ; **une partie consciously deferred** (§6)
- Demande opérateur : « قم بالاختبارات : ادخال قيم supabase في pos، انشاء عميل، ربطه بالتطبيق، انشاء عملية بيع، تحقق من المعاملة في تطبيق العميل، اكتشف الأخطاء و صحح جذريا »
- Périmètre : boucle complète POS → Supabase réel → app client, exécutée pour la première fois **contre le cloud**, pas contre un relais.

## 1. Ce qui a été réellement exécuté

`tests/e2e/real-cloud-loop.spec.ts` (nouveau) : app réelle activée sur base
isolée (`PROGRAMDATA` + `userData` temporaires, `launchActivatedApp`), saisie
des valeurs Supabase dans Réglages → Miroir Android, création d'un client,
activation de son accès mobile (PIN), produit, vente encaissée, « Synchroniser »,
« Pousser maintenant », puis vérification **contre le projet réel** : REST
`client_access`/`client_payloads`, appel du vrai contrat `client-sync`
(login + détail + refus du mauvais PIN).

Mesuré (run du 2026-11-06, 30,4 s, `1 passed`) :

| Étape                            | Résultat                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Poussée miroir                   | toast « Miroir poussé : 8 cliché(s) »                                                                                 |
| `client_access` réel             | 1 ligne active, `phone_hash` = SHA-256 du numéro saisi, `pin_algo` `pbkdf2-sha256-100k`                               |
| `client_payloads` réels          | 8 lignes, kinds `customer_snapshot`, `invoice_list`, `payment_list`, `invoice_detail`                                 |
| Contrat APK (login)              | `ok:true`, facture `FAC-2026-00001`, `total_minor` **50 000**                                                         |
| Détail de facture                | `detail.sale.invoice_number` = la facture créée                                                                       |
| Mauvais PIN                      | `401 AUTH_ERROR` — la porte est bien côté serveur                                                                     |
| App client (Expo web + Chromium) | après déverrouillage de confidentialité : `500,00 دج`, reste `0,00 دج`, paiement `+500,00 دج`, produit `250,00 دج ×2` |

Les identifiants n'entrent **pas** dans le dépôt : `VELORIA_MIRROR_URL`,
`VELORIA_MIRROR_SERVICE_KEY`, `VELORIA_MIRROR_ANON_KEY` (et
`VELORIA_MIRROR_KEEP_DATA=1` pour laisser les lignes d'un run). Sans eux, le
fichier est **ignoré avec son motif** et aucun hook ne tourne.

## 2. Erreur n°1 — la build WEB de l'app client ne pouvait pas se connecter (CORS)

Symptôme dans l'app : « لا اتصال بالإنترنت، أعد المحاولة لاحقاً » (OFFLINE_ERROR),
alors que le **même** POST, hors navigateur, répondait `200` avec la facture.
Preuve : `OPTIONS /functions/v1/client-sync` → **405** sans aucun en-tête CORS ;
le POST portait bien `200` mais sans `Access-Control-Allow-Origin`.

**Pourquoi aucune suite ne pouvait le voir** : les deux serveurs locaux qui
émulent ce contrat (`scripts/e2e-mirror-relay.mjs`,
`scripts/demo-client-sync-server.mjs`) envoient déjà les en-têtes CORS et
répondent à `OPTIONS`. Seule la fonction Edge réelle en était dépourvue. Le
défaut n'existait donc **que** contre le cloud — et React Native (APK)
n'applique pas CORS : le chemin testing du projet ne pouvait pas croiser le
chemin de production.

Correction, dans le contrat lui-même (`cloud/supabase/functions/client-sync/index.ts`) :

1. `CORS_HEADERS` (valeurs alignées sur les relais : `Allow-Origin: *`,
   `Allow-Headers: apikey, authorization, Content-Type, Prefer`,
   `Allow-Methods: POST, GET, OPTIONS`, `Max-Age: 86400`).
2. Branche `OPTIONS` → `204` **avant** la garde de méthode (le 405 tuait tout
   preflight navigateur).
3. Les en-têtes sur **toutes** les réponses, `fail()` compris : l'app map
   `AUTH_ERROR` / `LOCKED_ERROR` / `REVOKED_ERROR` à partir du **corps**, et un
   corps illisible par le navigateur retombe en « hors ligne » — un faux panne
   réseau exactement comme celui qui vient d'être corrigé.

Déployé sur le projet (version 3 → 4, via le tableau de bord après accord
opérateur), revérifié en réel : `OPTIONS → 204` + les quatre en-têtes, et `401`
d'erreur portant aussi les en-têtes.

**Garde ajoutée** : `tests/unit/client-sync-cors.test.ts` verrouille la parité
des **trois** implémentations du contrat (fonction Edge, relais E2E, serveur de
démo) et refuse toute réponse produite sans `CORS_HEADERS`. C'est la classe de
défaut, pas seulement son instance : une future réponse « nue » rougit la porte.

**Effet de bord de ce correctif, trouvé par la suite complète et corrigé à la racine** :
`tests/unit/pin-kdf-parity.test.ts` découpait la source Edge **par positions** (de
`function hexToBytes` jusqu'à `function fail(`) puis l'évaluait après avoir retiré trois
annotations TypeScript connues. La constante `CORS_HEADERS` placée avant `fail()` tombait
dans cette tranche → `SyntaxError: Missing initializer in const declaration` : un test de
parité KDF qui rougit parce qu'on a rangé du code à côté. La tranche est désormais **bornée
à chaque fonction KDF** (jusqu'à son accolade fermante, `async` inclus — le corps contient
des `await`), donc indépendante de l'ordre des déclarations. Mesuré vert ; et une future
constante ajoutée dans ce fichier ne peut plus casser la preuve comportementale du PIN.

## 3. Erreur n°2 — le miroir gardait les accès des clients supprimés, et cela cassait un vrai client

Mesuré avant tout changement : le POS local ne contient **qu'un** accès actif
(client 2, `phone_hash a53ac26f6f…`) ; le miroir en contenait **sept**
(2, 3, 4, 5, 6, 94, 95) — six lignes dont le client n'existe plus localement
(reset d'usine, restauration d'une autre base, suppression des données
fictives). Dont **deux lignes actives sur le même numéro** : 2 et 95.

Conséquence déterminée par le code déployé : `client-sync`, face à plusieurs
lignes actives pour un `phone_hash`, **refuse fermement** (`500` « Service de
synchronisation indisponible. »). Le client réel du commerçant ne pouvait donc
pas se connecter — sans que l'écran du POS n'affiche rien, et sans que le
miroir ne puisse se corriger seul (le POS ne pousse que ce qu'il connaît ;
rien ne retire du miroir ce que le master a oublié).

Actions :

1. **Réparation des données** (accord opérateur) : sauvegarde exportée (8 lignes
   d'accès, 44 clichés, `RESTORE.sql`), puis `DELETE FROM client_access WHERE
customer_id <> 2` → `ca=1 cp=0 idx=1 active_dups=0`. Le miroir est redevenu
   exactement la vérité locale. Le client réel a donc à nouveau une identité
   **non ambiguë** ; ses clichés reviendront à la prochaine poussée réelle.
2. **Invariant miroir** : index partiel UNIQUE `client_access_active_phone_uq`
   sur `(phone_hash) WHERE revoked_at IS NULL` — miroir de la contrainte
   déjà écrite dans la migration SQLite 0034, posé en live **et** ajouté à
   `cloud/supabase/schema.sql` pour que la parité dépôt/cloud ne se reperde pas
   (c'est précisément la dérive silencieuse corrigée en session 98).
   Ce qui était une corruption silencieuse devient un refus immédiat et nommé.

## 4. Erreur n°3 — ce refus immédiat devait être compréhensible (E-61)

Un 409 de dupliquée sur cet index tombe dans la classification d'ADR-173 :
`409 = définitif` → bissection du lot → **condamnation**… mais une ligne
d'accès n'est pas dans `sync_outbox` : elle est relue dans `customer_access` à
chaque tick. Sans traitement explicite, la poussée aurait donc échoué
éternellement sur la même ligne, avec le message générique, pendant que le
client, lui, aurait vu un 500.

`isMirrorPhoneConflict(status, detail)` (pur) distingue la duplicata
d'identité (`client_access_active_phone_uq`, « duplicate key », « unique
constraint ») de la vraie ligne coupable (clé étrangère `23503`), et
`postAccess` interrompt la poussée sur `MIRROR_PHONE_CONFLICT_MESSAGE`
(« le miroir garde un accès mobile plus ancien pour ce numéro : la purge du
miroir est requise »), **sans condamner** le moindre cliché. Un test d'ADR-173
est gardé tel quel à côté (409 FK → ligne écartée, `failed=1`, jamais le
message de purge) : la distinction est vérifiée dans les deux sens.

## 5. Refusé

- **Pointeur de `customer_id` partagé entre boutiques** : voir §6, la vraie
  correction exige une identité de boutique sur le miroir ; en faire
  l'impulsion d'un prune sauvage aurait été **pire** (une instance de test ou
  une seconde boutique sur le même projet aurait effacé les accès réels).
- **Faire confiance au relais E2E comme preuve du cloud** : la leçon de §2 est
  que l'émulation locale a masqué un défaut de production pendant que tout
  était vert. La boucle réelle est désormais un spec, pas une anecdote.
- **Taper la clé service du commerçant dans son instance installée** : le
  poste réel reste un geste opérateur (session 103/106) ; les tests utilisent
  une instance isolée et des variables d'environnement.
- **Publier la liasse propriétaire depuis une base de test** : un faux
  `owner_snapshots` s'afficherait comme l'état réel du commerce. `ownerEnabled`
  reste OFF dans ce run.

## 6. Ce qui reste ouvert, écrit noir sur blanc

1. **Identité de boutique sur le miroir client** (`shop_key`), comme
   `owner_snapshots` la porte déjà. Sans elle, deux installations sur le même
   projet se disputent les mêmes `customer_id` (entiers locaux) : la seconde
   **ecrase** la ligne d'accès de la première. C'est aussi le prérequis d'une
   purge automatique sûre. Design retenu : colonne `shop_key` remplie à la
   poussée à partir d'un identifiant stable, `prune = DELETE … WHERE shop_key =
eq(cle) AND customer_id NOT IN (ids locaux)`, jamais de suppression sur les
   lignes NULL héritées. **Non implémenté ici** : touches schema + protocole +
   poussée + fonction Edge + tests, et une migration cloud — à faire en slice
   complète, pas en urgence de session de test.
2. **Le commerçant doit coller la Secret key** dans son POS installé pour que
   ses propres clients remontent (le miroir est sain, vide de ses clichés depuis
   le 2026-11-02).
3. **Parité texte dépôt ↔ cloud de la fonction** : le redéploiement a été fait **dans
   l'éditeur du tableau de bord** (la session du navigateur interne ne quittait pas la route
   SQL, et aucun CLI/token n'est présent sur le poste). La v4 déployée ajoute la même branche
   `OPTIONS`, le même `CORS_HEADERS` et les mêmes trois en-têtes de réponse que le fichier du
   dépôt, **comportement vérifié en réel** (`OPTIONS → 204`, en-têtes sur le `401`) — mais le
   texte n'est pas octet pour octet identique au dépôt. Un redéploiement depuis le dépôt
   (`npx supabase functions deploy client-sync --project-ref ynktschorbwukxovjzcz`, avec un
   token d'accès personnel fourni par l'opérateur) rétablit la parité exacte. Consigné plutôt
   que laissé silencieux : c'est précisément la classe de dérive corrigée en session 98.
4. **Rien à redéployer côté APK** : la correction CORS ne change pas le contrat de l'app
   native (React Native n'applique pas CORS) ; la build web profite immédiatement de la v4.
5. Les 4 clés du projet restent en place (legacy requis par les builds de la
   session 99) ; la question de la rotation est ouverte depuis §106.
6. **Jeton de session du tableau de bord passés dans la transcription** en fin de session
   (redirection `sign-in-mfa` avec `access_token` / `provider_token` GitHub / `refresh_token`
   dans l'URL, lue par l'outil de navigation). Le jeton de session expire en 30 minutes ; le
   `gho_…` et le refresh token sont plus durables → à révoquer si doute. Cause : comportement
   de l'outil quand la session dashboard arrive à échéance, pas un choix de manipulation.

## 7. Preuves

- `tests/e2e/real-cloud-loop.spec.ts` — 1 run vert contre le projet réel, avec
  assertions REST + contrat + refus du mauvais PIN ; skip explicite sans env.
- `tests/unit/client-sync-cors.test.ts` — 3 cas (OPTIONS avant la garde de
  méthode, toute réponse porte `CORS_HEADERS`, valeurs identiques sur les trois
  implémentations du contrat).
- `tests/unit/sync-protocol.test.ts` — 3 cas E-61 (duplicata d'identité =
  conflit ; `23503` FK ≠ conflit ; ni 401 ni 500 ne sont un conflit).
- `tests/integration/sync-push-resilience.test.ts` — 2 cas E-61 sur base migrée
  - transport injecté : 409 sur l'index → message de purge, file **entièrement
    pending**, rien de condamné, `lastError` écrit ; 409 FK → comportement
    ADR-173 inchangé.
- Cloud : `OPTIONS → 204` + 4 en-têtes, `401` d'erreur avec les mêmes en-têtes,
  `client_access` réduit à la vérité locale, index `client_access_active_phone_uq`
  présent, et app client rendue avec les montants démasqués.
