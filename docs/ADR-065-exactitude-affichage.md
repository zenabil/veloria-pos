# ADR-065 — Exactitude des informations affichées (passe écrans 2026-10-04)

## Contexte

Audit du flux `Screen → window.veloria → canal IPC → repo SQL → formatage`
sur les 17 modules : montants bruts (centimes non convertis), codes EN bruts,
libellés KPI contredisant la requête, crash `formatDzd` sur valeurs négatives.

## Décisions

1. **Deux grains dette coexistent, les deux vrais** : `sales.remaining`
   (document) vs `customers.outstanding` (compte, avoirs inclus,
   `v_customer_balance_check` 0003). Aucune logique argent changée
   (gardes `recordCustomerPaymentAtomic` rendent l'avoir sûr) : on distingue
   les libellés — « Reste factures / Documents ouverts » vs
   « Solde global clients (avoirs inclus) ». Imputer l'avoir sur
   `sales.remaining` = décision produit future, pas ce passe.
2. **Stats historique alignées finance** : `salesCount/salesAmountMinor`
   excluent `is_cancelled = 0` comme dashboard/rapports.
3. **Montants signés affichables** : nouveau `formatDzdSigned`
   (`shared/formatters/format.ts`, ne lève jamais, `-500,00 DZD`) pour
   marge, résultat net, trésorerie. `formatDzd` reste pour les sommes ≥ 0.
4. **Canonicité `thermalWidth`** : `"58mm"|"80mm"` partout (Paramètres
   écrivait `"58"|"80"`, ignoré silencieusement par `getThermalWidth`).
5. **Reçu de règlement** : « Ancien/Nouveau solde » → « Reste avant/après »
   (le reçu immediat est au grain document, l'historique au grain compte).
6. **Prix pain à la création** : champ « Prix unitaire (DZD) » ajouté
   (0 = gratuit) ; `Encaisser` reste masqué à juste titre si reste = 0.
7. **Dates FR** : `formatDateFr/formatDateTimeFr`, `dueLabel` en JJ/MM/AAAA
   sans objet Date (pas de décalage fuseau) ; axes graphiques `MM-DD`
   conservés (contrainte d'espace).
8. **Non traité (limites connues)** : barres négatives aplaties à 0
   (anti-crash `BarChart.clean`, KPIs signés portent la vérité) ;
   imputation avoir→facture (voir §1).

## Vérification

`prettier` + `tsc -b` + `tsc electron` + `eslint --max-warnings 0` verts ;
`vitest run` : 91 fichiers / 559 tests OK ;
`verify-migrations` inchangé (aucune migration touchée).
Fichiers : `history.repo.ts`, `customers.repo.ts`, `receipt-documents.ts`,
`format.ts`, écrans history/products/stock/suppliers/bread/customers/debts/
returns/expenses/reports/dashboard/zakat/sales/settings + `debts.test.ts`

- nouveau `format-signed.test.ts`.
