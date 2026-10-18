# ADR-100 — Retour fournisseur : cumul intra-requête par produit

## Contexte

`createSupplierReturnAtomic` (`electron/ipc/handlers/returns.repo.ts`) vérifiait
chaque ligne contre `acheté − déjà-retourné` isolément, sans cumuler les lignes
de la même requête. Deux lignes du même produit (ex. 6 + 5 sur un éligible de 10)
passaient chacune le contrôle alors que leur somme dépassait l'éligible.
Le retour client (`createReturnAtomic`, même fichier) portait déjà le motif
`requestedByProduct` / `plannedRestoreByProduct` — le retour fournisseur en était
dépourvu (asymétrie).

## Alternatives

1. Laisser la garde stock/FIFO trancher (statu quo) — rejeté : le stock peut avoir
   été réapprovisionné depuis la facture, donc un sur-retour pouvait être accepté
   avec un `totalReturn` supérieur à l'éligible.
2. CHECK SQL sur le cumul — rejeté : l'éligible dépend d'un historique multi-tables
   (facture + retours non annulés + requête courante), inadapté à un trigger simple ;
   le contrôle appartient à la transaction applicative, comme côté client.
3. Porter le motif `requestedByProduct` du retour client (retenu).

## Décision

Miroir exact du retour client dans `createSupplierReturnAtomic` : `Map` par produit,
`eligible = acheté − déjà-retourné − déjà-demandé-dans-cette-requête`, refus FR
`Quantité retournée supérieure à l'éligible (…)` + rollback complet (throw dans la
transaction better-sqlite3). Aucune migration (aucun changement de schéma).

## Conséquences

- Sur-retour intra-requête refusé avec message FR, zéro écriture (retour, lignes,
  stock, dette, audit intacts).
- Cas limite 6 + 4 = 10 accepté ; double-submit même `operationId` = effet unique ;
  `totalReturnMinor` reste un entier centimes.
- Preuve : `tests/integration/supplier-return-intra-request.test.ts` (2 tests verts).

## Fichiers affectés

- `electron/ipc/handlers/returns.repo.ts` (boucle `createSupplierReturnAtomic`)
- `tests/integration/supplier-return-intra-request.test.ts` (nouveau)
