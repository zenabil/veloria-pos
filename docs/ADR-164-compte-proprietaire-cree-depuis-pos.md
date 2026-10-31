# ADR-164 — Compte propriétaire géré depuis le POS (création et mise à jour)

- **Date** : 2026-10-31
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : `electron/sync/sync.service.ts`, `electron/sync/sync.protocol.ts`,
  `electron/ipc/channels.ts`, `electron/ipc/validators.customers.ts`,
  `electron/ipc/registry.customers.ts`, `electron/ipc/license-gates.ts`,
  `electron/ipc/staff-gates.ts`, `electron/preload/preload.ts`,
  `src/vite-env.d.ts`, `src/shared/types/*`, Paramètres → Miroir Android.
  Aucune migration SQLite, aucune donnée financière touchée.

## Contexte

L'application propriétaire se connecte avec Supabase Auth (ADR-163). Créer le
compte à la main dans le dashboard Supabase est fragile (mot de passe oublié,
mauvaise organisation) et le propriétaire veut pouvoir **modifier** ce compte
depuis le POS.

## Décision

### 1. Un canal explicite

Nouveau canal `sync.saveOwnerAccount`
(`ownerAccountSaveSchema` : `operationId` + e-mail + mot de passe). Il est :

- **licence-gated** `customers` comme les autres canaux de synchro ;
- **staff-gated** `settings` (un vendeur sans permission ne peut pas changer le
  compte) ;
- **idempotent** (`operationId`, résultat rejoué sans second appel réseau).

### 2. Admin API Supabase depuis le main

`saveOwnerAccountAtomic` utilise l'URL + la **clé service déjà stockée
chiffrée** (DPAPI) dans `app_settings.client_sync` :

- `POST /auth/v1/admin/users` (création) ou
  `PUT /auth/v1/admin/users/{id}` (mise à jour) avec
  `{ email, password, email_confirm: true }` ;
- si l'e-mail existe déjà (HTTP 409/422), recherche du compte
  (`GET /auth/v1/admin/users?page=1&per_page=200`) puis `PUT` ;
- si l'id stocké n'existe plus (404), recréation ;
- seul `{ email, userId, updatedAt }` est conservé dans
  `app_settings.owner_account` — le **mot de passe n'est jamais persisté** ;
- erreurs FR (clé refusée, Supabase injoignable, compte introuvable), le détail
  HTTP reste dans les logs.

### 3. UI Paramètres → Miroir Android

Nouveau bloc « Compte propriétaire (application mobile) » : compte actuel,
dernière mise à jour, champs e-mail + mot de passe, bouton
« Créer le compte » / « Mettre à jour le compte ». La vue renderer expose
seulement l'e-mail (jamais de secret).

## Conséquences

- Le compte Supabase Auth est créé au premier enregistrement, puis **modifiable**
  (e-mail et/ou mot de passe) sans passer par le dashboard.
- Prérequis : URL + clé service du miroir déjà enregistrées (sinon message FR).
- L'inscription publique doit rester désactivée côté Supabase : seul le POS
  (service_role) crée des comptes.
- Multi-boutique : un seul compte par installation (clé `owner_account`) ;
  l'ADR-163 décrit l'évolution `owner_access` si nécessaire.

## Alternatives écartées

- **Création manuelle dans le dashboard** : pas de modification depuis le POS,
  risque d'erreur de saisie, aucune trace locale.
- **Inscription depuis l'app propriétaire** : ouvrirait la création de comptes,
  contraire à la politique mono-propriétaire et à la RLS actuelle.
