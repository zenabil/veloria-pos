# ADR-095 — Étiquettes : Code 128 au lieu de Code 39

> Statut : accepté. Fichiers : `electron/printing/receipt-documents/common.ts`
> (`CODE128_WIDTHS`, `sanitizeCode128`, `code128Symbols`, `code128Svg`),
> `electron/printing/receipt-documents/labels.ts`, `electron/printing/receipt-documents.ts`,
> `tests/unit/p0-logistics-labels-backup.test.ts`.

## Contexte

Opérateur : changer le style du code-barres. Code 39 trop large pour 45mm
(13 chiffres ≈ 433 modules).

## Décision

- Étiquettes seules en Code 128 ISO/IEC 15417 (tickets/factures/bons gardent
  Code 39 — numéros internes inchangés) : chiffres pairs en set C (EAN-13 :
  ~25 % plus étroit via latch B→C), reste en set B (minuscules supportées,
  pas de majuscules forcées).
- Table Widths 107 symboles transcrite de Wikipedia + auto-vérifiée en test
  (6 runs, 11 modules, barres paires/espaces impairs) ; contrôle modulo 103
  validé sur l'exemple publié « PJJ123C » → 55 (set B).
- `code128Symbols()` pur exposé pour test ; SVG même gabarit que Code 39
  (barres + texte lisible, pas de doublon `.lcode` — voir ADR-093).

## Conséquences

- Tests : 32/32 (`p0` 14/14 dont intégrité table + vecteurs), `typecheck:electron`
  vert, `build:electron` vert.
- Même données encodées (scanners inchangés) ; EAN-13 purs restent scannables.
