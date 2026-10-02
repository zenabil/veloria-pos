# ADR-041 — OCR : ergonomie de relecture (filtre confiance + groupé)

Date : 2026-09-28 (demande utilisateur : développer l'OCR ; choix : ergonomie
relecture, pas d'arabe, pas de multi-fichiers, matching inchangé).

## Constat préalable (évite du travail inutile)

- Miniature source : déjà affichée (`previewDataUrl` du `ocrSelectFile`,
  images uniquement — PDF sans aperçu, normal).
- Moteur : Tesseract local `fra+eng` embarqués, `ara` absent par conception
  (erreur FR existante) — choix utilisateur : ne pas l'ajouter.
- Matching : code-barres → flou, relecture obligatoire — conservé tel quel.

## Ajouts (`OcrImportDialog`, renderer seul, métier inchangé)

- **Filtre confiance** : Toutes les lignes / À vérifier (non appariées ou
  confiance ≠ high) / Non appariées — avec message honnête quand le filtre
  masque tout.
- **Sélection groupée** : cases à cocher par ligne + barre d'action
  (compteur, `Associer un produit` via la recherche existante,
  `Supprimer la sélection`, `Tout désélectionner`). L'assignation groupée
  applique les mêmes règles que l'unitaire (`exact`/`high`, `createNew: false`)
  - notification du nombre traité.
- L'import (`importIntoStock`) et les validations par ligne sont inchangés ;
  le filtre ne fait que masquer l'affichage.

## Vérification

- `typecheck` + `eslint` verts, `vite build` + `build:electron` (integrity
  130 fichiers), démarrage nominal, `vitest` 65/409 verts.
