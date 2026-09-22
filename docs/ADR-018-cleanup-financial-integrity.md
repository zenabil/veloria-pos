# ADR-018 — Nettoyage radical : morts, doublons, intégrité financière, index

Date : 2026-09-17. Statut : accepté.

Audit ligne par ligne (666 exports scannés, schéma 0001→0014 relu,
repos financiers relus, 11 tiroirs comparés, 12 écrans de raccourcis).

## Code mort supprimé (0 appelant vérifié)

- `primitives` : `PaymentMethodSelect`, `DocumentPreviewModal`,
  `PaymentMethod` + `PAYMENT_METHOD_LABELS` (leur seul consommateur était
  le composant mort ; les écrans utilisaient leurs propres copies).
- `Drawer` promu source unique (était mort car 10 copies locales).
- `debts/types` : `DebtPayment`. `proformas/types` : `ProformaItem`.
- `channels` : `IpcChannel`. `preload` : `VeloriaApi`.
- `finance.repo` : `getDailyClosing` (doublon de `listClosings`).
- `expenses.repo` : `listExpenses` (wrapper de `listExpensesUnified`).

## Doublons unifiés (zéro changement visuel sauf largeurs 420/480→440)

- 11 tiroirs (5 `DrawerShell` + 5 blocs inline + `Drawer` mort) → 1 `Drawer`
  partagé (`above`/`below`/`footer`, `sub` optionnel).
- Libellés paiement ×5 → `format.ts` (`PAYMENT_METHOD_LABELS`,
  `paymentMethodLabel`) ; `debts/dashboard/expenses/suppliers` ré-exportent
  (zéro churn consommateurs). Méthodes contraintes par Zod enum à chaque
  écriture : unification sans changement de comportement.
- `type Notify` ×27 → `primitives.Notify`. `InfoRow`/`Notify` de
  `settings/bits` supprimés (import direct depuis `primitives`).
- `CL-xxxxx` inline ×4 → `formatCustomerCode` partagé.
- F2 globale : garde `isAnyModalOpen` ajoutée (comme les 11 écrans).

## Intégrité financière (bugs réels, pas du style)

- `sales.cancelSaleAtomic` : le statut dette n'était jamais recalculé
  (solde 0 + statut `due` périmé) → même CASE que création/paiements.
- `bread.transferBreadToCustomerAccount` : `debt_status='due'` forcé →
  CASE (plafond respecté).
- `returns.createReturnAtomic` : avoir `MAX(0,…)` (centimes perdus si avoir
  > solde) → soustraction exacte + CASE ; restock sans recalcul
  > `stock_status` → CASE ; avoir sur vente au passage (perdu silencieusement)
  > → rejet explicite.
- `returns.createSupplierReturnAtomic` : dette `MAX(0,…)` → exacte ;
  décrément stock sans `stock_status` → CASE.
- `returns.cancelReturnAtomic` (2 chemins) : pas de recalcul `stock_status`
  → CASE.
- `customers.createCustomer` : `Math.max(0,…)` silencieux + statut `'none'`
  figé → validateur `min(0)` (rejet explicite) + CASE à la création.
- `suppliers.assertDeletable` : `expenses.supplier_id` (0011) et
  `supplier_returns.supplier_id` (0010) non couverts → 2 gardes FR.
- `products.PRODUCT_USAGE_TABLES` : `supplier_return_items` manquant →
  ajout (sinon erreur SQLite brute au lieu du message FR).
- `proformas.convertProformaToSaleAtomic` : `purchasePriceMinor: 0` forcé
  (marge 100 % fausse) → coût réel lu en base, 0 si article libre/supprimé.

## Base

- 0014 (nouvelle, 0001→0013 immuables) : `idx_return_items_return`,
  `idx_supplier_return_items_return` (seules FK sans index).
- Colonnes vestigiales assumées (jamais lues/écrites, suppression
  interdite) : `settlement_day`, `bread_profile_json`, `receipt_path`,
  `z_report_path`.

## Documents

- Ticket 80mm : `Livraison`, `Reste (crédit)`, `Monnaie rendue`,
  `Échéance` manquants → ajoutés (champs déjà dans `ReceiptData`).
- Facture A4 : `Échéance :` vide imprimée → conditionnelle.
- Devis : logo jamais injecté (ni `showLogo`) → même pipeline que factures
  (`proformaWithSettings`) ; mentions RC/NIF + pied légal ajoutés au A4.
- RC/NIF : la caisse ne les envoyait jamais → `withCompanyIdentity`
  (complétion main-side, meilleur effort) sur les 3 canaux facture.

## Assumé (documenté, non corrigé)

- `movement_type='adjust_out'` pour les retours fournisseurs (CHECK 0001
  figé ; un vrai type exigerait une reconstruction de table).
- Idempotence `operationId` client-générée réservée aux ventes (autres
  mutations : garde UI anti-double-clic + transactions atomiques
  single-thread, rejouables sans doublon après crash).

## Addendum — `integrity.js` contrôlait une copie périmée

La base avait été déplacée (`Paramètres > Déplacer`, `config.json` dans
`userData`) mais le script ne lisait que les emplacements par défaut :
il validait l'ancienne copie `%PROGRAMDATA%` (v13) au lieu de la base
réelle (`C:\packup`, v14). Le script lit désormais `config.json` en
priorité (`--db=` reste possible). L'ancienne copie est conservée
volontairement (sécurité, jamais de suppression auto de données).
