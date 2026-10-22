# ADR-133 — Format de page des tickets thermiques : la page suit le contenu (fin du grand blanc après le code-barres)

- **Statut** : accepté (correctif du constat propriétaire du 2026-10-22)
- **Date** : 2026-10-22
- **Amende** : ADR-117 (une vente ne sort qu'en ticket 58/80 mm), ADR-050/057 (bloc codes du ticket), ADR-090 (étiquettes rouleau — patron `pageSizeMicrons`)
- **Migrations** : aucune

## 1. Contexte

Constat propriétaire : « فاتورة البيع عندما تطبع هناك فراغ كبير بعد الكودبار » — la
facture de vente imprimée laisse un **grand blanc après le code-barres** (et le
code-barres lui-même sort **tronqué**). Diagnostic prouvé au §24 du handoff :

| #   | Cause                                                                                                                                                                 | Preuve                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Le ticket **n'imposait aucun `pageSize`** : Chromium imprimait au format **par défaut du pilote** (A4 / 297 mm) alors que le contenu se **termine** par le bloc codes | `printOptions()` = `{ silent, deviceName }` ; mesure Chromium : ticket de 522 px (≈ 138 mm) posé sur une page de 297 mm                                                         |
| 2   | Le **Code 39 n'était jamais mis à l'échelle** : SVG de 462 px dans une colonne de 280 px (80 mm) / 200 px (58 mm) + `overflow:hidden`                                 | Rendu Chromium avant correctif : 462 px dans 280 px ⇒ **39 % de la barre coupé** (61 % visible), 57 % coupé en 58 mm ; le numéro lisible tombait hors zone (invisible en 58 mm) |
| 3   | L'**export PDF** passait des **microns** à `printToPDF`, qui attend des **pouces**                                                                                    | `pageSize { width: 80000, height: 297000 }` ⇒ 80 000 po lus par Chromium (page gigantesque, contenu minuscule dans un coin)                                                     |

Les étiquettes rouleau, elles, imposaient déjà un format exact (`labelPageMicrons`) :
**seuls les tickets thermiques avaient été oubliés**.

## 2. Décisions

### D1 — La page thermique = largeur du papier + hauteur MESURÉE du contenu

- `thermalPageSize(width, contentPx)` (`electron/printing/printing.page-size.ts`) :
  largeur 58 000 / 80 000 µm, hauteur = `contentPx × 264,583 + 3 000` µm
  (1 px CSS = 25,4/96 mm ; +3 mm de marge d'avance/coupe), **plancher 30 mm**.
- `printHtmlPages` mesure le document **après `did-finish-load`** (logo/QR en
  dataURL déjà rendus) et imprime avec `pageSize` + `margins: { marginType: "none" }`.
- La mesure lit le **bas réel du contenu** (dernier enfant du `body`), jamais
  `documentElement.scrollHeight` : en mode quirks (ticket sans `<!doctype>`) le
  `body` est **étiré à la fenêtre** et renverrait la hauteur de la fenêtre
  (600 px) — le blanc serait revenu, en plus petit.
- **Repli** : mesure impossible (0 / non numérique / exception) ⇒ aucun `pageSize`
  imposé = comportement historique. On ne tronque jamais un ticket sur une mesure
  douteuse.
- La politique vaut pour **tous** les documents thermiques : ticket de vente,
  reçu de règlement, bon de livraison, bon de retour, bon de commande, page de
  test. Un contenu plus long qu'une page s'imprime sur plusieurs pages entières
  (rien n'est coupé).

### D2 — Le Code 39 tient dans la colonne (module calé + plafond CSS)

- `code39ModuleFor(raw, maxWidthPx)` : module étroit le plus large qui tienne
  dans la colonne, arrondi à 0,1 px, borné **1 → 2 px** (sous 1 px la barre
  n'est plus fiable au scan).
- `thermalBarcode()` injecte aussi `style="max-width:<colonne>px;height:auto"` :
  si le code reste plus large que la colonne (numéros longs, 58 mm), le SVG est
  **mis à l'échelle avec ses proportions**, plus jamais rogné — même règle que
  l'A4 (`.barcode svg{max-width:230px;height:auto}`) et les étiquettes.
- **Limite matérielle assumée** : un Code 39 de 14 caractères ne tient pas
  scannable sur 58 mm (X-dimension < 0,2 mm). Le code y est complet et lisible
  à l'œil, mais le 80 mm reste la largeur recommandée pour un scan fiable.

### D3 — PDF : `printToPDF` en POUCES, `webContents.print` en MICRONS

- `micronsToInches()` (25 400 µm = 1 po) + marges nulles pour `printToPDF`.
- L'export PDF du ticket utilise la **même hauteur mesurée** que l'impression.
- Aucun changement pour l'A4 (`pageSize: "A4"`).

### D4 — Constat secondaire NON traité

Le payload QR s'affiche encore **deux fois** (ligne texte `QR : …` de
`receipt-text.ts` + bloc 9 px sous le QR). Le retirer changerait le contrat
texte du ticket (ADR-050, aperçu et tests) : hors périmètre de ce correctif.

## 3. Conséquences

- 1 ticket = 1 page = 1 avance papier : plus de blanc après le bloc codes
  (80 mm ≈ 141 mm pour ~18 lignes, au lieu de 297 mm).
- Le code-barres est **entier** et son numéro lisible reste centré sous la barre,
  en 58 comme en 80 mm.
- L'export PDF d'un ticket produit une page à la taille réelle du ticket
  (vérifié : 80,1 × 141,5 mm et 58,3 × 128,1 mm, 1 page).
- Les étiquettes ne changent pas (leur chemin `pageSizeMicrons` reste intact).

## 4. Preuves

- **Chromium (Playwright)**, ticket réel issu de `thermalHtml` :
  SVG 275,7 px dans une colonne de 280 px (80 mm) et 200 px dans 200 px
  (58 mm) — débordement 0 (avant : 462 px / 280 px) ; hauteur de contenu
  mesurée 522 px (80 mm) / 472 px (58 mm), indépendante de la fenêtre.
- **Electron réel** (`dist-electron` + `printToPDF`) : 1 page, `MediaBox`
  80,1 × 141,5 mm (80 mm) et 58,3 × 128,1 mm (58 mm).
- **Tests** : `tests/unit/printing/page-size.test.ts` (13) — taille de page,
  plancher, mesure (valeur inattendue / exception), module Code 39, plafond CSS,
  conversion pouces.
- **Portes** : `tsc -b` 0 · `typecheck:electron` 0 · `eslint --max-warnings 0` 0 ·
  `vitest` 149 fichiers / 1027 tests 0 · `build` ✓ · `build:electron` ✓ ·
  `verify:fr` 0 · `verify:encoding` 0 · `verify:migrations` VERIFIED.
