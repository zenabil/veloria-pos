# Cloud Supabase — miroir lecture seule (V1)

Règle : SQLite du POS est le seul master. Ce dossier est jetable et reconstructible.

Contenu prévu :

- `schema.sql` — 2 tables (`client_access`, `client_payloads`) + 1 vue (`latest_client_payloads`). Aucune table `announcements` ni compteur : les annonces voyagent dans les clichés `payload_json`.
- `rls.sql` — refus par défaut : RLS activée + `REVOKE ALL`, 0 politique (seule la fonction Edge en `service_role` lit, après téléphone + PIN).
- `functions/client-sync/` — unique fonction Edge : login téléphone + PIN, invalidation sur `revoked_at`, clichés + détail (`saleId`).
- `limits.md` — rappels plan gratuit : 500 Mo base, 5 Go egress/mois, 1 Go storage, pause après 7 jours sans activité (la synchro quotidienne sert de keep-alive), pas de backup auto.

## Application propriétaire (ADR-163)

- `owner.sql` — table `owner_snapshots` (une liasse JSON par publication) :
  RLS activée, `anon` révoqué, `authenticated` lit, `service_role` écrit. Aucune
  policy d'écriture : seul le POS publie.
- Lecture : `GET /rest/v1/owner_snapshots?shop_key=eq.veloria&select=payload,generated_at&order=generated_at.desc&limit=1`
  avec `apikey: <anon>` + `Authorization: Bearer <jeton Supabase Auth>`.
- Compte : créé et modifiable depuis le POS (Paramètres → Miroir Android →
  Compte propriétaire, ADR-164), inscriptions désactivées côté Supabase.
  Config app : `EXPO_PUBLIC_OWNER_SYNC_URL` / `EXPO_PUBLIC_OWNER_ANON_KEY`
  (profil EAS `owner/eas.json`).
- Publication : le POS calcule la liasse depuis SQLite et l'insère avec la clé
  `service_role` (jamais dans l'app). Tant que le publieur n'est pas branché,
  l'app répond « Aucune liasse de supervision publiée. ».

Interdit : Realtime en V1, images/PDF, toute écriture financière depuis l'APK.
