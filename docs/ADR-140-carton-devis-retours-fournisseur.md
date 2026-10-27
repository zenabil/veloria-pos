# ADR-140 — Carton : devis convertibles et retours fournisseur en unités justes

- **Date** : 2026-10-26
- **Statut** : accepté
- **Contexte** : audit du conditionnement carton (ADR-136). Trois défauts
  touchaient l'argent et le stock :
  1. un devis créé depuis la caisse enregistrait les lignes **avant**
     découpage carton (`15 × prix pièce`) alors que l'aperçu affichait le
     total carton : total stocké ≠ total imprimé, et la conversion facturait
     le prix pièce ;
  2. la conversion d'un devis en vente ne portait ni `packaging_id` ni
     `unit_factor` : un carton vendu depuis un devis déduisait **1 pièce** ;
  3. le retour fournisseur d'un achat carton affichait « reçu 3 » (cartons)
     et « restant 36 » (pièces) dans la même ligne, saisissait des pièces
     sans le dire, et les 2 pièces abîmées pourtant annoncées retournables
     faisaient échouer la sortie de stock.
- **Migration** : `0056_carton_quotes_supplier_returns.sql`.

## Décision 1 — Le devis mémorise la snapshot carton

`proforma_items` porte désormais `packaging_id`, `unit_factor` et
`unit_code`. Les lignes d'un devis sont les **lignes facturables** (carton(s)

- reste), exactement comme `sale_items`. Le total du devis (stocké, imprimé,
  converti) est donc identique au total de la caisse.

Le main valide le conditionnement à la création/modification du devis
(produit, facteur, existence) ; le prix reste libre (un devis peut remiser le
carton).

## Décision 2 — Conversion = snapshot honorée, stock en unités de base

`convertProformaToSaleAtomic` transmet `packaging_id`/`unit_factor` à
`createSaleAtomic` avec `trustedPackagingSnapshot: true`. Le facteur et le
prix du devis font foi : un tarif carton modifié ou un conditionnement
désactivé **après** l'envoi du devis ne bloque pas la conversion et ne change
pas le montant accepté par le client. Le stock, le FIFO et les mouvements
utilisent `quantité × unit_factor`.

Le drapeau de confiance est **interne au main** (jamais dans le schéma IPC) :
`sales.create` continue de revalider le conditionnement courant contre la DB.

## Décision 3 — Retour fournisseur : stock et abîmées séparés

`supplier_return_items` porte `quantity_stock` et `quantity_damaged` :

- la **valeur rendue** (`quantity`) inclut les pièces abîmées, reprises par
  le fournisseur ;
- seules les `quantity_stock` sortent du stock (les abîmées n'y ont jamais
  été entrées) ;
- l'éligibilité se calcule sur les **couches FIFO encore présentes** de la
  réception + les abîmées non encore retournées. L'ancien calcul
  `reçu × facteur − déjà retourné` proposait des quantités que la mutation
  refusait ensuite (stock consommé ou abîmées non stockées) ;
- la réception/le retour portent l'`intakeItemId` exact : chaque ligne
  (carton ou pièce) est valorisée à **son** prix d'achat, jamais au prix de
  la première ligne du produit ;
- l'annulation restaure uniquement `quantity_stock`, avec un journal de
  couches agrégé par produit (deux lignes du même produit ne rejouent pas la
  même restauration).

Backfill : `quantity_stock = quantity`, `quantity_damaged = 0` (tout
l'historique était déduit du stock).

## Décision 4 — Correctif latent : annulation de retour

L'INSERT du mouvement d'annulation de retour avait **un placeholder de trop**
(dix colonnes, onze valeurs) : toute annulation de retour, client ou
fournisseur, échouait en SQL. Corrigé dans les deux branches et couvert par
des tests de régression.

## Conséquences

- Migration **55 → 56** (aucun canal IPC, aucun schéma Zod nouveau).
- UI : le devis affiche l'unité carton ; l'éditeur de devis ajoute une ligne
  carton au tarif courant ; le retour fournisseur affiche
  « reçu X cartons = Y pièces » et « stock N + abîmées M = restant » avec une
  saisie explicitement en pièces.
- Tests : `packaging-slice` (retour 36 = 34 stock + 2 abîmées, annulation,
  deux lignes même produit), `proforma-convert-discount` (total 28000,
  conversion après changement/désactivation du tarif, stock 15), unités
  caisse (découpage du devis) et clé d'idempotence du devis.
- Hors périmètre inchangé : code-barres carton, retour partiel de carton,
  plusieurs niveaux de carton, prix de gros client.
