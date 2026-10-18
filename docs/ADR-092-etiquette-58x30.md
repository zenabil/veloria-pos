# ADR-092 — Étiquettes : preset 58×30 (rouleau du poste)

> Statut : accepté. Fichiers : `electron/printing/receipt-documents/labels.ts`,
> `electron/printing/printing.reports-labels.ts`, `electron/ipc/validators.print.ts`,
> `src/features/products/dialogs/LabelsDialog.tsx` (défaut 58×30),
> `src/features/print-templates/PrintTemplatesScreen.tsx`, `tests/unit/p0-logistics-labels-backup.test.ts`.

## Contexte (suite ADR-090/091)

Le rouleau du poste est du 58×30mm — aucun preset ne correspondait (le plus proche,
58×40, débordait verticalement). L'opérateur devait utiliser `custom` à chaque fois.

## Décision

- Nouveau format `58x30` dans `LabelFormat` + `labelFormatSchema` + `labelDims` +
  `labelPageStyle` (page 58mm×30mm, microns 58000×30000, 1 page/1 job comme ADR-091).
- Défaut du dialogue Étiquettes : `58x30` (poste à imprimante rouleau unique ;
  A4-24 reste sélectionnable pour planches).
- Reste côté poste : stock pilote = 58×30 + media type gap (voir ADR-091) —
  le binaire DEVMODE du pilote emprunté GP-1124D n'est pas éditable sans admin.

## Conséquences

- Tests : 27/27, `typecheck` vert, `build:electron` vert.
