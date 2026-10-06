# ADR-058 — Rangement racine + archives + carte maintenance

Date : 2026-10-02
Statut : accepté (appliqué le jour même, `git mv` — historique préservé)
Relève : ADR-029 (root-layout-cleanup), ADR-031 (radical-cleanup), ADR-048 (cleanup-guards)

## Contexte

La racine contenait 8 rapports suivis (`AUDIT_REPORT.md`, `CLEANUP_REPORT.md`,
`FIX_PLAN.md`, `INVOICES_DESIGN.md`, `PHASE_2/3/4/CLIENT_V1_REPORT.md`) en doublon
partiel avec `docs/reports/` (les versions racine de `AUDIT`/`PHASE_2/3/4` sont des
documents **différents**, pas des copies — suppression interdite), plus 25 fichiers
de maquettes `stitch_veloria_client_mobile_app/` (HTML/PNG, non-code) qui
polluaient `git ls-files`, le scan de secrets et la lecture du projet.
Pas de `.prettierignore` (le format touchait `dist*/`, `release/`, les maquettes),
et ESLint n'ignorait ni `test-results/`, ni `playwright-report/`, ni les maquettes
archivées. Aucune carte d'orientation n'existait pour un mainteneur neuf.

## Décision

1. Racine maigre : seuls `README.md` + `AGENTS.md` restent en `.md` à la racine.
   - `PHASE_CLIENT_V1_REPORT.md` (sans conflit) → promu `docs/reports/` (canonique).
   - Les 7 autres → `docs/archive/root-legacy/` (renommage unique :
     `AUDIT_REPORT.md` → `AUDIT_REPORT-2026-09-29.md` car `docs/reports/`
     contient déjà un `AUDIT_REPORT.md` différent).
2. Maquettes → `docs/archive/stitch/stitch_veloria_client_mobile_app/` (lecture
   seule, jamais importée ni empaquetée). `secret-scan.mjs` suit le nouveau chemin,
   commentaire `primitives.tsx` pointe vers `ADR-033/035/036` au lieu d'un chemin
   fantôme (`stitch_veloria_pos_desktop_system/…` n'existe plus sur disque).
3. Carte maintenance : nouveau `docs/STRUCTURE.md` (tranche verticale, tableau des
   dossiers, checklist d'ajout, pièges connus) + `docs/archive/README.md` (index
   des archives) + lien depuis `README.md`.
4. Hygiène outillage : nouveau `.prettierignore` (builds, archives, vendor, logs,
   caches) + `eslint.config.mjs` ignore `test-results/`, `playwright-report/`,
   `mobile/android|ios|.expo`, `docs/archive/stitch/`.
5. Aucune migration touchée, aucune logique métier touchée, aucun test renommé —
   que des déplacements suivis + docs + configs d'outillage.

## Conséquences

- `git ls-files` racine : plus aucun rapport ni maquette — `docs/reports/` est
  l'unique canonique des phases, `docs/archive/` l'unique lieu des archives.
- `npm run format` ne touche plus les artefacts ni les maquettes (plus rapide,
  zéro diff parasite). `npm run lint` ignore les sorties de test et l'archive.
- Tout nouveau rapport de phase va dans `docs/reports/`, toute maquette/archive
  dans `docs/archive/` (garde : relecture + `STRUCTURE.md §7`).
- Portes : `format → typecheck(+electron+manager) → verify:migrations → test`
  rejouées après le rangement (voir `PHASE_X_REPORT.md` suivant).

## Alternatives rejetées

- Supprimer les doublons racine : refusé — contenus divergents, perte d'historique.
- Laisser les maquettes à la racine avec un `.gitignore` : refusé — fichiers déjà
  suivis, le gitignore ne les aurait pas masqués sans `git rm --cached` destructeur.
- Déplacer les rapports divergents dans `docs/reports/` sous le même nom :
  refusé — écrasement silencieux d'une version. L'archive préserve les deux.
