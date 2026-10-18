# ADR-111 — Attribution des opérations par utilisateur (R2 radical)

Date : 2026-10-16. Contexte : audit rôles/permissions (P0 : `zakat.save*`, `carts.save`,
`sync.enqueue/markSent/pushNow` non mappés ; P1 : permission `users` sans effet ;
P2 : session sans timeout, `must_change_code` contournable par IPC direct).

## Décision

1. **Migration 0046** (`database/migrations/0046_staff_attribution.sql`) : colonne
   `staff_user_id INTEGER NULL REFERENCES staff_users(id) ON DELETE SET NULL` +
   index sur 7 tables d'opérations (`sales`, `sale_payments`, `supplier_payments`,
   `expenses`, `returns`, `stock_intakes`, `stock_movements`). Historique pré-0046
   (`NULL`) visible par le gérant uniquement. `audit_log.actor_user_id` renseigné
   sur `sale.created`, `expense.created`, `return.created`, `stock.adjusted`,
   `stock.inventory`, `supplier.payment`.
2. **Filtrage par auteur** (gérant = tout, utilisateur = ses opérations) :
   `dashboard.summary`, `reports.summary`, `history.list/detail/stats`,
   `sales.history/get`. Instantanés de comptes (dettes, stock) restent globaux.
3. **Gates complétées** (`staff-gates.ts`) : `zakat.save*→settings`,
   `carts.save→sales`, `sync.enqueue/markSent/pushNow→settings`.
4. **Permission `users` effective** : `requireUserManagement` (au lieu du verrou
   rôle-seul) + anti-escalade (seul un gérant crée un gérant, délègue `users`,
   touche un compte gérant, régénère le secours). UI `UsersAdmin` accessible aux
   porteurs de `users`, leviers gérant masqués.
5. **Session** : timeout 30 min d'inactivité (`staff-session.ts`), `touch` dans
   `handle()`, verrou `must_change_code` côté main (allowlist :
   `staff.changeCode/session/logout`).
6. **Visibilité modules** (`App.tsx`) : tableau de bord / historique / rapports
   toujours visibles (données filtrées) ; zakat / impression / paramètres /
   licence exigent `settings`.

## Conséquences

- Nouveau `operationId`/`transaction` inchangés ; aucune migration 0001..0045 retouchée.
- Lignes historiques sans auteur invisibles aux utilisateurs (choix fail-closed).
- `verify-migrations` vert, typecheck vert, 58 tests ciblés verts
  (staff, history, dashboard, reports, documents, ipc, purchase, cancelled-payments).

## Alternatives rejetées

- Filtrage via `audit_log` seul : couverture incomplète (audits sans acteur).
- `users` = rôle gérant bis : écarté, anti-escalade explicite préférée.
- Blocage lecture dashboard/historique/rapports par permission : écarté, le besoin
  est la visibilité périmétrée, pas le masquage.
