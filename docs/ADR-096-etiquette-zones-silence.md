# ADR-096 — Étiquettes : zones de silence + zone de sécurité

> Statut : accepté. Fichiers : `electron/printing/receipt-documents/common.ts`
> (`code128Svg`), `electron/printing/receipt-documents/labels.ts`,
> `tests/unit/p0-logistics-labels-backup.test.ts`.

## Contexte (suite ADR-095)

Le Code 128 touchait le bord du 45×20 et débordait légèrement : barres dès x=0
(sans silence ISO) + contenu pleine largeur alors que le pilote rogne ~2mm
physiques par bord.

## Décision

- `code128Svg` : zones de silence 10 modules (20px) à gauche et à droite
  (obligatoires ISO 15417, critiques pour le scan en bord d'étiquette).
- CSS thermique : `.label{padding:8px 12px;margin:0 2mm}` — contenu à 2mm des
  bords, ne peut plus dépasser du support quelle que soit la rogne pilote.

## Conséquences

- Tests : 33/33, `typecheck:electron` vert, `build:electron` vert.
