# ADR-052 — Emplacement du chantier client : dossiers neufs, POS intact

Date : 2026-09-29
Statut : accepté (V1)

## Contexte

Il faut construire le relais cloud + l'APK sans polluer le POS (dépendances mobiles interdites dans le renderer Electron, règle n°2 : jamais d'import Electron/Node/SQLite côté renderer).

## Décision

- Nouveau code uniquement dans deux dossiers neufs à la racine :
  - `cloud/supabase/` : `schema.sql`, `rls.sql`, `functions/customer-login/`, `README.md`, `limits.md`.
  - `mobile/` : `tokens/`, `i18n/` (ar/fr), `screens/` (5 onglets), `cache/`, `README.md`.
- Le POS n'est touché que par sa tranche verticale : migration `0032` (`customer_access` + `sync_outbox` + `announcements`), cas d'usage purs framework-free, dépôts à requêtes préparées, canaux IPC explicites `customers.access.*` + `sync.*` validés Zod, boutons commerçant en français.
- Le domaine pur existant (`money`, `debt-rules`, `credit-policy`, formatters) est réutilisé tel quel dans `mobile/` par copie versionnée, jamais réécrit.
- Interdit : dépendance Expo/RN dans `package.json` du POS, import croisé `mobile → electron`, stockage métier dans un `localStorage` du POS.

## Conséquences

- Revues par tranche : UI → cas d'usage → domaine → dépôt → migration → test.
- Après tout changement structurel : `format → typecheck → tests → build` + `verify-migrations` vert.

## Vérification

- Cet ADR ne crée que des dossiers + README. Aucune migration, aucun canal IPC ajoutés ici.

## Addendum 2026-09-30 — approche constatée (écart assumé)

- Aucune copie versionnée n'a été placée dans `mobile/` : les règles
  (`assertCredentials` PIN 6 chiffres, statuts de dette, centimes, garde
  200 Ko) sont **réimplémentées et testées** côté APK
  (`mobile/src/api|tokens|format|views`, `tests/unit/mobile-*.test.ts`),
  avec parité comportementale vérifiée (mêmes bornes, mêmes codes d'erreur).
- Divergences connues et acceptées : formatage montants (`formatMinor` APK :
  espace insécable + `دج/DZD`, testé) vs `formatDzd` POS (`Intl fr-FR`) ;
  `debtTone` dupliqué dans `tokens.ts` (mêmes seuils, testé).
- Règle : toute évolution d'une borne métier (PIN, verrou 5/5min, statuts)
  doit changer les deux côtés + leurs tests le même jour.
