# ADR-044 — Réparation radicale 2026-09-29 (pages, code mort, factures complètes)

Date : 2026-09-29. Statut : accepté.

## Contexte

Audit total demandé : mockups, codes morts/excédentaires/manquant, fonctionnalités
et pages mortes/excédentaires/manquantes/non liées, factures incomplètes.
Chaque facture doit être liée à son écran avec aperçu + impression +
personnalisation.

## Constats

- Pages : 17/17 liées (fichier + import + rendu + sidebar + licence). 0 orpheline.
- Factures incomplètes : devis 80mm sans canal, 0 export PDF (devis, reçu,
  rapport, étiquettes), bon commande sans impression, `company: "Veloria"` codé
  en dur (rapports, tableau de bord), écran Impression déconnecté (14 drapeaux
  TVA/QR/58mm/cachet sans consommateur, aperçus « Exemple » non imprimables).
- Code mort renderer : 14 wrappers `api.*` sans appelant, 1 canal complet
  (`customers.get`, doublon de `customers.statement`), exports jamais importés
  (`CASHIER_LABEL`, `BarSeries`, schémas/types internes, interfaces settings).

## Décision

1. Main : 5 canaux (`printProforma80mm`, `exportProformaPdf`,
   `exportPaymentPdf`, `exportReportPdf`, `exportLabelsPdf`) + gates licence
   (pages + features). Précharge, types et client alignés.
2. UI : chaque document a aperçu + impression + PDF à son écran (devis 80mm/A4
   dans Vente et Proformas, reçu dans `PaymentTicketModal`, rapports/bord/zakat,
   étiquettes, bon pain, bon commande fournisseur nouveau).
3. Fiche entreprise réelle sur tous les rapports (plus de `"Veloria"` dur).
4. Écran Impression réécrit : imprimante réelle (sélection + test),
   personnalisation réelle lue depuis Paramètres → Facturation, matrice
   documents → écrans. `print-templates/types.ts` supprimé (préférences
   localStorage sans consommateur).
5. Suppressions : 14 wrappers `api.*` morts, canal `customers.get` + fonction
   `getCustomer` (doublon), `CASHIER_LABEL`, dés-export des types internes
   (`BarSeries`, schémas contrats, `SalePayload`, `newUuidV7`, interfaces
   tickets/settings/entreprise).
6. Paramètres → Sauvegarde : bouton « Exporter la dernière » (canal existant
   sans bouton). Écran Impression utilise `printer.get` (canal existant sans
   appelant).

## Conséquences

- `typecheck` (3 projets) vert, `verify:migrations` vert (31/31, aucune
  migration touchée), `verify:domain` vert, `vitest` 65/410 vert, `vite build`
  vert.
- Backend `reports.full`, `products.get`, `stock.lowStock/valuation`,
  `license.getInfo/permissions`, `app.getVersion`, `backup.autoGet`,
  `customers.import`, `carts.clear` conservés comme API testée (bridge-shape)
  sans wrapper renderer.
