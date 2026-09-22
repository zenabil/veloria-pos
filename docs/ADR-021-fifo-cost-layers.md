# ADR-021 — Couches de coût FIFO (le coût suit le stock, jamais le prix)

Date : 2026-09-17 · Statut : accepté · Migration : `0018_fifo_cost_layers.sql`

## Contexte

Le profit utilisait le **dernier coût** (`sale_items.purchase_price_minor × qty`,
`finance.repo`, `inventory.repo`) et la valeur du stock `qty × purchase_price`
(ou `× selling_price` sur le dashboard : incohérence). Changer un coût ou un
prix réécrivait implicitement la lecture du passé. Les retours ne connaissaient
pas le coût d'origine. Règle produit : **FIFO = coût du stock, jamais prix de
vente** (indépendant, manuel, sans marge automatique).

## Décision

- `inventory_layers` : une couche par apport net (entrée, création, import,
  ajustement/inventaire positif, restauration). Jamais de fusion destructrice.
  Champs : produit, facture/ligne d'achat, `original_quantity`,
  `remaining_quantity >= 0`, `unit_cost_minor`, date d'achat, motif, `created_at`.
- `sale_fifo_consumption` : traçabilité (vente, ligne, couche — `NULL` = part
  survendue — quantité, coût). `sale_items.cogs_minor` : coût FIFO total figé.
- Consommation plus-ancien-d'abord, en millièmes entiers (quantités à 3
  décimales), arrondi `Math.round` comme le reste du code.
- `products.purchase_price_minor` reste le **dernier coût** (référence
  d'achat/valorisation d'ajustement), `selling_price_minor` le **prix courant**
  (manuel). Ni l'un ni l'autre ne pilote le COGS.
- Survente (`inventory.allowNegativeStock`) : part sans couche au **dernier coût
  connu** (dernière couche, sinon snapshot produit) — coût explicite tracé
  (`layer_id NULL`), ventes passées immuables.
- Retour client réintégré → couches d'origine (fallback `return_restore` /
  `legacy` au snapshot pour ventes pré-FIFO). Retour fournisseur → déduction
  des couches de CETTE facture (refus si déjà vendues). Annulations = miroirs
  documentés (annulation retour client = sortie ancien-d'abord ; annulation
  retour fournisseur = retour dans les couches de la facture).
- Factures d'achat **immuables** (aucun canal update/delete — vérifié) :
  correction via ajustement/inventaire, sortie via retour fournisseur.
- Reprise 0018 : couche `opening` par produit en stock + `cogs_minor` = snapshot
  existant (approximation figée, jamais recalculée).
- Rapports/valorisation : COGS = `Σ(cogs_minor)`, valeur = couches restantes.
  Dashboard : `inventoryValue` passe (correction) du prix de vente au coût FIFO.

## Conséquences / risques

- `updateProduct` corrigeant la quantité synchronise les couches (apport au
  nouveau coût / consommation ancienne-d'abord) : une dérive historique
  lèverait une erreur explicite au lieu d'un clamp silencieux.
- Invariant : `Σ(couches) = max(stock, 0)` ; stock négatif ⇒ couches à zéro.
- Annulation retour client consomme ancien-d'abord plutôt que l'inverse exact
  des couches restaurées (simplification : invariant préservé, traçabilité
  exacte sacrifiée — voir code).
- Pas de remise sur achat (inexistante dans le schéma) ; prix de vente
  non-éditable en caisse (lignes) sauf article libre — inchangés.
