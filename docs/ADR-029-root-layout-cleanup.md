# ADR-029 — Réorganisation de la racine : nettoyage sans déplacement de code

## Statut

Accepté — 2026-09-20 (branche `chore/root-layout`).

## Problème

La racine contenait 51 entrées (fichiers + dossiers), contre ~18 attendues par
le standard 2026 (`electron-vite-react` + guide React 2026) :

- 5 dossiers de sortie de build présents sur disque (`dist/`,
  `dist-electron/`, `dist-license-manager/`,
  `dist-license-manager-renderer/`, `release/` ~800 Mo), dont deux non couverts
  par `.gitignore`.
- 10 rapports à la racine (`PHASE_0..4_REPORT.md`, `AUDIT_REPORT.md`,
  `FULL_PROJECT_QA_AUDIT.md`, `FINAL_REPAIR_REPORT.md`, `REPAIR_CHANGELOG.md`,
  `RELEASE_NOTES.md`).
- `nv icons/` (espace dans le nom, 2 JPG sources) hors convention kebab-case.
- `VELORIA_POS_FROM_SCRATCH_MARKDOWN/` (28 fichiers de spec) à la racine alors
  que `README.md` la déclare source of truth.
- `test-results/`, `*.tsbuildinfo` présents malgré le gitignore.

## Contrainte : contrat de packaging (ne pas casser)

12+ références codent en dur les noms de sortie : `package.json:10` (`main`),
`electron-builder.yml:8-9`, `electron-builder.license-manager.yml:8-11`,
`scripts/licensing/sign-*.mjs`, `license-manager/main/window-manager.ts:36`,
`tests/unit/root-repair.test.ts`, manifestes d'intégrité signés. De même,
`public/icons/`, `resources/license/`, `resources/ocr/lang/`,
`database/migrations/` font partie du contrat d'empaquetage et d'intégrité.
`electron/backup/backup.service.ts` est importé par `electron/main/main.ts:29`
et `electron/ipc/registry.ts:46`.

## Décision : nettoyage seul, zéro déplacement de code

1. `.gitignore` complété : `dist-license-manager/`,
   `dist-license-manager-renderer/` (le reste existait déjà).
2. Suppression locale (régénérable par build) : `dist*/`, `release/`,
   `test-results/`, `tsconfig.*.tsbuildinfo`.
3. Rapports → `docs/reports/` (10 fichiers) ; références mises à jour
   (`README.md`, `ADR-005`, `ADR-023`, notes internes des rapports).
4. Sources de marque `nv icons/*.jpg` → `resources/brand-sources/*.jpg`
   (kebab-case, sans espace) ; `nv icons/` supprimé.
5. Specs → `docs/specs-archive/` (historique git conservé par renommage) ;
   `README.md` pointe la nouvelle localisation.
6. `private/` (clés vendor, gitignoré) et `electron/`, `license-manager/`,
   configs `vite.*` / `electron-builder.*` / `tsconfig.*` : **inchangés**.
7. Migration `apps/` monorepo **reportée** : déclencheurs = 3e application ou
   bibliothèque réellement partagée POS↔Manager. Coût actuel (15+ chemins,
   resignatures) sans valeur métier immédiate.

## Conséquences

- Racine : 12 dossiers + 19 fichiers de config/doc (contre 20 + 31).
- `npm run format` appliqué aux seuls fichiers touchés (l'arbre contenait déjà
  24 fichiers non formatés hors périmètre — laissés intacts).
- Chaîne AGENTS.md §8 verte après l'opération : typechecks ×3, 339 tests
  (51 fichiers), `verify:migrations`, 4 builds (renderer, electron + manifeste
  118 fichiers, manager-client, manager).
- Sauvegarde préalable : `VELORIA_POS_FROM_SCRATCH_MARKDOWN/` + `nv icons/`
  copiés hors workspace avant toute suppression.
- Rollback : suppression de la branche (aucun commit exigé par cette ADR).
