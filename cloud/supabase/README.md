# Cloud Supabase — miroir lecture seule (V1)

Règle : SQLite du POS est le seul master. Ce dossier est jetable et reconstructible.

Contenu prévu :

- `schema.sql` — 4 tables aplaties lecture seule (dette, factures, détail à la demande, paiements) + `announcements` + compteur d'ouvertures.
- `rls.sql` — isolation stricte par `customer_id`, tests d'isolement A/B.
- `functions/client-sync/` — unique fonction Edge : login téléphone + PIN, invalidation sur `revoked_at`, clichés + détail (`saleId`).
- `limits.md` — rappels plan gratuit : 500 Mo base, 5 Go egress/mois, 1 Go storage, pause après 7 jours sans activité (la synchro quotidienne sert de keep-alive), pas de backup auto.

Interdit : Realtime en V1, images/PDF, toute écriture financière depuis l'APK.
