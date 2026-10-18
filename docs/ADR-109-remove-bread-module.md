# ADR-109 — Suppression du module Pain (bread)

## Contexte

Demande produit : retirer la page `Pain` (commandes boulangerie prix
subventionné) et tout son périmètre applicatif. 16 modules restants.

## Décision

Suppression complète du code, en une passe verticale :

- Supprimés : `src/features/bread/*`, `src/domain/bread/*`,
  `electron/ipc/handlers/bread.repo.ts`, 10 canaux `bread.*` (channels,
  preload, registre, validateurs, credit-gates, staff-gates), `bread`
  de `PaymentTicketKind`, du kind `payment-preview`, du `PaymentTicketInput`,
  de `formatBreadOrderNumber`, du `dashboard.summary`, de la vigilance,
  de `MODULE_PAGES`/`ModuleId`/`LAZY_SCREENS`/footer-hints, des tests
  (`bread.test.ts`, `bread-atomic.test.ts`, blocs bread des tests
  frontières/parité/idempotence/tickets/règles) + snapshot canaux.
- Conservés (compatibilité, zéro migration destructive) :
  - tables/colonnes `bread_orders` (migrations 0012/0016/0024 immuables,
    contrôles `verify-migrations` + tests schéma inchangés) ;
  - pages licence `pain`/`breadOrders` (licences déjà émises : payload
    partiel = refus, on ne casse jamais une licence émise) ;
  - colonne `customers.is_bread_client` + champ Zod (métadonnée inerte,
    aucune UI) ;
  - vecteurs `ORDER BY` ex-bread dans `sql-guard.test.ts` (garde générique).

## Conséquences

- 16 modules, 183 canaux IPC ; aucune écriture `bread_orders` possible
  (plus aucun canal/handler).
- Données historiques `bread_orders` lisibles en base mais non exposées.

## Fichiers affectés

Voir `git status` : 7 suppressions + ~30 excisions (shell, bridge,
validators, printing, finance.repo, retention, tests, snapshot).
