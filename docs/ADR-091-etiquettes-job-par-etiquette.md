# ADR-091 — Étiquettes : 1 job par étiquette + stock pilote

> Statut : accepté. Fichiers : `electron/printing/printing.templates.ts`
> (`PrintPage`, `printHtmlPages`, `printHtml` délégué), `electron/printing/printing.reports-labels.ts`
> (`printLabels` 1 page/étiquette), `tests/unit/p0-logistics-labels-backup.test.ts`.

## Contexte (suite ADR-090)

Après ADR-090, la 365B imprimait mais : 50×30 sortait du cadre, 30×20 chevauchait
2 étiquettes, et 2 demandées = 1 sortie.

## Causes

1. **Comptage** : N étiquettes partaient dans UNE page Chromium ; le pilote
   (stock Letter par défaut — `PaperSizesSupported={1}`, pilote 2120TF emprunté)
   les tenait sur une seule page pilote → 1 avance papier.
2. **Cadrage** : le stock pilote (Letter) ne correspond pas au format du job ;
   seul un stock pilote = taille du rouleau + calibrage gap donne un cadrage exact.

## Décision

- `printHtmlPages(pages, waitMs)` : UNE fenêtre cachée, UN job d'impression par
  page. `printLabels` envoie 1 page mono-étiquette par exemplaire → 2 demandées
  = 2 jobs = 2 avances, quel que soit le stock pilote.
- `printHtml` délégue (signature compatible, autres documents inchangés).

## Conséquences

- Tests : 27/27 (`p0` 9/9 dont « 1 article = 1 cellule »), `typecheck:electron` vert,
  `build:electron` vert.
- Reste côté poste (opérateur, pas de code) : Préférences 4BARCODE = stock taille
  du rouleau + calibrage gap + pilote officiel à terme (le 2120TF reste emprunté).
