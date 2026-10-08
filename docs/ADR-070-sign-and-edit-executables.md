# ADR-070 — Réactivation `signAndEditExecutable` (fin du contournement TEMP-BUILD)

Date : 2026-10-06. Statut : accepté.

## Contexte

TEMP-BUILD (2026-10-02) avait mis `win.signAndEditExecutable: false` dans
`electron-builder.yml` + `electron-builder.license-manager.yml` : sans
privilège symlink (utilisateur standard), winCodeSign/7za échoue, et les
métadonnées EXE étaient retimbrées après build via `rcedit-x64.exe` en cache.
Les deux lignes portaient la mention « À REVERTIR si le privilège existe ».

Risque load-bearing : expédier un installeur/portable construit avec `false`
= EXE dont l'étape d'édition winCodeSign est sautée (métadonnées/version-info
non appliquées par la chaîne officielle). Interdit d'expédier avec `false`.

## Décision

- `signAndEditExecutable: true` dans les deux `electron-builder*.yml`
  (revert du TEMP-BUILD). L'étape post-build `rcedit` manuel est retirée.
- Les builds release exigent désormais le privilège symlink (machine de build
  dédiée ou compte avec privilège) ; sans lui, le build échoue tôt au lieu de
  produire un EXE dégradé silencieux (fail-closed).
- `verifyUpdateCodeSignature: false` est INCHANGÉ : décision de fond ADR-023
  (releases non signées par certificat) — à réviser uniquement avec l'arrivée
  d'un certificat de signature, jamais dans le cadre de ce revert.

## Vérification

- `npm run release:smoke` + `npm run release:checksums` verts (contrats
  release/ inchangés : entrées, preload sandbox-safe, SHA256SUMS).
- Garde future : tout repassage à `false` exige un nouvel ADR + revert
  documenté, jamais un commit silencieux.
