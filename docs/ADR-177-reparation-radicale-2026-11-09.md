# ADR-177 — Reparation radicale post-audit (2026-11-09)

**Decision**: le tiroir suit le flux `sale_payments`, les remboursements ont un journal date, la sauvegarde ne mange plus sa source, le sync reserve avant l'envoi, la FR ne laisse plus passer d'anglais.

## 1) Flux de caisse unique

- `createDailyClosingAtomic` et `sessionFlows` somment `sale_payments` (`method='cash'`), pas `sales.created_at`.
- `cash_sales` = paiements d'especes pour ventes creees le meme jour ; `collections` = tous les autres flux d'especes (y compris reglements de factures anciennes).
- Ventes sans reglement (legacy) couvertes par repli `amount_paid - credit_applied` via `NOT EXISTS` (zero double comptage).
- Jour effectif d'un paiement : `payment_date` date-seule (jour metier) sinon jour metier de `created_at` (premiers paiements stockes en ISO).
- Refunds: `return_refund_movements` (0060) ecrit atomiquement dans `recordReturnRefundAtomic`; backfill depuis `audit_log`; repli `updated_at` pour retours sans journal (NOT EXISTS, jamais double).

## 2) Backup restore

- Copie de travail avant snapshot ; `createBackup` accepte `protectFiles` (rotation ignore la source).
- Echanges et verification depuis la copie ; original jamais supprime par la rotation.
- `backup.list/status` ne renvoient que le nom de base ; `backup.restore` resout cote main.
- `backup.autoSave` refuse licence EXPIRED (sauvegarder reste permis, reconfigurer non).
- Echecs deterministes liberent le claim (`deleteIdempotencyKey`) ; succes stocke (`storeOptional`).

## 3) Sync claim-before-send

- `tryClaimBeforeSend` avant tout POST (mirror, liasse owner, compte owner).
- Rejouement: resultat stocke -> retour ; sinon preuve locale (`lastOwnerPushAt == now` pour liasse, compte local pour owner) -> retour sans re-envoi ; sinon convergence (file upsert / conflit Auth 409-422).
- `ownerInFlight` comme `mirrorInFlight` ; `writeDocMeta` relit la doc avant ecriture (pas de lost update) ; `buildOwnerSnapshot` dans le try (S-05) ; `accessRejected` expose dans le resultat et `lastError`.

## 4) Idempotence explicite

- `status` pending/done (0061) ; `claim` insere `pending`, `store` bascule `done` ; helpers `idempotencyStatus`/`hasPendingIdempotency`.
- `returns.refund/cancel` et `templates.*` verifient le resultat apres UNIQUE (plus de retour silencieux, `cause` conservee).

## 5) Client access historique

- 0062 rebuild `customer_access` sans UNIQUE `customer_id`, index partiels actifs (client + numero), triggers `pin_algo` recrees.
- Activation = revoke ancienne ligne + insert nouvelle (historique conserve) ; `revoke` ne touche que l'active ; sync lit la plus recente.

## 6) FR strict (regle 6)

- `toUserMessage`/`frError` : `This operation was aborted` -> FR ; garde anglais generique en dernier rempart (jamais de brut a l'operateur, detail en log).
- `registry.sales` : `amountPaid > total` refuse en FR explicite.
- `PayDialog Appoint` protege ; `history-query` ESCAPE uniforme.

## Portes

`format:check` 0, `lint` 0, `typecheck` x5 0, `test` 193/1417 0 echec, `verify` OK, `knip` 0, `build` OK.
