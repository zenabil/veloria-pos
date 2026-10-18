# ADR-117 — Politique stricte « opération → format d'impression »

## Contexte

Les documents opérationnels pouvaient sortir en plusieurs formats au choix
(onglets « Ticket 80mm / Facture A4 » dans les aperçus, PDF A4 d'une vente,
devis en ticket, étiquettes A4-24…). Trois dérives réelles :

1. **Vente en A4** : une vente (ticket de caisse) s'exportait/imprimait en
   « Facture A4 » — format administratif détourné, consommables et rendu
   inadaptés au comptoir.
2. **Devis en ticket 80 mm** : un devis (document commercial remis au client)
   sortait aussi en rouleau thermique.
3. **Étiquettes en planche A4 — interdit** : les planches A4 (24 étiquettes)
   ne sont pas des étiquettes adhésives et perturbaient le pilote.

Décision produit : **chaque opération a UNE famille de formats, jamais un
sélecteur par impression**. Le 58 vs 80 mm reste un réglage
imprimante/modèle existant (aucun choix à l'écran au moment d'imprimer).

## Décisions

- **Vente (et tout ce qui la réimprime) → ticket 58/80 mm uniquement** :
  encaissement, historique, fiche client, dettes, réimpressions et PDF —
  l'onglet « Facture A4 », l'aperçu A4 et l'export A4 d'une vente sont
  supprimés. L'A4 est banni pour tout document de vente.
- **Règlement de dette → ticket uniquement** (aperçu + PDF).
- **Retour (avoir) → ticket uniquement**.
- **Bon de livraison → ticket uniquement**.
- **Bon de commande fournisseur (CMD) → ticket uniquement**.
- **Devis (proforma) → A4 uniquement** : seul document de vente en A4 —
  filigrane, conditions, signature. Le devis ticket 80 mm est supprimé.
- **Étiquettes → tous formats thermiques SAUF A4** : `30x20`, `45x20`,
  `50x30`, `58x30`, `58x40`, `custom` (défaut `45x20`). `A4-24` disparaît
  des schémas et de l'UI. Limite mémoire 200 étiquettes/lot inchangée.
- **Rapports et documents administratifs** : A4 inchangé (hors périmètre).
- **Canaux IPC purgés** (30 → 27) : `printing.printA4`,
  `printing.exportA4Pdf`, `printing.printProforma80mm` supprimés
  (channels, preload, types renderer, validators, inventaires).
- **Constructeurs A4 de vente purgés** : `receipt-a4.ts` (fichier supprimé),
  `buildA4Html`, `buildProformaText`, `buildPaymentTicketA4Html`,
  `buildDeliveryHtml`, `buildReturnSlipHtml`, `buildPurchaseOrderHtml`
  (remplacés par `buildProformaA4Html` + documents thermiques).
- **Studio (modèles)** : types documentaires réduits à 6 (`ticket`,
  `proforma` « Devis A4 », `bon_livraison`, `recu`, `avoir`, `etiquette`) ;
  le type `facture` disparaît des Zod/types/UI. Un seul aperçu par type
  (plus d'onglets ni de bascule A4/80 mm). `TemplatePaper` étendu par type :
  ticket/recu/avoir/bon_livraison `["80mm","58mm"]`, proforma `["A4"]`,
  étiquettes = gabarits adhésifs ; retombées `80mm` / `A4` / `58x30`.
  `A5` (papier fantôme jamais atteignable) supprimé ; `pageAtRule`
  (chrome) émet toujours `size:A4` — branches mortes retirées.
- **Aperçus** : réponse à clé unique — vente `{text80}`, devis `{htmlA4}`,
  étiquettes `{html}`, règlement `{text80, codes}` ; côté absent = `""`.
  `DocumentPreviewModal` affiche iframe si `htmlA4 !== ""`, sinon `pre`.
- **Aucune migration** : la migration 0036 (CHECK + seed « facture ») est
  immutable — la ligne orpheline `facture` reste en base, inoffensive ;
  `TEMPLATE_DOC_TYPES` (repo) cesse de la réinitialiser. Valeur legacy
  pathologique (ex. papier « A5 » stocké) : le miroir Zod retombe sur les
  défauts complets — accepté, pas de migration de données.
- **Licences** : les noms de capacités historiques (ex. `invoice-a4`) sont
  conservés — concepts de licence, pas des formats d'impression.
- **`autoPrintInvoice`** (réglage) inchangé : l'impression auto appelle
  toujours l'impression ticket.

## Conséquences

- Fichiers : `electron/printing/*` (receipt, pdf-exports, proforma,
  logistics, studio, samples, templates, reports-labels,
  `receipt-documents/*`), `electron/ipc/validators.{print,templates}.ts`,
  `channels.ts`, `preload.ts`, `src/domain/print/template-rules.ts`,
  écrans renderer (InvoicePreviewModal, DocumentPreviewModal,
  PrintTemplatesScreen, HistoryDialogs, SlipPreviewModal, SupplierPOsDialog,
  SellOverlays…).
- Schémas Zod : 116 → 114 (`printFormatSchema` + `paymentTicketFormatSchema`
  supprimés) — `validators-inventory` figé à 114.
- Tests unitaires/intégration : suites adaptées (payment-ticket, c6-studio,
  documents, p0-logistics/print, split-parity, bridge-shape, snapshot IPC) —
  **794/794 verts** ; E2E : `customer-invoice` et `pdf-export` (ticket 80 mm
  - devis A4 + assertions négatives de purge), sélecteurs produit des specs
    alignés sur `role="option"` (liste ADR-114), capacité `proformas` ajoutée
    au harnais, porte session franchie dans `license-activation`, et
    `factory-reset` tue l'instance `app.relaunch()` avant son bootstrap pour
    garder le code initial de la porte (affiché UNE fois).
- Suite E2E complète verte (hors `installer`, qui exige le paquet Win).
- Dettes assumées : miroir Zod → défauts complets sur papier legacy
  invalide (pas de migration) ; ligne `facture` orpheline en base.
