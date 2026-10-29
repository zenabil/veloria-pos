# ADR-158 — Miroir client Supabase : clichés réservés aux accès actifs

- **Date** : 2026-10-29
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : processus main (`electron/`) + miroir Supabase. Aucune
  migration SQLite, aucun changement de domaine financier, aucun changement
  d'interface.

## Contexte

Le projet Supabase `veloria-pos` (ref `ynktschorbwukxovjzcz`, région
`eu-west-2` Londres) existait déjà avec les tables `client_access`,
`client_payloads`, la vue `latest_client_payloads`, RLS active et la fonction
`client-sync`. Le POS a été relié à ce projet (URL + clés saisies côté main,
chiffrées DPAPI dans `app_settings.client_sync`).

La première poussée réelle a échoué en **HTTP 409** :

```
insert or update on table "client_payloads" violates foreign key constraint
client_payloads_customer_id_fkey
Key (customer_id)=(1) is not present in table "client_access"
```

Cause racine : chaque vente/paiement pour un client (même sans application
mobile) appelait `enqueueCustomerRefresh` → 3 clichés en file. Le miroir exige
une ligne `client_access` (FK), donc **un seul client non activé bloquait toute
la poussée**, y compris les clients réellement activés.

Second écart constaté : le schéma cloud déployé était une version antérieure de
`cloud/supabase/schema.sql` — `client_access` n'avait ni `pin_salt` ni
`pin_algo`. Une activation client aurait donc échoué à la poussée
(`PGRST204`), même après correction de la file.

## Décisions

### 1. Un cliché n'existe que pour un accès mobile actif

- `hasActiveClientAccess(customerId)` (repo main) : ligne `customer_access`
  avec `revoked_at IS NULL`.
- `enqueueSnapshotAtomic` refuse explicitement
  (« Application mobile non activée pour ce client. »).
- `enqueueCustomerRefresh` / `enqueueSaleRefresh` sortent sans rien mettre en
  file si l'accès n'est pas actif : zéro bruit de journal pour les clients
  sans mobile.
- Le bouton « Synchroniser » reste dans la carte d'activation (déjà affiché
  uniquement quand l'accès est actif).
- Test de régression : `tests/database/client-access-sync.test.ts` — sans
  accès **et** avec accès révoqué, aucune ligne `sync_outbox`.

La file orpheline existante (9 clichés pour 3 clients jamais activés) a été
purgée sur le poste après sauvegarde `VACUUM INTO`
(`private/backups/veloria-before-supabase-2026-10-29.sqlite`, git-ignoré).
Ces clichés sont dérivés et régénérables : aucune donnée métier perdue.

### 2. Alignement additif du schéma cloud

Sur le projet existant, deux colonnes ajoutées sans destruction :

```sql
ALTER TABLE public.client_access ADD COLUMN IF NOT EXISTS pin_salt TEXT NULL;
ALTER TABLE public.client_access ADD COLUMN IF NOT EXISTS pin_algo TEXT NOT NULL DEFAULT 'sha256';
```

Aucune table supprimée, aucune ligne métier touchée. RLS et `REVOKE ALL`
étaient déjà en place ; `latest_client_payloads` reste `security_invoker`.

### 3. Sécurité du raccordement

- `service_role` (legacy) et URL stockés **uniquement** côté main, chiffrés
  `dpapi1:` dans `app_settings.client_sync` ; jamais renvoyés au renderer,
  jamais dans un QR, jamais dans le dépôt.
- Clé `anon` (legacy) embarquée dans le QR V2 uniquement (publique par
  conception, RLS + Edge Function).
- Fonction `client-sync` : **Verify JWT désactivé** (conforme à
  `cloud/supabase/config.toml`), car le téléphone n'est pas un utilisateur
  Supabase Auth ; la fonction vérifie téléphone + PIN elle-même.
- Secrets de la fonction : les secrets par défaut (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`) suffisent ; aucun secret custom nécessaire.

## Vérifications

- Poussée POS : `lastPushAt = 2026-10-29T21:54:55.614Z`, `lastError = null`,
  file vide.
- Test cloud complet (données temporaires, supprimées ensuite) : insertion
  `client_access` + `client_payloads` avec `service_role` → `POST
/functions/v1/client-sync` répond **200** avec le cliché → cleanup, 0 ligne
  restante.
- `npm run format:check`, `npm run lint`, `npm run check` (renderer/electron/
  manager/mobile), `npm test` **169 fichiers / 1 147 tests**.
- E2E non rejoués pour ce correctif (changement main couvert par le test de
  régression + test cloud).

## Limites

- L'activation d'un client reste une action explicite du commerçant (PIN 6
  chiffres + QR) : aucune activation automatique.
- Le plan Supabase gratuit met le projet en pause après 7 jours sans activité ;
  la poussée périodique (15 min) sert de keep-alive.
- Les clés legacy sont utilisées pour compatibilité APK/QR ; leur rotation
  éventuelle devra être répercutée dans POS et QR.
