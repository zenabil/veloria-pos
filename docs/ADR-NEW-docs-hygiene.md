# ADR-NEW — Hygiene docs : intrus hors docs, index unique, archive read-only

## Contexte

`docs/` contenait ~156 md, 9 scripts `*.ps1` + 8 journaux `*.log` sous
`docs/reports/maintenance/`, et 2 sources de marque `brand-*.jpg` a la racine.
Trois manifestes coexistaient (`STRUCTURE.md`, `specs-archive/INDEX.md`,
`archive/README.md`) sans point d entree unique. Les artefacts `stitch/` et
`veloria customer.jpg` dans `docs/archive/` sont historiques et restent en
lecture seule.

## Decision

1. Tous les `*.ps1` / `*.log` / `*.jpg` intrus quittent `docs/` vers
   `scripts/maintenance/` (19 fichiers, deplacement filesystem, dossier
   `docs/reports/maintenance/` conserve ses `*.md` canoniques).
2. `docs/INDEX.md` devient le seul point d entree global : il pointe
   `ADR-001..070` + rapports saries + la carte `STRUCTURE.md`.
   Les manifestes locaux (`archive/README.md`, `specs-archive/INDEX.md`)
   restent des descripteurs de section, pas des index concurrents.
3. `docs/archive/` reste read-only : aucun import depuis `src/` / `electron/`.
   Preuve : `grep docs/archive` ne retourne qu un commentaire
   (`src/shared/ui/primitives.tsx:3`), zero `import`/`require`.
4. Aucun ADR sarie supprime, aucun contenu historique modifie, aucun code
   (`src/`, `electron/`, `database/`) touche, aucun nouveau dossier sous `docs/`.

## Conflit signale (bloquant verifie)

La verifie `ls docs/*.md <= 10` est incompatible avec l interdiction de
supprimer un ADR sarie et de creer un dossier `docs/` : 70 ADR doivent rester
a la racine (71 md + `INDEX.md` + cet ADR = 73). La relocalisation des ADR
exigerait une decision explicite (`docs/adr/`) hors de ce mandat.

## Verifications

- `Get-ChildItem docs -Recurse -Filter *.ps1` = vide ; `*.log` = vide.
- `grep -r "docs/archive" src electron` (ts/tsx) = commentaire seul, zero import.
- `npm run format:check` sur les fichiers touches.
