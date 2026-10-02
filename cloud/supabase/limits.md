# Limites du plan gratuit — budgets V1 (40 clients, lecture seule)

Source : page tarifaire Supabase (plan Free, 2026). Chiffres à revérifier
avant la mise en production, le gratuit évolue vite.

## Plafonds

- Base : 500 Mo. Usage V1 estimé : 40 clients × ~200 factures/an × ~1 Ko +
  clichés ≈ 10 Mo/an. Marge de plusieurs années.
- Egress : 5 Go/mois. Usage estimé : 40 × 30 synchros × 50 Ko ≈ 60 Mo/mois
  (1 %). Règle d'or : synchro complète au login + détail à la demande
  uniquement, jamais de polling, pas de Realtime en V1.
- Invocations Edge : 500 000/mois. Usage : ~1 200/mois. Marge énorme.
- Stockage : 1 Go — inutilisé en V1 (aucun PDF/image).
- Utilisateurs : fonction `client-sync` sans Supabase Auth (vérification
  téléphone + PIN côté serveur, clé `anon` inutile) : 0 MAU consommé.
- Projets actifs : 2 max (1 prod suffit ; staging local via `node:sqlite`).
- Pas de backup auto sur le gratuit : accepté, le SQLite du POS est le
  backup et le miroir est reconstructible depuis `sync_outbox`.

## Pause après 7 jours sans activité

Un projet Free sans requête pendant 7 jours se met en pause (données
conservées, réactivation manuelle). Contre-mesure V1 gratuite : la
synchronisation quotidienne depuis le POS compte comme activité et empêche
la pause en pratique. Si le magasin ferme > 7 jours (vacances), prévoir
une réactivation manuelle au retour + message APK « magasin hors ligne ».

## En cas de dépassement

Le dépassement coupe en lecture seule / 402 côté API. L'APK doit déjà
gérer cela : النسخة locale + bandeau « données du … ». Le POS ne perd
jamais rien (master local). Seuil d'alerte : visibilité mensuelle du
dashboard Supabase (egress + taille base).
