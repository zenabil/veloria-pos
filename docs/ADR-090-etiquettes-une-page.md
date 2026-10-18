# ADR-090 — Étiquettes thermiques : 1 étiquette = 1 page

> Statut : accepté. Fichiers : `electron/printing/receipt-documents/labels.ts`
> (`labelDims`, `labelPageMicrons`, CSS thermique), `electron/printing/receipt-documents.ts`
> (export), `electron/printing/printing.templates.ts` (`printHtml` + `pageSize`/`margins`),
> `electron/printing/printing.reports-labels.ts` (`printLabels`), `tests/unit/p0-logistics-labels-backup.test.ts`.

## Contexte

Xprinter 365B (vue comme `4BARCODE 3B-365B` sur USB003) sortait plusieurs étiquettes
vierges pour 1 seule demandée depuis l'écran Produits.

## Cause

Le HTML thermique portait `@page{margin:5mm}` + marge body navigateur (8px) sans
`break-after` entre étiquettes. Ex. 50×30mm : zone imprimable ~135×60px pour un
contenu ~75px+ → débordement Chromium sur 2-4 pages → étiquettes vierges.
Vérifié par génération réelle du HTML (nom + SVG présents, contenu non vide).

## Décision

- Formats rouleau (`30x20`, `50x30`, `58x40`, `custom`) : `@page{margin:0}`,
  `body{margin:0}`, `.label{break-after:page}` (sauf dernière) → 1 étiquette = 1 page.
- `labelPageMicrons()` (pur, testé) : dimensions exactes en microns, source unique
  CSS + option d'impression. `null` pour `A4-24` (planche inchangée, aperçu = impression).
- `printHtml(html, waitMs, { pageSizeMicrons })` : `printLabels` impose le format
  exact + `margins:{marginType:"none"}` à Chromium. Paramètre optionnel : autres
  documents inchangés.

## Conséquences

- Tests : `p0-logistics-labels-backup` 8/8 (dont 2 nouveaux : CSS 1-page + microns),
  `c6-studio` + `c5-timbre-thermal` verts, `typecheck` + `typecheck:electron` verts.
- Reste côté poste : pilote officiel 4BARCODE/Xprinter + stock Windows = taille du
  rouleau + calibrage gap (FEED), sinon la 365B continue d'avancer du papier vierge.
