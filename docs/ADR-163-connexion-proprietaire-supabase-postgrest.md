# ADR-163 — Connexion de l'app propriétaire à Supabase (Auth + PostgREST)

- **Date** : 2026-10-31
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : `cloud/supabase/owner.sql`, `cloud/supabase/README.md`,
  `owner/eas.json`, `owner/src/api.ts`, `tests/unit/owner-foundation.test.ts`.
  Aucune migration SQLite, aucun canal IPC, aucune donnée métier modifiée.

## Contexte

L'app propriétaire (`owner/`) ne contient plus aucune donnée fictive (session 84) : sans source réelle, elle n'affiche que l'écran « Supervision non
configurée ». Le miroir client Supabase (`client_access`, `client_payloads`)
ne contient que des clichés par client — pas d'agrégats de magasin. Il faut une
surface de lecture dédiée, alimentée par le POS (SQLite = master).

Deux options : une Edge Function `owner-sync` (comme `client-sync`) ou une
lecture PostgREST directe protégée par RLS.

## Décision

### 1. Table de liasses, pas de fonction Edge

`cloud/supabase/owner.sql` crée `public.owner_snapshots`
(`shop_key`, `payload JSONB`, `generated_at`), indexée par
`(shop_key, generated_at DESC)`.

- RLS activée ; `anon` **révoqué** ; `authenticated` **lit** ;
  `service_role` **écrit**. Aucune policy d'écriture : seul le POS publie.
- La liasse est **calculée par le POS** (centimes DZD, une seule formule par
  chiffre) et stockée telle quelle — aucune finance calculée côté cloud.

### 2. Lecture par l'app

`fetchOwnerSnapshot` fait un `GET` PostgREST :

```
/rest/v1/owner_snapshots?shop_key=eq.veloria&select=payload,generated_at&order=generated_at.desc&limit=1
```

avec `apikey: <anon>` + `Authorization: Bearer <jeton Supabase Auth>`.
Réponse vide → « Aucune liasse de supervision publiée. » (message FR).
L'authentification reste `auth/v1/token` (e-mail + mot de passe).

### 3. Configuration gravée au build

`owner/eas.json` (profils `preview` et `production`) porte
`EXPO_PUBLIC_OWNER_SYNC_URL` et `EXPO_PUBLIC_OWNER_ANON_KEY` du projet
`veloria-pos` — valeurs **publiques** (URL + clé anon), jamais la clé
`service_role`. Aucun champ endpoint dans l'écran de connexion.

### 4. Portée mono-boutique

`shop_key` vaut `veloria`. Un seul compte propriétaire est créé dans Auth —
depuis le POS (ADR-164), inscriptions désactivées — ; la policy de lecture est
ouverte aux utilisateurs authentifiés. En multi-boutique, remplacer par une table `owner_access`
(`user_id` → `shop_key`) et une policy basée sur elle.

## Conséquences

- **Requis pour voir des données** : un publieur POS qui calcule la liasse
  (`OwnerSnapshot` v1) et l'insère avec `service_role`. Tant qu'il n'existe
  pas, l'app affiche l'état « aucune liasse publiée ».
- Rétention à ajouter plus tard (purge des liasses anciennes, plan gratuit).
- Aucune Edge Function à déployer pour le propriétaire ; `client-sync` reste
  inchangée.

## Alternatives écartées

- **Edge Function `owner-sync`** : un déploiement supplémentaire sans valeur
  pour une lecture unique et authentifiée ; PostgREST + RLS couvre le besoin.
- **Connexion directe à PostgreSQL** : impossible depuis un APK et contraire au
  pont HTTP unique.
- **Données de démonstration embarquées** : supprimées (session 84).
