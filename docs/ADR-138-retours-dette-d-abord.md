# ADR-138 — Retours clients : la dette d'abord, les espèces pour l'excédent

Date : 2026-10-25. Statut : **accepté** (décision propriétaire, session 41).

## Contexte

L'audit du module Retours a prouvé trois défauts financiers :

- le retour restockait la marchandise mais ne corrigeait le solde du client que
  si l'opérateur saisissait **manuellement** un « Avoir client » ; un
  remboursement en espèces sur une vente à crédit laissait donc la dette
  intacte ;
- le crédit ne pouvait pas être appliqué après la clôture du jour de la vente
  (trigger 0048), et l'augmentation de `sales.amount_paid_minor` faisait
  apparaître le crédit comme des **espèces** dans la clôture Z ;
- la valeur d'un retour utilisait le prix unitaire catalogue (avant remise) et
  la **première** ligne du produit, au lieu du net réellement facturé
  (`line_total_minor`) de la ligne choisie.

Décision propriétaire du 2026-10-25 : **خصم تلقائي من الدين أولًا** — la valeur
du retour éteint d'abord la dette, les espèces ne couvrent que l'excédent.

## Décision

1. **Imputation automatique** : `creditApplied = min(valeur nette du retour,
solde dû du client)`. Aucun avoir manuel n'est plus demandé.
2. **Allocation** : la vente d'origine d'abord, puis les autres ventes ouvertes
   du client (les plus anciennes). Une vente d'un jour déjà clôturé n'est
   **jamais** modifiée (trigger 0048) : sa part devient un **crédit non affecté**
   porté par le compte client (`customer_credit_allocations.sale_id NULL`).
3. **Espèces** : plafonnées à `valeur − crédit imputé`. Une demande supérieure
   est **refusée** avec un message FR (aucun clamp silencieux).
4. **Non-cash** : `sales.credit_applied_minor` trace la part non monétaire du
   « payé ». Le CHECK `remaining = total − paid` reste respecté (les deux
   colonnes augmentent du même montant). La clôture Z, la zakat et
   `v_daily_sales` excluent cette part des espèces.
5. **Statut du retour** : `returns.credit_to_customer_minor` stocke le crédit
   **réellement imputé** ; le statut et le « reste à régler » sont calculés
   dessus.
6. **Valeur nette et ligne exacte** : le retour porte `saleItemId` ; la valeur
   est `line_total_minor × qté retournée / qté vendue` (plafonnée au reste de
   la ligne). `return_items.sale_item_id` permet une éligibilité **par ligne**
   (deux lignes du même produit ne se mélangent plus).
7. **UI** : dette actuelle et dette après retour affichées ; avoir calculé en
   lecture seule ; espèces préremplies avec l'excédent ; champ désactivé si le
   plafond est 0.
8. **Licence** : `debt-management` est exigée dès qu'un retour concerne un
   client ayant une dette (le champ historique `creditMinor` n'est plus la
   source de vérité).

## Migration 0055 (`0055_return_credit_allocations.sql`)

- `sales.credit_applied_minor` + triggers `0 <= crédit <= payé` ;
- table `customer_credit_allocations` (retour, client, vente nullable, montant,
  date) + index + triggers d'appartenance et de plafond ;
- `return_items.sale_item_id` + index ;
- recréation de `v_customer_balance_check` (soustrait les crédits non affectés)
  et de `v_daily_sales` (`paid_minor` hors crédit).

Aucune migration 0001-0054 n'est modifiée (règle 12).

## Conséquences

- Le solde client, la vente d'origine et les autres ventes ouvertes sont
  corrigés dans la **même transaction** que le retour, le stock et le FIFO.
- Un retour sur une vente d'un jour clos réussit sans réouverture : le crédit
  est non affecté et le compte client reste juste (`v_customer_balance_check`
  le prouve).
- Les anciennes données restent valides (`credit_applied_minor` = 0).
- Tests : `returns-auto-settlement` (7 cas : cash sur dette, multi-factures,
  jour clos, Z, remise, lignes multiples, idempotence), `w1-money-atomicity`
  adapté, parité domaine/main, vérification 0055 dans `verify-migrations`.
- **Reste ouvert (hors décision)** : `Rapports` (hors Dashboard) affiche
  encore des ventes/marges **brutes** ; les remboursements complémentaires
  n'ont pas de date de paiement propre pour le Z ; un crédit non affecté n'est
  pas encore matérialisé par une ligne dédiée dans le tiroir client.

## Alternatives écartées

- **Avoir manuel conservé** : laisse le caissier produire un remboursement
  espèces tout en conservant la dette (le défaut constaté).
- **Refus de tout remboursement espèces sur dette** : plus sûr mais bloque le
  cas légitime où le retour dépasse la dette.
- **Suppression immédiate du solde matérialisé `customers.outstanding`** (Q7) :
  refonte plus large (5 écrans + APK + plafond de crédit) hors du périmètre de
  cette correction ; la double écriture reste alignée et la vue de diagnostic
  détecte toute dérive.

## Références

- Audit intégral 2026-10-19 : E-23 (avoir > solde), E-24 (deux dettes),
  Q6 (avoir en cours), Q7 (source de vérité de la dette).
- `electron/ipc/handlers/returns.repo.ts`, `return-settlement.ts`,
  `finance.repo.ts` (Z/zakat), `src/features/returns/`,
  `database/migrations/0055_return_credit_allocations.sql`.
