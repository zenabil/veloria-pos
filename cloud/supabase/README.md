# Cloud Supabase — miroir lecture seule (V1)

Règle : SQLite du POS est le seul master. Ce dossier est jetable et reconstructible.

Contenu prévu :

- `schema.sql` — 2 tables (`client_access`, `client_payloads`) + 1 vue (`latest_client_payloads`). Aucune table `announcements` ni compteur : les annonces voyagent dans les clichés `payload_json`.
- `rls.sql` — refus par défaut : RLS activée + `REVOKE ALL`, 0 politique (seule la fonction Edge en `service_role` lit, après téléphone + PIN).
- `functions/client-sync/` — unique fonction Edge : login téléphone + PIN, invalidation sur `revoked_at`, clichés + détail (`saleId`).
- `limits.md` — rappels plan gratuit : 500 Mo base, 5 Go egress/mois, 1 Go storage, pause après 7 jours sans activité (la synchro quotidienne sert de keep-alive), pas de backup auto.

Interdit : Realtime en V1, images/PDF, toute écriture financière depuis l'APK.
