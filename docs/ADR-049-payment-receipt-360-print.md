# ADR-049 — Reçu historique à soldes reconstitués + 360 chaque-ligne-ouvre-imprime

> Statut : accepté (Phase 3, P1-1). Fichiers : `src/domain/customer/payment-receipt.ts`, `electron/ipc/handlers/customers.repo.ts`, `electron/ipc/channels.ts`, `registry.ts`, `validators.ts` (réutilise `idSchema`), `preload.ts`, `src/shared/types/ipc-client.ts`, `src/vite-env.d.ts`, `src/features/customers/ClientDialogs.tsx`.

## Contexte

`sale_payments` ne stocke pas les soldes avant/après : un reçu historique réimprimé avec des soldes inventés serait une donnée fausse (interdit zero-tolerance). Les onglets 360 Paiements/Retours/Dettes/Historique n'avaient de boutons ouvrir/imprimer que sur Factures.

## Décision

- Règle pure `computePaymentReceiptBalances` (`src/domain/customer/payment-receipt.ts`) : grand-livre (initial + ventes non annulées − paiements, ordre `createdAt`, ventes avant paiements à égalité, `id` en départage), centimes entiers, `null` si cible introuvable/invalide. Miroir local côté main (`computeReceiptBalancesInline`, frontière main/domaine comme `isRealCalendarDate`).
- Canal lecture seule `customers.paymentReceipt({id})` (`idSchema`, pages `customers+debts`) : résout le client (direct ou via la vente), relit ventes+paiements (500 max, ASC), refuse `newMinor < 0` (« soldes incohérents », jamais imprimé).
- 360 : Paiements → `Facture` (vente liée, `InvoicePreviewModal`) + `Reçu` (`paymentReceipt` → `PaymentTicketModal`, vraies balances) ; Retours → `Bon` (`returnDetail` → lignes retotalisées `round(prix×qté)` → `returnSlipPreview` → modale A4/80mm → `returnSlipPrint`) ; Dettes (`debt_type customer` = vente, cf. `finance.repo.ts:53`) → `Facture` ; Historique (`sale` → `Ouvrir`, `payment_in` = `sale_payments.id` → `Reçu`). Lignes d'audit sans document (stock/produit/créations) : aucune action (pas de faux document).
- Paiement A4/80mm : QR ajouté (`VELORIA|réf|montant|date` + SVG N&B) ; devis : vendeur + TVA + QR (texte + A4) ; page de test thermique : largeur configurée mentionnée.

## Conséquences

- Tests : `payment-receipt.test.ts` (4, pur) + `tests/integration/payment-receipt.test.ts` (miroir `node:sqlite` réel).
