# ADR-022 — OCR local des factures fournisseurs (page Stock)

Date : 2026-09-18 · Statut : accepté

## Contexte

Saisie manuelle des réceptions depuis factures papier/PDF : lente et source
d'erreurs. Exigence : 100 % local et hors-ligne (aucun cloud, aucune clé),
intégré au workflow Stock existant, relecture humaine obligatoire.

## Décision

- **Moteur : tesseract.js v7 (WASM, Apache-2.0)** — pas de binaire natif à
  recompiler (politique native-modules : seul better-sqlite3 est natif),
  worker_threads (UI non bloquée), `langPath` local
  (`resources/ocr/lang`, `fra`+`eng` tessdata_fast), `gzip:false` (zéro CDN).
  Vérifié empiriquement : facture FR test → texte quasi parfait.
- **PDF : pdfjs-dist, couche texte uniquement** (sans canvas natif). PDF scanné
  sans texte → erreur FR explicite (image JPG/PNG demandée). Limitation assumée.
- **Prétraitement sans dépendance** : `Electron.nativeImage` (borne 3000 px +
  PNG). Pas de sharp/OpenCV (natifs).
- **Découpage** : main = fichiers + moteur + PDF (aucune écriture) ;
  parsing/matching = `src/domain/ocr` (pur, testé), exécuté côté renderer
  après `ocr.analyze` (le matching est interactif de toute façon).
- **Import = `stock.intake` existant** (transaction, FIFO, idempotence,
  validation) ; créations produit via `products.create` après consentement
  explicite ligne par ligne ; fournisseur existant uniquement (aucune création
  auto). Aucune migration (aucune table OCR ; texte brut jamais persisté).
- **Canaux** `ocr.selectFile|analyze|cancel|dispose` + événement
  `ocr.progress` ; service `electron/ocr/` enregistré comme printing/backup ;
  fichiers temporaires `<userData>/ocr-temp` (fileId opaques, purge 24 h).
- **Packaging** : `extraResources` (lang), `asarUnpack` (worker/wasm/pdf.mjs —
  worker_threads et Emscripten exigent de vrais fichiers), trim
  `tesseract.js-core` (3 builds LSTM) et `pdfjs-dist` (1 fichier).
- **Anti-doublon** : avertissement fournisseur+numéro (100 dernières
  réceptions), non bloquant (règle métier existante : pas d'unicité factures).

## Conséquences / limites connues (U)

- PDF scanné sans couche texte non supporté (pas de rastérisation locale).
- Arabe : schéma prêt (`ara` accepté) mais `traineddata` non embarqué.
- Images très dégradées/rotées : qualité OCR variable (pas de deskew) —
  l'utilisateur corrige en relecture.
- Langue OCR fixée `fra+eng` côté UI (suffisant : chiffres + FR/EN).
- Test applicatif réel (clic → import) à valider en QA manuelle Windows ;
  couvert : moteur (run réel), PDF (run réel), domaine (18 tests), schémas,
  pont, suite complète 216/216.
