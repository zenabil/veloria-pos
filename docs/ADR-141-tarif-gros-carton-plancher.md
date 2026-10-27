# ADR-141 — Tarif de gros carton : suppression du plancher (facteur−1)

- **Date** : 2026-10-26
- **Statut** : accepté (révise ADR-136, décision 4)
- **Contexte** : essai réel demandé par le propriétaire — œufs, 1 carton = 30
  pièces, achat carton 540 DZD, vente carton 650 DZD, vente pièce 25 DZD.
  Le panier de 34 pièces affichait bien « 1 carton de 30 + 4 pièces » mais
  **sans badge Tarif carton** et facturait 850 DZD (34 × 25) au lieu de
  750 DZD (650 + 4 × 25).

  Cause : ADR-136 imposait `(facteur−1) × prix pièce ≤ prix carton`, soit
  `29 × 25 = 725 ≤ 650` — faux. Ce plancher interdisait un tarif de gros
  pourtant courant où le prix du carton est sous le prix de `facteur−1`
  pièces (baisse au franchissement du seuil : 29 pièces = 725 DZD, 30 pièces
  = 650 DZD).

## Décision

`priceSaleLine` n'exige plus que le prix carton soit supérieur ou égal à
`(facteur−1) × prix pièce`. La seule condition conservée est :

```
0 ≤ prix carton < facteur × prix pièce
```

Autrement dit : le carton doit être une **remise sur le plein au prix
pièce**. Dès que la quantité atteint le facteur, la ligne est découpée en
cartons complets au prix carton + reste au prix pièce.

La baisse de total au seuil (29 → 30 pièces) est **assumée** : c'est le
tarif de gros voulu, pas une anomalie. Aucun autre comportement ne change :
prix manuel, mode Montant, stock/FIFO en unités de base et conversions de
devis restent identiques.

## Conséquences

- `packaging-rules.test.ts` : le test de monotonicité est remplacé par le cas
  propriétaire (29 = 725, 30 = 650, 34 = 750) ; un carton ≥ plein prix pièce
  reste ignoré.
- `sales.repo.ts` (`buildReopenDraft`) : plus de plancher lors de la
  reconstruction d'une ligne carton ; seul le prix pièce est ajusté si le
  tarif historique dépasse le plein actuel.
- **E2E réel** `tests/e2e/carton-sale.spec.ts` : crée le produit œufs avec
  conditionnement (30 / 650 / 540), vend 34 pièces, vérifie le badge, le
  ticket, le total 750 DZD, les lignes `1×30` + `4×1` et le stock 0.
- Aucune migration, aucun canal IPC, aucun schéma Zod nouveau.
- ADR-136 décision 4 reste l'historique ; elle est **révisée** par le présent
  ADR pour la borne inférieure uniquement.
