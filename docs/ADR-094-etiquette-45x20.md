# ADR-094 — Étiquettes : preset 45×20 (rouleau réel du poste)

> Statut : accepté. Fichiers : `electron/printing/receipt-documents/labels.ts`,
> `electron/printing/printing.reports-labels.ts`, `electron/ipc/validators.print.ts`,
> `src/features/products/dialogs/LabelsDialog.tsx` (défaut 45×20),
> `src/features/print-templates/PrintTemplatesScreen.tsx`, `tests/unit/p0-logistics-labels-backup.test.ts`.

## Contexte (suite ADR-092)

Le rouleau réel fait 45×20mm (mesuré), pas 58×30. Imprimer en 58×30/50×30 sur un
rouleau 45×20 garantit le débordement (contenu plus grand que l'étiquette).

## Décision

- Nouveau format `45x20` (page 45mm×20mm, microns 45000×20000, prix 12px + Code39
  h22 calibrés pour 20mm de haut, contenu ~46px < 76px).
- Défaut du dialogue : `45x20`. 58×30 conservé pour les autres postes.
- Reste côté poste : stock pilote = 45×20 + media type gap (voir ADR-091).

## Conséquences

- Tests : 27/27, `typecheck` vert, `build:electron` vert.
