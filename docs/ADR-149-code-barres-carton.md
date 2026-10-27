# ADR-149 — Code-barres carton (Phase 3 d'ADR-136)

- **Date** : 2026-10-27
- **Statut** : accepté
- **Contexte** : un même produit porte deux étiquettes — une pour la pièce, une
  pour le carton. Le scan du code carton doit ajouter un carton entier au panier,
  facturé au tarif carton exact (Jben : 16 pièces, 150 DZD alors que 16 × 10 DZD
  = 160 DZD), et sortir 16 pièces du stock. ADR-136 avait laissé ce point
  explicite « hors périmètre Phase 1 » et réservé la colonne
  `product_barcodes.packaging_id` (migration 0054, commentaire « Phase 3 »).
- **Migrations** : aucune. `0054_product_packagings.sql` avait déjà posé la
  colonne ; `verify-migrations` reste à 56 fichiers.

## Décision 1 — La vérité du carton reste dans `product_packagings`

Le prompt d'origine proposait d'ajouter `pack_size`, `pack_price_minor` et
`label` sur `product_barcodes`. Refusé : ces trois colonnes existent déjà sous
`factor`, `selling_price_minor` et `label_fr` dans `product_packagings`, qui
porte déjà le carton à la vente (ADR-136), à l'achat (ADR-136 D6), au devis et
au retour fournisseur (ADR-140, migration 0056). Deux sources du même fait
monétaire = factures divergentes selon le chemin emprunté.

Le code-barres ne désigne donc que le conditionnement :
`product_barcodes.packaging_id`. Le facteur et le prix sont relus en base.

**Limite consentie** : un seul conditionnement actif par produit
(`ux_packaging_active`), donc un seul _format_ de carton — mais plusieurs codes
peuvent y pointer (carton d'origine, étiquette maison, code fournisseur).
Plusieurs formats de carton simultanés restent hors périmètre (déjà noté chez
ADR-136) et passerait par une refonte de cet index, pas par des colonnes
dupliquées sur les codes.

## Décision 2 — Un scan = `factor` unités de base, pas « 1 ligne carton »

La caisse raisonne toujours en unités de base (ADR-136 D3) : scanner le code
carton ajoute `factor` pièces au panier, et c'est la projection
(`priceSaleLine`/`expandSaleLine`) qui découpe 1 carton facturé au tarif carton.
Aucun contrat modifié : ni `stockMultiplier` sur la ligne, ni colonne
`pack_size` sur `sale_items`, ni changement dans `sales.repo` (décrément, FIFO,
COGS, agrégation par produit), ni dans les rapports qui multiplient déjà par
`unit_factor`.

Un code pièce (aucune liaison) ajoute 1 unité : les codes existants gardent leur
comportement.

## Décision 3 — Code de carton ⇒ tarif automatique

`auto_carton_pricing` est l'interrupteur du tarif carton. Si un merchant déclare
un code carton avec cet interrupteur coupé, le scan sortirait le prix pièce
(160 DZD au lieu de 150) — un écart d'encaissement silencieux. La liaison exige
donc le tarif automatique :

- refus côté main (`packagings.repo`) : « Un code-barres de carton exige le
  tarif carton automatique. » ;
- le formulaire produit verrouille l'interrupteur sur « activé » dès qu'un code
  de carton existe ;
- le `main` ne fait toujours pas confiance au renderer (ADR-136 D5 intact) :
  facteur, prix carton et prix d'origine sont revalidés en base à l'encaissement.

## Décision 4 — La fiche reste la seule voie d'ajout d'un code

`products.packagings.save` reçoit la **liste exacte** des codes du carton et
réconcilie les liaisons dans sa transaction : déliaison de tout ce qui pointait
ce conditionnement, puis liaison de chaque code demandé. Un code absent de la
fiche ou appartenant à un autre produit est refusé — pas de création
silencieuse depuis la section Conditionnement.

Conséquence : `updateProduct`, qui remplace les lignes `product_barcodes`,
rejoue les liaisons `packaging_id` des codes qui survivent à la réécriture (sinon
chaque édition de fiche casserait le scan carton).

## Décision 5 — Retour : le carton scanné se rend entier

Le scan d'un code dans le retour client pré-remplit la quantité de la ligne
visée : ligne carton (`unit_factor = factor`) ⇒ 1 carton ; à défaut de ligne
carton sur la facture ⇒ `factor` pièces sur une ligne d'unité de base ; code
pièce ⇒ 1 pièce. Entrée répète le scan (deux cartons = 2). Les gardes du serveur
ne bougent pas : carton entier seulement, éligibilité en unités de base.

Le retour _partiel_ d'un carton (ADR-136 D7) reste hors périmètre.

## Conséquences

- Fichiers : `src/domain/packaging/carton-barcodes.ts` (nouveau, pur),
  `electron/ipc/handlers/packagings.repo.ts`, `products.repo.ts`,
  `validators.catalog.ts`, `registry.catalog.ts`,
  `src/features/sales/sell/{sell-types,sell-search}.ts`,
  `src/features/products/dialogs/{FormDialog,DetailsDrawer}.tsx`,
  `src/features/returns/dialogs/NewCustomerReturnDialog.tsx`.
- Contrats gelés inchangés : canaux 181, schémas Zod 125, migrations 56.
  `packagingSaveSchema` gagne un champ optionnel `cartonBarcodes` (défaut `[]`).
- Tests : `tests/unit/carton-barcodes.test.ts` (normalisation, validation EAN,
  unités par scan) et `tests/integration/carton-barcode.test.ts` (liaison et
  lecture au scan, refus des trois cas, rejouement `operationId`, réécriture de
  fiche, suppression, 150 DZD exacts / −16 pièces / +16 au retour, 2 scans =
  300 DZD / −32 pièces).
- E2E réel : `tests/e2e/carton-barcode.spec.ts` — fiche créée avec deux codes,
  deux scans en caisse, encaissement 300 DZD, ticket `Carton ×16`, puis preuve
  SQLite : `sale_items` **une** ligne `quantity 2 × unit_factor 16` (le panier
  fusionne le même produit au même prix), stock 100 → 68 et
  `product_barcodes.packaging_id` posé sur le seul code carton.
  `tests/e2e/carton-sale.spec.ts` reste la référence du chemin « pièces +
  carton » saisi à la main.
