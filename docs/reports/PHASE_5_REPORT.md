# PHASE 5 — Réorganisation de la racine (2026-09-20)

Nettoyage de la racine vers le standard 2026, sans déplacement de code
ni renommage de sorties (décision : `docs/ADR-029-root-layout-cleanup.md`).
Branche : `chore/root-layout`. Aucun commit imposé — revue puis merge manuel.

## Avant / Après

| Élément               | Avant                                                                | Après                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Dossiers racine       | 20 (`dist×4`, `release/`, `test-results/`, `nv icons/`, `VELORIA_…`) | 12 (`database`, `docs`, `electron`, `license-manager`, `node_modules`, `private`, `public`, `resources`, `scripts`, `src`, `tests` + `.git`) |
| Fichiers racine       | 31 (10 rapports)                                                     | 19 (configs + `README.md` + `AGENTS.md`)                                                                                                     |
| `.gitignore`          | `dist-license-manager*/` non couverts                                | couverts                                                                                                                                     |
| Rapports              | racine                                                               | `docs/reports/` (10 fichiers)                                                                                                                |
| Specs source of truth | `VELORIA_POS_FROM_SCRATCH_MARKDOWN/`                                 | `docs/specs-archive/` (28 fichiers)                                                                                                          |
| Sources de marque     | `nv icons/` (espace)                                                 | `resources/brand-sources/` (kebab-case)                                                                                                      |

## Opérations

1. **Phase 0** : ligne de base (`typecheck` ×3 verts), branche
   `chore/root-layout`, sauvegarde externe des dossiers déplacés.
2. **Phase 1** : `.gitignore` complété + suppression locale des régénérables
   (`dist*/`, `release/` ~800 Mo, `test-results/`, `*.tsbuildinfo`).
3. **Phase 2** : 10 rapports → `docs/reports/` (`git mv` pour les 4 suivis,
   déplacement simple pour les 6 non suivis) + MAJ références (`README.md`,
   `ADR-005`, `ADR-023`).
4. **Phase 3** : 2 JPG → `resources/brand-sources/` (renommés kebab-case),
   specs → `docs/specs-archive/`, MAJ 5 références internes.
   `private/vendor-keys/` non touché (secret gitignoré).
5. **Phase 4** : chaîne qualité complète (ci-dessous).
6. **Phase 5** : `ADR-029` + présent rapport.

## Vérification (AGENTS.md §8)

| Contrôle                                                       | Résultat                        |
| -------------------------------------------------------------- | ------------------------------- |
| `prettier --write` (fichiers touchés)                          | OK                              |
| `typecheck` / `:electron` / `:manager`                         | 0 erreur ×3                     |
| `npm test`                                                     | 51 fichiers, 339 tests, 0 échec |
| `verify:migrations`                                            | MIGRATIONS VERIFIED             |
| `build` (renderer → `dist/`)                                   | OK 13,4 s                       |
| `build:electron` (→ `dist-electron/` + manifeste 118 fichiers) | OK                              |
| `build:manager-client` + `build:manager`                       | OK                              |

## Non fait (volontairement)

- Aucun renommage `dist*` (contrat packaging/intégrité, 12+ références).
- Aucun déplacement `electron/`, `license-manager/`, `public/icons/`,
  `resources/*`, `database/migrations/`.
- Pas de migration `apps/` monorepo (voir ADR-029 : déclencheurs futurs).
- Les 24 fichiers non formatés hors périmètre sont laissés intacts (travail
  en cours préexistant, arbre déjà sale avant l'opération — 273 entrées).
