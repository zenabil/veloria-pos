# ADR-182 — Commandes de produits depuis l'application client (catalogue, panier, réservation)

- **Date** : 2026-11-10
- **Statut** : accepté
- **Branche** : `feat/client-orders`
- **Portée** : `cloud/supabase/catalog.sql`,
  `cloud/supabase/functions/client-sync/index.ts`,
  `electron/sync/catalog.ts`, `electron/sync/sync.service.ts`,
  `electron/ipc/handlers/catalog.repo.ts`, `electron/ipc/channels.ts`,
  `electron/ipc/validators.catalog.ts`, `electron/ipc/registry.catalog.ts`,
  `electron/preload/preload.ts`, `src/shared/types/ipc-client.ts`,
  `database/migrations/0063_client_orders.sql`,
  `mobile/src/{api,cache,store,views,i18n}.ts`, `mobile/src/screens/Boutique.tsx`,
  `mobile/src/screens/Cart.tsx`, `mobile/src/ui/nav.tsx`,
  Paramètres/écran « Produits publiés dans l'application », écran « Commandes » (POS).
  **Aucune écriture financière** : le paiement reste au comptoir.

## Contexte

L'application client (APK `mobile/`) est **lecture seule** depuis ADR-053 :
factures, paiements, dette, annonces. Elle répond à une seule question
(« combien je dois ? ») — utilité mensuelle, faible fréquence, **aucune raison
de l'ouvrir**. L'objectif commercial est **augmenter le nombre d'utilisateurs** :
il manque un motif d'installation et un motif d'ouverture hebdomadaire.

D'où la demande : **commander des produits depuis l'application**. C'est la
première écriture que l'APK jamais exécuterait — donc la question dominante
n'est pas l'écran, c'est **l'architecture de l'écriture**.

Contraintes mesurées dans le dépôt :

- `sync_outbox.kind` est un `CHECK` **immuable** (migration 0032) : tout nouveau
  type de cliché impose une **nouvelle** migration qui reconstruit la table.
- La clé `service_role` **contourne la RLS** : elle ne doit jamais quitter le
  poste ; le `anon` ne doit jamais pouvoir écrire.
- `cloud/supabase/limits.md` pose en règle d'or « **jamais de polling** » et
  note que le miroir est **jetable** (reconstructible depuis `sync_outbox`) :
  la durée de vie d'une donnée dans le cloud n'est pas garantie.
- `MAX_PAYLOAD_CHARS = 200_000` borne un cliché ; un catalogue de plusieurs
  centaines de produits ne tient pas dans un cliché **par client** sans
  multiplier le egress par le nombre de clients.
- Les appareils algériens sont en partie **sans Google Play Services** :
  l'notification push (FCM) ne peut pas être la ligne de base.

## Décision

### 1. Périmètre fonctionnel — « réserver et retirer »

L'application permet de **passer une commande de produits**, **réservée pour
retrait en magasin**, **payée au comptoir**. Aucun paiement électronique, aucune
livraison, aucune adresse. Le montant affiché sur le téléphone est un
**montant estimé** (calculé sur les centimes du catalogue), jamais une dette :
le montant réel est celui de la vente créée au comptoir.

### 2. Qui écrit, et où

| Acteur           | Écriture                                 | Où                  |
| ---------------- | ---------------------------------------- | ------------------- |
| Client (APK)     | **aucune** en V1                         | —                   |
| POS              | catalogue publié, commandes, vente       | **SQLite (master)** |
| Nuage (Supabase) | cliché du catalogue + cliché de commande | **miroir jetable**  |

Le **POS reste le seul master** (ADR-053) : une commande existe en SQLite
(`client_orders`) ou n'existe pas. Le nuage ne porte qu'un **transport** (le
catalogue, l'état d'une commande) et n'est jamais la preuve.

### 3. Un projet Supabase **par magasin** (décision opérateur)

Le miroir est **mono-tenant** : un projet = un magasin. Conséquences :

- **aucun `store_key`** dans le schéma du miroir (ni `client_access`, ni
  `store_catalog`) ;
- l'unicité de `phone_hash` (index partiel `client_access_active_phone_uq`)
  reste **globale au projet** : deux magasins ne se marchandaient pas, ils
  n'ont pas le même projet ;
- `company_profile.uuid` reste le seul identifiant de magasin, **local** ;
- si un jour un projet est partagé entre magasins, il faudra `store_key` dans
  `client_access` + `store_catalog` + toutes les requêtes — **migrations et
  revue sécurité obligatoires**, pas un simple champ.

### 4. Transport du catalogue — table dédiée `store_catalog`

Le catalogue est **par magasin**, pas par client. Le pousser comme un cliché
`product_catalog` par client coûterait N copies (N = clients actifs) et
imposerait de reconstruire le `CHECK` immuable de `sync_outbox`.

Décision : **table `store_catalog`** (une ligne par produit publié) +
`store_catalog_meta` (version, compteur, date de publication), écrites par le
POS en **upsert** (`on_conflict=product_id`) avec la clé de service, lues par
la fonction Edge `client-sync` avec la clé de service.

- **Une seule copie** par magasin, quel que soit le nombre de clients.
- **Aucun `CHECK` `sync_outbox` touché** ⇒ aucune reconstruction de table.
- Le catalogue **n'est pas** un cliché client : il n'est pas versionné par
  client, il est lu à la demande par `client-sync`.
- RLS : RLS activée, `anon`/`authenticated` **révoqués**, `service_role` seul
  lecteur/écrivain — même verrou que `client_payloads` (ADR-053).

### 5. Ce qui est publié

Un produit est publié si et seulement si :

- `products.is_active = 1` **et** `products.deleted_at IS NULL` ;
- sa catégorie n'est pas dans la liste d'exclusion ;
- `selling_price_minor > 0` (un produit à prix nul est une erreur de saisie :
  il ne doit pas apparaître dans un catalogue client).

Aucune donnée d'achat n'est publiée : ni `purchase_price_minor`, ni couches
FIFO, ni fournisseur, ni stock exact. Le champ publié est un **booléen de
disponibilité** (`available`), jamais la quantité.

**Où vit le catalogue dans l'APK** : dans **son propre onglet** (« Boutique »),
pas dans l'accueil. L'accueil répond à « combien je dois ? » ; y ajouter un
catalogue le transformerait en écran à deux métiers et masquerait la dette
(premier scroll). Le retour vers l'accueil est en revanche **un bouton** : le
catalogue est le motif de retour de l'application, il doit être à un geste.
La « bande de mouchettes » dans l'accueil (suggestions du commerçant) reste
**une option** de la tranche B, pas un acquis.

**Architecture finale des onglets (5, la règle « 5 max » est levée)** :

```
الرئيسية · المتجر · السلة · النشاط · حسابي
   Accueil  Boutique  Panier  Activité  Compte
```

- « Panier » est **un onglet** (choix de l'opérateur) : le compteur de la
  commande devient un geste direct, pas un détour. Il porte une **pastille**
  (nombre d'articles) — l'onglet vide reste lisible.
- « Activité » regroupe ce qui est arrivé au client en **trois segments** :
  **Factures | Paiements | Commandes**. C'est ce regroupement qui libère la
  place du panier (sans lui, il aurait fallu 6 onglets).
- Le panier est **local à l'appareil** (ce n'est pas une donnée métier) : il
  survit à la fermeture, ce qui sert la commande hebdomadaire.

### 6. Version du catalogue

`catalog_version` = empreinte SHA-256 de la charge utile canonique du
catalogue. Elle est stockée dans `store_catalog_meta` et renvoyée par
`client-sync` : l'APK ne re-télécharge le catalogue **que si la version a
changé** (cache local `expo-sqlite`). Effet : le catalogue ne coûte pas de
bande passante à chaque connexion, et l'APK ouvre instantanément hors ligne.

### 7. Publication — quand et par qui

- Le catalogue est publié par le POS : bouton « Publier maintenant » +
  **republication automatique** lors d'un changement de prix, d'activation ou
  de désactivation d'un produit, **agrégée** (debounce) pour ne pas remplir la
  file à chaque frappe.
- L'écran POS « Produits publiés dans l'application » est une **vue du
  catalogue effectif** (ce que l'APK verra réellement) + les exclusions par
  catégorie + l'aperçu client + la date de dernière publication.
- Les **réglages de publication** (activé, catégories exclues) vivent dans
  `app_settings` (`client_catalog`) : ce n'est pas un secret, ce n'est donc pas
  dans le document chiffré `client_sync`.

### 8. Commande — cycle de vie

| État SQLite | POS                                    | APK                       |
| ----------- | -------------------------------------- | ------------------------- |
| `nouvelle`  | créée (saisie manuelle ou automatique) | « envoyée »               |
| `preparing` | en préparation                         | « en préparation »        |
| `ready`     | prête pour retrait                     | « prête pour retrait »    |
| `served`    | livrée (vente liée)                    | « livrée » + lien facture |
| `cancelled` | annulée (motif)                        | « annulée » + motif       |

- La **référence `CMD-AAAA-NNNNNN` est générée par le POS** : c'est le master.
  L'APK n'invente jamais de référence officielle (il garde un identifiant
  local `W-xxxxxx` pour sa propre liste), sinon deux numérotations coexistent.
- L'APK **reconnaît** la commande par **nom + téléphone** : la commande est
  rattachée à la fiche client dans le POS.
- Le lien vers la vente est `client_orders.sale_id` : la commande devient une
  vente **au comptoir**, et c'est là que le stock et l'argent bougent.
- **Réservation souple** : une commande en préparation réserve une quantité
  qui réduit le **disponible** (`quantité − réservé`) sans toucher aux couches
  FIFO ni au stock physique. Une réservation n'est pas une consommation.

### 9. Retour d'état vers l'APK — `customer_snapshot`

Le POS ne crée **pas** de nouveau type de cliché : l'état de la commande
revient dans le champ `orders[]` du cliché `customer_snapshot` existant. Conséquence :
`client-sync` renvoie `orders` sans nouvelle table miroir de commande, et sans
reconstruction du `CHECK` immuable. La commande change d'état ⇒
`enqueueCustomerRefresh(clientId)` (déjà existant) ⇒ le client le sait au
prochain tick.

### 10. Transport de la commande — d'abord WhatsApp, ensuite automatique

- **V1 (livré en premier)** : l'APK compose une **commande par WhatsApp**
  (message structuré, lignes, quantités, total estimé, nom et téléphone du
  client, préférence de retrait) — aucun écrit dans le cloud, fonctionne sur
  100 % des appareils, y compris sans GMS. Le POS saisit la commande à la main
  depuis le message.
- **V2** : `client-order` (Edge, écriture) + table `order_intents` + tirage par
  le POS. La saisie manuelle **reste** comme filet. Rien dans le cloud n'est
  jamais une donnée métier : c'est une **demande**, validée par le POS, qui
  seule crée la vente en SQLite.

### 11. Notification — la ligne de base n'est pas le push

`expo-notifications`/FCM **exige Google Play Services** : une part importante
des appareils algériens n'en a pas. Donc :

- **ligne de base** : rafraîchissement périodique déjà en place (ADR-165),
  bandeau « commande reçue », état visible dans l'APK ;
- **amélioration** : push FCM là où GMS existe, avec **dégradation gracieuse**
  (un appareil sans GMS reste pleinement fonctionnel) ;
- **l'éventuel push n'est pas une promesse** : l'APK ne doit jamais annoncer
  une notification qu'il ne peut pas garantir.

### 12. Mesure — sans compteur, l'objectif n'est pas démontrable

`client_activity` (date, `customer_id`, type d'appel) est écrit par
`client-sync` à chaque appel **authentifié**. Le POS affiche « utilisation de
l'application : N visites · M clients actifs sur 30 jours ». C'est le seul
chiffre qui prouve l'effet recherché, et c'est aussi ce qui donne au
commerçant une raison de promouvoir l'application.

### 13. Règles de contenu tenues

- **Pas d'images de produits en V1** : le projet n'a aucun bucket de stockage,
  et une image = un hébergeur externe à gérer par le commerçant. Le champ
  `image_url` est prévu dans le schéma pour plus tard (comme les annonces,
  ADR-166), **vide** en V1.
- **Pas de remise, pas de points, pas de taxe calculés sur le téléphone** :
  la remise signée vit dans le POS (ADR-051/ADR-114). Un montant promu par
  l'APK et non appliqué au comptoir détruit la confiance plus vite qu'une
  fonctionnalité manquante.
- **Pas de page catalogue publique** : elle obligerait à rouvrir l'accès
  `anon` aux prix, ce qui contredit le verrouillage assumé de `schema.sql`.

## Conséquences

- Le catalogue est une **projection** : il peut être reconstruit depuis
  SQLite. La base **`store_catalog` n'est pas la source** des prix.
- Un magasin dont le miroir est effacé perd son catalogue publié jusqu'à la
  republication suivante — sans conséquence métier (les prix restent dans
  SQLite).
- Le catalogue **n'est pas** un instantané des stocks : la disponibilité est un
  indice, la vérité est à la validation de la commande, au comptoir.
- La commande par WhatsApp impose au commerçant une saisie manuelle : c'est
  le coût assumé de l'absence de chemin d'écriture dans le cloud (V1). V2 le
  supprime.

## Alternatives écartées

- **Écriture directe de la commande dans Supabase** : viole ADR-053 — le Z,
  le stock et la dette deviendraient faux. Refusé.
- **Cliché `product_catalog` par client** : N copies du catalogue, egress
  multiplié, et reconstruction du `CHECK` immuable de `sync_outbox`. Refusé.
- **Carte cadeau, code-barres en V1, points de fidélité, livraison,
  paiement en ligne** : hors périmètre (le code-barres est une tranche
  ultérieure, sans risque).
- **Prix « au centime près » garantis par l'APK** : impossible à tenir sans
  lock sur les prix ; le montant est donc **estimé** et libellé comme tel.
- **Compte-rendu d'utilisation dans l'APK** : le compteur est écrit par le
  cloud (déjà authentifié), pas par l'APK — pas d'écriture nouvelle côté
  client.
