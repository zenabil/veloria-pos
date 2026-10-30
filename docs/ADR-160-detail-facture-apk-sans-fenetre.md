# ADR-160 — Détail de facture APK : poussée à la vente/paiement et lecture miroir sans fenêtre

- **Date** : 2026-10-30
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : repo main (`electron/sync/sync.service.ts`,
  `electron/ipc/registry.sales.ts`, `electron/ipc/registry.customers.ts`,
  `electron/ipc/handlers/customers.repo.ts`), rendu (`ClientMobileAccess`),
  fonction Edge `client-sync` + schéma miroir (`cloud/supabase/`), relais E2E.
  Aucune migration SQLite, aucun canal IPC, aucune donnée financière réécrite.

## Contexte

La page détail de l'APK client lit un cliché `invoice_detail` poussé par le POS
(POS → Supabase, lecture seule). Deux défauts cumulés rendaient des factures
définitivement muettes côté client :

1. **Producteur incomplet.** `sales.create` ne mettait en file que
   `customer_snapshot`, `invoice_list` et `payment_list` ;
   `enqueueSaleRefresh` (qui pousse aussi `invoice_detail`) n'était appelé
   qu'à l'annulation/réouverture et pour un paiement lié à `saleId`. Toute
   facture créée après l'activation de l'accès n'avait donc **aucun** cliché
   de détail. Un encaissement standalone ventilé FIFO (ADR-159) ne poussait
   pas non plus le détail des factures soldées.
2. **Lecture bornée.** La fonction Edge ne cherchait le détail que dans les
   **50 derniers** clichés `invoice_detail` du client (`DETAIL_SCAN_LIMIT`) ;
   au-delà, la facture répondait 404 même si son détail existait.

Symptôme : « التفاصيل غير متوفرة — اطلب من المحل المزامنة » (404) à
l'ouverture d'une facture, sans qu'une nouvelle synchronisation ne corrige
jamais une facture payée sortie de la fenêtre.

## Décision

### 1. Le détail part à chaque mutation de facture

- `sales.create` → `enqueueSaleRefresh(result.saleId)` (listes + détail)
  quand la vente a un client.
- `customers.recordPayment` → `enqueueSaleRefresh` pour un paiement lié ;
  pour un encaissement standalone, `recordCustomerPaymentAtomic` retourne
  `allocatedSaleIds` et la file pousse **le détail de chaque facture
  ventilée** (`enqueueInvoiceDetailRefresh`), sans dupliquer les trois
  clichés de listes (un seul `enqueueCustomerRefresh`).
- `enqueueSaleRefresh` reste la voie unique : elle résout le client de la
  vente, vérifie l'accès mobile actif et pousse listes + détail.

### 2. Lecture miroir directe, sans fenêtre

La fonction Edge filtre `client_payloads` sur
`customer_id = client AND kind = 'invoice_detail' AND payload->sale->>id = saleId`
(PostgREST JSON path), trie par `id DESC` et prend le premier. Une facture
ancienne reste consultable tant que son cliché existe. Un index d'expression
partiel (`idx_client_payloads_customer_sale`) est ajouté au schéma miroir pour
rester O(log n) quand un client accumule des milliers de clichés.

Le relais E2E (`scripts/e2e-mirror-relay.mjs`) applique la même règle : plus
de `DETAIL_SCAN_LIMIT`, parité stricte avec la production.

### 3. Backfill manuel complet

Le bouton « Synchroniser » de la fiche client pousse désormais le détail de
**toutes** les factures du relevé (borné à 100 ventes par
`getCustomerStatement`), au lieu des 10 plus récentes : une facture payée
hors fenêtre n'est plus un cul-de-sac.

## Conséquences

- Toute nouvelle facture client et tout paiement (lié ou ventilé) rendent le
  détail consultable après la poussée automatique (intervalle configuré).
- Les factures historiques sans cliché restent invisibles jusqu'à une
  synchronisation manuelle — aucun backfill automatique de masse n'est lancé.
- Coût miroir : un cliché `invoice_detail` par mutation de facture (les
  clichés restent append-only, `UNIQUE operation_id`) ; l'index évite un
  balayage complet.
- **Déploiement requis** : la fonction Edge doit être redéployée (console
  Supabase, « Verify JWT » reste désactivé) et l'index appliqué au projet
  existant. Le code déployé n'est pas synchronisé automatiquement depuis le
  dépôt.

## Alternatives écartées

- **Augmenter `DETAIL_SCAN_LIMIT`** (ex. 500) : repousse le 404 sans le
  supprimer et alourdit chaque ouverture de facture.
- **Vue miroir `latest_invoice_details` + requête dédiée** : nécessite une
  migration de schéma cloud et un second chemin de lecture, pour un gain nul
  sur la correction (le filtre JSON utilise le même index).
- **Backfill automatique de toutes les factures** : egress/DB inutiles sur le
  plan gratuit ; le bouton « Synchroniser » couvre le besoin à la demande.

## Tests

- `tests/integration/client-sync-queue.test.ts` (base migrée réelle, service
  de file exécuté) : une vente pousse listes + détail ; le détail seul ne
  duplique pas les listes ; accès révoqué = aucun cliché.
- `tests/integration/customer-payment-fifo.test.ts` : `allocatedSaleIds`
  expose les factures ventilées (et reste vide au rejeu idempotent).
- Suite complète : 171 fichiers / 1 158 tests verts ; `build` et
  `build:electron` (manifeste signé 243) verts.
