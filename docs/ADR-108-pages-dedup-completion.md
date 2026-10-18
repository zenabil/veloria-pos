# ADR-108 — Pages : déduplication et complétion (vague 1)

## Contexte

Audit 17 pages : zéro page à supprimer, mais doublons fonctionnels et
trous CSV. Vague 1 (cette ADR) : doublons à validation unique + exports
manquants + filtre mort. Différé (vague 2) : découpe `OcrImportDialog`
(1174 lignes, saine fonctionnellement), split `SellOverlays`, focus-trap
menu Stock, liens profonds Dettes→fiches, aperçu pré-import CSV produits.

## Décisions

- Ajustement stock Catalogue → use-case `buildAdjustStockPayload`
  (kind `set`, valeur absolue) : mêmes règles que le dialogue Stock
  (operationId, bornes, motif ≤ 300) sans déplacer d'UI (règle A3 :
  aucun import inter-features).
- Rapports : 5 sections-coquilles supprimées (chiffres déjà en KPI) ;
  tableau `Dettes clients` trompeur (top acheteurs) supprimé — KPI + renvoi
  Dettes conservés. Clôtures Z conservées (acte de pilotage quotidien).
- Dashboard : `Vigilance` réduite à l'inédit (pain + système) ; stock et
  échéances déjà détaillés au-dessus.
- Historique : filtre/colonne/CSV `Poste` supprimés (mono-poste, `user`
  ignoré côté main — `history-query.ts` sans référence, registre ne le
  transmet pas) ; schéma Zod allégé en conséquence.
- Imprimante : `PrinterCard` partagée (`src/shared/printer/`) — source
  unique d'écriture/lecture (Paramètres complets : silent + hardware ;
  Studio : sélection + test). Écritures unifiées via `settingsSave`.
- Livraison end-to-end (trou UI→DB comblé) : champ `Livraison (DZD)` dans
  `SellTotalsPanel` (texte → centimes `strictOrNeg`, `[0, 1e9]`, par onglet)
  → `totalsOf` → `finalize` → ticket → brouillon
  (`cart_drafts.delivery_fee_minor`, migration 0044) → vente.
- Exports CSV ajoutés : Clients, Fournisseurs, Devis, Pain + Dettes global
  (filtré) — même helper `downloadCsv` (BOM, anti-injection).
- Zakat : vérifié conforme (aperçu étiqueté hors caisse/banque + saisie
  dialogue documentée) — aucune modification.

## Conséquences

- Aucun changement métier/DB existante ; FR-only et offline-first inchangés.
- `historyListSchema` perd le champ `user` (inutilisé côté main).

## Fichiers affectés

- `database/migrations/0044_cart_drafts_delivery.sql` (nouveau),
  `scripts/database/verify-migrations.mjs` (+bloc 0044),
  `electron/ipc/handlers/carts.repo.ts`, `electron/ipc/validators.sales.ts`
- `src/features/sales/cart-store.ts`, `src/features/sales/sell/cart-drafts.ts`,
  `src/features/sales/sell/useSellState.ts`,
  `src/features/sales/sell/SellTotalsPanel.tsx`,
  `src/features/sales/SellScreen.tsx`, `src/features/sales/sell/sell-finalize.ts`,
  `src/features/sales/sell/sell-totals.ts`
- `src/features/products/dialogs/DetailsDrawer.tsx`,
  `src/features/reports/ReportsScreen.tsx`,
  `src/features/dashboard/DashboardScreen.tsx`,
  `src/features/history/HistoryScreen.tsx`, `src/features/history/types.ts`,
  `electron/ipc/validators.finance.ts`,
  `src/shared/printer/PrinterCard.tsx` (nouveau),
  `src/features/settings/SettingsSectionsB.tsx` (−`PrintingSection` impl),
  `src/features/print-templates/PrintTemplatesScreen.tsx`,
  `src/features/debts/DebtsScreen.tsx`,
  `src/features/customers/ClientsScreen.tsx`,
  `src/features/suppliers/SuppliersScreen.tsx`,
  `src/features/proformas/ProformasScreen.tsx`,
  `src/features/bread/BreadScreen.tsx`
