# ADR-134 — Design du ticket de vente : un seul HTML pour le papier, le PDF et l'aperçu

- **Statut** : accepté (design demandé par le propriétaire, 2026-10-22)
- **Date** : 2026-10-22
- **Amende** : ADR-133 (format de page et Code 39 — toujours en vigueur),
  ADR-050/057 (bloc codes du ticket), ADR-131/132 (montant saisi, remise signée)
- **Migrations** : aucune

## 1. Contexte

Le propriétaire a fourni la photo d'un ticket de superette et demandé que la
facture de vente imprimée reprenne cette présentation : grande enseigne,
date, ligne client, table `Qté / Article / P.U / Montant` à lignes pointillées,
`N Article(s)`, encadré arrondi `Ancien solde / Total vente / Versement /
Nouveau solde`, remerciement, code-barres + numéro, mentions légales.

Le ticket était jusqu'ici composé en **texte monospace** (`buildReceiptText`)
puis enveloppé dans `thermalHtml`. Cette voie ne permet ni encadré arrondi,
ni colonnes propres, ni mise en avant de l'enseigne — et surtout l'aperçu
(`text80`) ne montrait **pas** ce qui sortait réellement du pilote.

## 2. Décisions

### D1 — Un builder HTML unique : `buildReceiptTicketHtml`

`electron/printing/receipt-documents/ticket-html.ts` produit un document
autonome (doctype, CSS embarquée, N&B strict, aucun script). Il est la
**source unique** de :

- l'impression réelle (`printing.receipt.ts`) ;
- l'export PDF du ticket (`printing.pdf-exports.ts`) ;
- l'aperçu vente (`printing.preview` → `html80`) ;
- l'échantillon de l'atelier (`printing.samples.ts`) ;
- l'impression de test et la page de test (`printing.studio.ts`,
  `printing.receipt.ts`).

`buildReceiptText` reste en place pour les autres documents thermiques
(reçu de règlement, bon de livraison, bon de retour), les tests historiques et
le **repli** d'aperçu. Aucun canal IPC, aucun schéma Zod, aucune migration
n'est ajouté : `printing.preview` renvoie simplement `{ text80, html80 }`.

### D2 — Fidélité au modèle fourni

- **En-tête** : logo (si activé), enseigne à ~1,9 × la taille de base
  (bornée 16–28 px), ville en italique, contact `adresse · tél · e-mail`,
  identité fiscale `RC / NIF / NIS` en petit.
- **Date** centrée, puis `Client : Nom | téléphone | adresse` (ou « Comptant »).
- **Table** `Qté / Article / P.U / Montant` : en-tête encadré haut/bas,
  lignes séparées par des pointillés. Les montants du tableau sont **compacts**
  (pas de « DA », pas de séparateurs de milliers, pas de « ,00 ») pour tenir
  en 58 mm ; l'encadré de soldes conserve les montants formatés `DA`.
- **Ligne au montant saisi** (ADR-131/132) : `P.U` affiche « — » et la mention
  « Montant saisi » remplace toute multiplication fausse ; le montant facturé
  reste intact.
- **Encadré de soldes** : `Ancien solde` (si fiche client), `Total vente`,
  `Timbre fiscal` (si espèces), `Versement`, puis `Nouveau solde` en gras —
  ou `Reste à payer` / `Reste (timbre)` / `Monnaie rendue` selon le cas.
  Détail fiscal discret au-dessus (sous-total, remise/majoration, HT, TVA,
  livraison) uniquement lorsqu'il est pertinent.
- **Pied** : nombre d'articles, montant en lettres, mode de règlement et
  échéance, remerciement, Code 39 + numéro, QR optionnel, mention légale.
  Valeurs par défaut : « Merci de votre visite. » et « Ticket obligatoire
  pour toutes réclamations » (surchargeables dans l'atelier).

### D3 — Codes, sécurité, largeurs

- Le Code 39 est mis à l'échelle de la colonne via `code39ModuleFor`
  (ADR-133) et plafonné en CSS ; le QR n'est dessiné que si le modèle le
  fournit. Le **payload QR texte n'est imprimé que sans SVG** : la
  duplication relevée en ADR-133 §D4 disparaît du ticket.
- Le numéro lisible n'apparaît sous les barres que si aucun code-barres
  n'est dessiné, pour ne jamais doublonner.
- Signatures masquées quand le modèle les masque (`hideSigns`).
- Toutes les entrées libres passent par `escapeHtml` ; l'aperçu est rendu
  dans une iframe `sandbox=""`.
- Largeurs : 80 mm → 280 px utiles, base 12 px ; 58 mm → 200 px utiles,
  base 11 px. La hauteur reste mesurée par `thermalPageSize` (ADR-133), donc
  la page suit le contenu.

### D4 — Un défaut corrigé pendant la vérification

La première version posait l'encadré en `flex: 0 0 74%` à côté de
`N Article(s)` : à 80 mm, la boîte dépassait de **14 px** hors du papier.
L'encadré est désormais `flex: 1 1 auto; min-width: 0; max-width: 74%` et la
mention d'articles ne se comprime pas. Mesure Playwright après correctif :
**0 débordement** en 58 comme en 80 mm.

## 3. Conséquences

- L'aperçu, le PDF et le papier sont **le même document** : l'aperçu ne peut
  plus promettre une mise en page différente de l'impression.
- L'atelier d'impression montre le rendu réel du ticket (logo et filigrane
  compris) au lieu d'un texte approché.
- Les autres documents thermiques ne changent pas ; `buildReceiptText` et
  `thermalHtml` restent leurs sources.
- Les fichiers du chantier restent sous la limite de 300 lignes imposée par
  `tests/unit/printing/split-parity.test.ts`
  (`ticket-html.ts` 236 lignes, `ticket-blocks.ts` 147).

## 4. Preuves

- **Tests** : `tests/unit/printing/ticket-html.test.ts` (9 cas : structure,
  largeurs, soldes, reste à payer, montant saisi, TVA conditionnelle,
  échappement, codes, masquage) + `split-parity.test.ts` (18 cas, échantillon
  ticket = `text80` + `html80`).
- **Playwright** : ticket de 6 lignes — 80 mm : 280 × 575 px, 58 mm :
  200 × 654 px, **0 élément hors cadre** dans les deux largeurs.
- **Portes (arbre de ce commit)** : `tsc -b` **0** · `typecheck:electron`
  **0** · `eslint . --max-warnings 0` **0** · `vitest` **151 fichiers /
  1 051 tests** **0** · `build` ✓ · `build:electron` ✓ (manifeste **220
  fichiers**) · `verify:fr` **0** (325 fichiers) · `verify:encoding` **0**
  (886 fichiers) · `verify:migrations` **VERIFIED**.
- **Reste hors périmètre** : impression sur imprimante thermique réelle et
  E2E non rejoués ; packaging `release/` antérieur à ce design.
