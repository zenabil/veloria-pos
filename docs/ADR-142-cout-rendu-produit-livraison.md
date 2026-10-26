# ADR-142 — Coût rendu par produit après réception (livraison répartie)

- **Date** : 2026-10-26
- **Statut** : accepté
- **Contexte** : le propriétaire ajoute une facture fournisseur avec plusieurs
  produits et des frais de livraison. La livraison était déjà répartie dans les
  couches FIFO et affichée par ligne, mais `products.purchase_price_minor`
  restait le coût **hors fret**. La fiche produit et le catalogue n'affichaient
  donc pas la vraie dépense, et le champ « coût » ne se mettait pas à jour
  automatiquement après la réception.
- **Portée** : `electron/ipc/handlers/inventory.repo.ts`,
  `src/features/stock/dialogs/IntakeDialog.tsx`, libellés catalogue/fiche.

## Décision 1 — Répartition proportionnelle exacte

Les frais de livraison sont répartis entre les lignes au prorata de
`line_total_minor`, avec la méthode du plus grand reste déjà utilisée par
`allocateAmountByWeights` : la somme des parts est **exactement** égale aux
frais saisis. Chaque ligne calcule ensuite :

```
coût rendu unitaire = arrondi((line_total + part_livraison) / quantité_nette)
```

Les couches FIFO conservent leur allocation exacte en 1 ou 2 paliers
(`allocateUnitCostLayers`) : le total des couches reste égal au total payé, au
centime près.

## Décision 2 — Le coût produit enregistré est le coût rendu

`products.purchase_price_minor` reçoit désormais `landingUnit` (fret inclus)
pour :

- un produit existant mis à jour par la réception ;
- un produit créé à la volée par son nom dans la réception.

Le champ reste un **dernier coût rendu** (référence d'affichage et de marge) ;
le FIFO reste la source de vérité du coût réellement consommé. L'annulation
d'une réception recalibre déjà ce champ depuis la dernière couche restante,
donc elle reste cohérente.

## Décision 3 — Transparence dans l'interface

La réception affiche, pour chaque ligne, la part de livraison et le coût rendu
unitaire (« livraison incluse »). Un bloc « Répartition de la livraison »
récapitule la part et le coût rendu de chaque produit. La fiche produit parle
de **Coût d'achat** (livraison incluse après réception) et le catalogue de
**Coût**.

## Conséquences

- Aucune migration, aucun canal IPC, aucun schéma Zod nouveau.
- Le coût affiché augmente du fret : les produits existants sont recalculés à
  leur prochaine réception (les couches historiques ne sont jamais réécrites).
- Tests : `tests/integration/intake-landed-cost.test.ts` (3 produits,
  répartition 200/300/100 et coût new product) ; attente du test packaging
  passée de 1 941 à 1 971 DZD (34 unités nettes, 67 000 DZD rendus).
- ADR-136 (décision 6) est précisé : le « coût dérivé par pièce » affiché
  inclut la livraison capitalisée.
