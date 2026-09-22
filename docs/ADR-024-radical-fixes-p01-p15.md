# ADR-024 — Correctifs radicaux P01-P15 (idempotence, migrations, dates, sécurité)

Date : 2026-09-18
Statut : appliqué
Contexte : audit read-only (15 problèmes P01-P15).

## Décisions

1. **Migrations immuables respectées** : aucune édition de `0001..0020`.
   Nouveau `0021_idempotency_keys.sql` seul (`idempotency_keys(operation_id PK, op_type, result_json, created_at)`).
2. **P01/P05** (`sqlite.service.ts:runMigrations`) : détection suppression migration (refus explicite) + ré-affirmation `foreign_keys=ON` après chaque migration (le `PRAGMA OFF` de 0001 est no-op en transaction, mais invariant ré-affirmé).
3. **P02** (`database-path.service.ts`) : acceptation insensible à la casse `.sqlite/.vposdb` (aligné sur `security.ts`).
4. **P03** (`registry.ts:database.relocate`) : `wal_checkpoint(TRUNCATE)` + copie compagnons WAL résiduels + vérification avant swap (plus de perte de frames).
5. **P04** (`backup.service.ts:restore`) : rollback restaure aussi les compagnons du snapshot (sinon restauration partielle).
6. **P07 — idempotence généralisée** : helper `electron/ipc/handlers/idempotency.ts` (`peek/claim/store`). Réservé DANS la transaction appelante. `UNIQUE(operation_id)` tranche les courses, le perdant relit le résultat stocké.
   - Validators exigent `operationId: uuid` pour : `stock.adjust/inventory`, `returns.create/refund/cancel`, `proformas.create/convert`, `bread.create/pay/updateQty/convert`, `closings.create`, `sales.cancel` (`idempotentIdSchema`).
   - Repos réservent + stockent le résultat (`sales.cancel`, `stock.adjust/inventory`, `returns.*`, `proformas.create/convert`, `bread.create/pay/updateQty/convert`, `closings.create`).
   - Renderer génère `newOperationId()` par dialogue/soumission (Sell/History/Stock/Returns/Reports/Proformas/Bread/Products).
   - Règle AGENTS.md §4 désormais vraie pour sale/payment/stock/customer.
7. **P08** : `customers.recordPayment` n'injecte plus d'ISO datetime — `paymentDate ?? now.slice(0,10)` (businessDate).
8. **P09** : toutes les dates métier utilisent `businessDate` (calendrier réel, bissextile) au lieu de regex seule.
9. **P10** : `settingsSaveSchema` devient `discriminatedUnion` (validation upfront par clé, plus de double parse).
10. **P11** : déjà couvert par `company.repo.ts:39-54` (dossier logos + existence + `assertLogoValid`) — aucun changement.
11. **P12** : `recordCustomerPaymentAtomic` (vente liée) vérifie aussi `amount <= outstanding` (aligné sur `debt-rules.applyPaymentToBalance`).
12. **P06** (`printing.service.ts:printHtml`) : attente `did-finish-load` + tick rendu (garde-fou 1500ms max) au lieu d'un délai fixe seul.
13. **P13** : `isExternalNavigationAllowed` restreint au dev `localhost:5173` + `setPermissionRequestHandler(false)` sur les deux fenêtres.
14. **P15** : année des numéros issue de `now` métier (déterministe), retry `proforma/bread` conservé (trous acceptés, `padStart(5)` non tronquant documenté).
15. **P14** : Renderer utilise `computeLineTotal`/`roundQuantity` (`SellScreen`, `cart-store`, `ProformaDialogs`) au lieu de `Math.round` manuels.

## Conséquences

- Double-clic/retry avec même `operationId` = rejouement sûr (résultat stocké).
- Anciens clients sans `operationId` rejetés par Zod (message FR) — mise à jour renderer synchrone incluse.
- `verify-migrations` vert (21 fichiers), `typecheck` strict, tests unitaires mis à jour (UUID fixe de test).

## Fichiers

- `database/migrations/0021_idempotency_keys.sql` (nouveau)
- `electron/ipc/handlers/idempotency.ts` (nouveau)
- `electron/database/sqlite.service.ts`, `database-path.service.ts`
- `electron/ipc/validators.ts`, `registry.ts`
- `electron/ipc/handlers/sales|inventory|returns|proformas|bread|finance|customers.repo.ts`
- `electron/printing/printing.service.ts`, `security/security.ts`, `main/window-manager.ts`
- `src/features/*/Sell|History|Stock|Returns|Reports|Proforma|Bread|Product*`
- `tests/unit/returns|stock|bread.test.ts`
