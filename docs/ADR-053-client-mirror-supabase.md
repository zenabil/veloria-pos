# ADR-053 — Application client lecture seule : Supabase comme miroir, SQLite comme master

Date : 2026-09-29
Statut : accepté (V1, 40 clients, lecture seule, 0 $)

## Contexte

Demande : APK clients pour voir factures et dettes, extensible plus tard.
Contrainte `AGENTS.md` n°1 : SQLite (`Veloria POS DB.sqlite`) seule source métier. Google Sheets rejeté (pas d'isolation par client, pas de transactions, quotas). Écriture financière depuis le téléphone refusée en V1.

## Décision

- SQLite reste le seul master. Le cloud n'est qu'un miroir jetable, reconstructible à tout moment depuis le POS.
- Supabase Free : 3 vues aplaties lecture seule (dette, factures, paiements + détail à la demande), RLS stricte par `customer_id`, une seule Edge Function `customer-login(phone, pin)`.
- Pas de Realtime en V1, pas de Storage d'images, payload d'ouverture < 50 Ko. Détail facture chargé uniquement au clic.
- Clé d'écriture (`service_role`) uniquement dans `electron/main`. L'APK n'utilise que la clé `anon` + RLS.
- Poussée depuis le POS : manuelle (bouton « Synchroniser ») + automatique après vente/paiement, avec le même `operationId` pour l'idempotence. La synchro quotidienne sert aussi de keep-alive contre la pause après 7 jours d'inactivité (limite du plan gratuit : 500 Mo base, 5 Go egress/mois, 1 Go storage, pas de backup auto — acceptable car le backup reste le SQLite local).
- Montants toujours en centimes calculés côté POS. L'APK affiche, ne calcule jamais la finance.

## Conséquences

- Deux systèmes de migrations à tenir alignés (SQLite immutable + schéma Supabase), à documenter dans le rapport de phase.
- Toute écriture future (commandes, preuves de paiement, fidélité avec remise) passera par des `*_intent` validés côté POS, jamais en écriture directe. V2 uniquement.
- Test d'isolement obligatoire : client A ne lit jamais client B.

## Vérification

- Aucun code métier touché par cet ADR. Prochaines étapes : migration `0032` + canaux IPC explicites + schéma `cloud/supabase/`.
