# ADR-156 — Organisation du tronc racine : config/, tsconfig.base et automatisation

- **Date** : 2026-10-29
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : racine du dépôt, configurations d'outils, scripts npm, CI,
  automatisation des dépendances. **Aucun changement runtime**, aucune
  migration SQLite, aucune modification de règle métier.

## Contexte

ADR-155 a remis la chaîne d'outils à niveau (Electron 45, Vite 8, Vitest 5,
ESLint 10, TypeScript 6, Zod 4). La racine restait toutefois encombrée :
quinze fichiers de configuration, deux `tsbuildinfo` générés à la racine et des
commandes de qualité dupliquées entre le poste et la CI.

Les conventions 2026 retenues :

- les **points d'entrée attendus par les outils** (`package.json`,
  `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs`)
  restent à la racine — les déplacer ajoute des flags `--config` et casse la
  découverte IDE sans gain ;
- les **configs non standard** (electron-builder, Playwright, Knip) vont dans
  `config/` ;
- un **`tsconfig.base.json`** partagé évite la duplication des options strictes
  entre renderer, main/preload et Manager ;
- les sorties de build (`tsbuildinfo`) vont dans un cache ignoré, pas à la
  racine ;
- la **gouvernance** (scripts uniques, politique npm, Renovate, CI) est
  versionnée avec le code.

Le monorepo reste refusé (STRUCTURE §8.6) : un seul fichier SQLite
offline-first, trains POS/APK découplés, Expo hors `tsc` racine.

## Décisions

### 1. `config/` pour les outils non standard

| Avant                                  | Après                                 | Consommateur                  |
| -------------------------------------- | ------------------------------------- | ----------------------------- |
| `electron-builder.yml`                 | `config/electron-builder/pos.yml`     | `electron-builder --config …` |
| `electron-builder.license-manager.yml` | `config/electron-builder/manager.yml` | `electron-builder -c …`       |
| `playwright.config.ts`                 | `config/playwright.config.ts`         | `playwright test --config …`  |
| `knip.json`                            | `config/knip.json`                    | `knip --config …`             |

- Playwright résout `testDir` **relativement au fichier de config** : il devient
  `../tests/e2e` (vérifié : 54 tests listés).
- electron-builder charge bien le fichier déplacé ; les chemins internes
  (`release/`, `public/`) restent relatifs au projet.
- Knip est invoqué via `npx --yes knip@6.43.0` (outil d'analyse, 12 dépendances
  directes) pour ne pas alourdir le lock de production ; il reste épinglé.
- `tsconfig.json` inclut désormais `config/**/*.ts` (Playwright) pour le lint
  typé et le typecheck.

### 2. `tsconfig.base.json` et cache `tsbuildinfo`

Options communes extraites : `target ES2022`, `skipLibCheck`, `strict`,
`noUncheckedIndexedAccess`, `noUnusedLocals`, `noFallthroughCasesInSwitch`,
`forceConsistentCasingInFileNames`, `isolatedModules`, `resolveJsonModule`.
Les trois projets font `extends` et ne gardent que leurs différences
(`noUnusedParameters: false` pour le Manager, `exactOptionalPropertyTypes` pour
le renderer, module/résolution CJS pour main/Manager).

Les `tsbuildinfo` sont redirigés vers
`node_modules/.cache/tsbuildinfo/{root,electron,manager}.tsbuildinfo` ;
`npm run clean` supprime ce dossier. Les anciens fichiers racine ont été
supprimés.

`mobile/tsconfig.json` reçoit `ignoreDeprecations: "6.0"` : `expo/tsconfig.base`
utilise encore `node10` et TypeScript 6 le refuse (même contrainte que
`tsconfig.electron.json`, dette TS 7).

### 3. Gouvernance et automatisation

- **Scripts uniques** : `check` (format + lint + typecheck ×3 + mobile),
  `verify` (migrations + domaine + fr + encoding + perf + licence), `ci`
  (check + tests + couvertures + verify + builds + knip), `knip`. La CI appelle
  ces scripts au lieu de dupliquer les commandes.
- **`.npmrc`** : `engine-strict=true` (Node `>=22.12`) et `save-exact=true`
  (les versions restent épinglées comme dans `package.json`).
- **Renovate** : `.github/renovate.json` (config recommandée, semaines,
  regroupement outillage / runtime Electron-SQLite, majeures soumises au
  dashboard). Inactif tant qu'aucun remote n'est configuré, mais prêt.
- **CI** : `concurrency` (annule les runs obsolètes), `permissions: contents:
read`, `timeout-minutes: 60`, et étapes `check`/`knip`/`verify`/builds.

## Conséquences et limites

- La racine perd quatre fichiers de configuration et les `tsbuildinfo` ; elle
  garde les entrées attendues par les outils et la documentation vivante
  (`README`, `AGENTS`, `handoff`).
- **Packaging non re-vérifié** : l'extraction Electron est bloquée par le
  scanner (`default_app.asar`, EBUSY) sur ce poste, comme en session 64. Le
  fichier de config déplacé est bien chargé ; la commande complète
  (`npm run package:win`) reste à rejouer après redémarrage ou sur machine
  propre. Ne jamais forcer `rm` sur l'artefact verrouillé.
- Aucun impact runtime : les seuls changements sont des chemins de
  configuration, des scripts et des caches.
- Renovate restera sans effet tant que le dépôt n'aura pas de remote.

## Vérifications (2026-10-29)

- `npm run ci` : **exit 0** — check, 169 fichiers / 1 146 tests, coverage et
  coverage:features, verify, builds, knip.
- `npm run check` : format, lint, typecheck ×3, typecheck mobile — verts après
  l'ajout de `ignoreDeprecations` au tsconfig mobile.
- `npm run knip` : 0 finding (config `config/knip.json`).
- Playwright : `--config config/playwright.config.ts --list` → **54 tests /
  24 fichiers**.
- `npm test` : 169 fichiers / 1 146 tests (aucun code runtime modifié).
- `npm run build`, `build:electron`, `build:manager-client`, `build:manager` :
  verts.
- E2E `component-smoke` avec la config déplacée : 1/1.
- Packaging complet : bloqué par le verrou scanner (voir limites).
