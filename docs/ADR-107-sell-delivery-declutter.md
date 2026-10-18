# ADR-107 — Caisse : allègement + livraison end-to-end

## Contexte

Audit page Vente : bouton son en double écriture (bandeau vs `Paramètres →
Sons`), bloc montant+moyen dupliqué (`PayDialog`/`SettleDialog`), regex
échéance dupliquée, wrapper `fetchBalance` à usage unique, quantité FR à
virgule ignorée, et surtout frais de livraison supportés partout
(use-case + IPC + CHECK SQL) sauf à la caisse (`deliveryFeeMinor: 0`
soudé en 3 points, aucun champ UI, aucune persistance brouillon).

## Décisions

- Son : bouton `SellTabsBar` supprimé, `Paramètres → Sons` fait foi
  (source unique, fin de la double écriture) ; `soundOn` retiré de
  `useSellState` ; hint obsolète corrigé.
- `AmountMethodFields` partagé (`sell/`) pour les deux dialogues (labels
  FR inchangés) ; `PayDialog` utilise `isValidDueDate` (source unique) ;
  `fetchBalance` replié dans `sell-settle.ts` ; quantité FR à virgule
  acceptée (`CartPanel`).
- Livraison end-to-end : champ `Livraison (DZD)` dans `SellTotalsPanel`
  (texte → centimes `strictOrNeg`, borné `[0, 1e9]`, par onglet, rechargé
  au changement d'onglet comme `paidText`) → `totalsOf` → `finalize`
  (`d.cart.deliveryFeeMinor`) → ticket (`deliveryMinor`) → brouillon
  (`cart_drafts.delivery_fee_minor`, migration 0044) → vente.
- Migration 0044 : `ADD COLUMN ... DEFAULT 0 CHECK (>= 0)` (non-destructif,
  rejouable) ; `verify-migrations` étendu (colonne + CHECK + défaut).

## Conséquences

- Total = lignes − remise + livraison partout (panier, onglets, ticket,
  brouillon rechargé, DB) ; centimes entiers garantis par les gardes
  existantes (`moneyMinor`, `assertSafeMinor`, CHECK).
- Aucun changement aux mutations existantes (montants 0 = comportement
  identique).

## Fichiers affectés

- `database/migrations/0044_cart_drafts_delivery.sql` (nouveau),
  `scripts/database/verify-migrations.mjs` (+bloc 0044)
- `electron/ipc/handlers/carts.repo.ts`, `electron/ipc/validators.sales.ts`
- `src/features/sales/cart-store.ts`, `src/features/sales/sell/cart-drafts.ts`,
  `src/features/sales/sell/useSellState.ts`,
  `src/features/sales/sell/SellTotalsPanel.tsx`,
  `src/features/sales/SellScreen.tsx`,
  `src/features/sales/sell/sell-finalize.ts`,
  `src/features/sales/sell/sell-totals.ts` (`tabTotalOf`, snapshot),
  `src/features/sales/sell/SellTabsBar.tsx`,
  `src/features/sales/sell/PayDialog.tsx`,
  `src/features/sales/sell/SettleDialog.tsx`,
  `src/features/sales/sell/AmountMethodFields.tsx` (nouveau),
  `src/features/sales/sell/sell-settle.ts`,
  `src/features/sales/sell/sell-search.ts` (−`fetchBalance`),
  `src/features/sales/sell/CartPanel.tsx`,
  `src/features/settings/SettingsSectionsA.tsx`
- Tests : `tests/unit/cart-drafts.test.ts`,
  `tests/unit/sales/sell-split.test.ts`,
  `tests/integration/cart-delivery-fee.test.ts` (nouveau)
