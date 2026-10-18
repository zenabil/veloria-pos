# ADR-098 — Idempotence P0 : bons fournisseurs + import OCR (clés figées + garde synchrone)

- Statut : accepté (2026-10-15)
- Contexte : audit radical — double-submit à effet financier réel (load-bearing)
- Décideur : Staff Engineer (audit P0)

## Contexte

`src/features/suppliers/SupplierPOsDialog.tsx:311-314,355-358,387-398` et
`src/features/stock/OcrImportDialog.tsx:585,605` généraient `newOperationId()`
**inline dans chaque handler** : chaque appel = NOUVELLE opération acceptée par
le main (la dédup `purchases.repo.ts:63-136` / `inventory.repo.ts:169-186` ne
tranche qu'à `operationId` égal). Combiné à l'absence de garde synchrone
(`setBusy(true)` seul, state async — le double-clic même tick passe), un
double-clic créait **2 commandes / 2 réceptions / produits dupliqués**.

C'est le seul double-submit à effet financier réel du renderer : vente/stock
figent déjà leurs UUID (`sell-finalize.ts:155`, `IntakeDialog.tsx:84`),
`PaymentDialog`/`DebtPaymentDialog`/retours utilisent `useOperationId`
(ID figé → backend déduplique).

## Décision

1. **Clé figée par action** via `useOperationId()` (`src/shared/ui/use-operation-id.ts`) :
   - `SupplierPOsDialog` : 4 clés (`createOp`, `orderOp`, `cancelOp`, `receiveOp`)
     — une par type d'opération car `idempotency_keys.operation_id` est UNIQUE
     globale (`electron/ipc/handlers/idempotency.ts:42-47`) et
     `peekIdempotency` refuse la réutilisation inter-workflows (DB-03,
     `idempotency.ts:17-19`). `order`/`cancel` ne partagent PAS une clé.
   - `OcrImportDialog` : 1 clé import (`stock.intake`) + 1 clé figée par ligne
     (`productOpIds: Map<rowKey, UUID>`, vidée à chaque nouvelle analyse) pour
     la boucle `productCreate` (sinon retry = produits dupliqués malgré
     `products.operation_id` UNIQUE).
2. **Garde synchrone** (`useRef<boolean>`) en tête de chaque handler mutatif —
   le state `busy`/`importing` est async et ne couvre pas le même tick
   (modèle : `sell-finalize.ts:155` `finalizeGuard`).
3. **`regen()` après chaque succès** : l'opération suivante est une NOUVELLE
   opération (sinon le 2e `purchase.create` avec le même ID rejouerait
   l'ancienne commande au lieu d'en créer une — prouvé par le test
   « operationId différent = nouvelle commande »).
4. **Échec = conservation de la clé** : le claim est annulé avec la tx
   (rollback), le retry rejoue donc la MÊME opération (prouvé par le test
   rollback → retry réussit).

## Conséquences

- Aucun changement backend : les repos dédupliquaient déjà correctement.
- Aucune migration (aucun changement de schéma).
- Test de non-régression : `tests/integration/purchase-idempotency.test.ts`
  (5 tests : create replay = 1 commande, ID différent = 2 commandes,
  order/cancel replay = 1 transition chacun, receive replay = 1 intake +
  stock +1×, rollback + retry même ID réussit).
- Dette restante (P1) : `PaymentDialog`/`DebtPaymentDialog`/`NewCustomerReturnDialog`
  ont un ID figé mais pas de garde synchrone — double ticket/notify possible,
  pas de double effet financier (backend déduplique). À uniformiser.
