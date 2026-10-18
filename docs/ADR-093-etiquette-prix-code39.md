# ADR-093 — Étiquettes : prix + Code39 seuls

> Statut : accepté. Fichiers : `electron/printing/receipt-documents/labels.ts`,
> `tests/unit/p0-logistics-labels-backup.test.ts`.

## Contexte (suite ADR-090/091/092)

Opérateur : le nom produit et le code répété (texte SVG + ligne `.lcode`) surchargent
le 58×30 et le code apparaît deux fois.

## Décision

Cellule étiquette = prix (`fmtDzd`) + Code39 SVG (texte lisible intégré au SVG) +
QR opt-in. Nom et ligne code redondante supprimés (CSS `.lname`/`.lcode` aussi).
`LabelItem.name` conservé dans le payload (compatibilité, prévisualisation future).

## Conséquences

- Tests : 27/27, `typecheck:electron` vert, `build:electron` vert.
