# ADR-155 — Montée de gamme de l'outillage : dernière version compatible (2026-10)

- **Date** : 2026-10-29
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : racine du dépôt, chaîne de build, outillage de test/lint, runtime
  Electron et bibliothèques exposées au renderer. **Aucune migration SQLite**,
  aucun changement de règle métier, aucune modification de schéma.

## Contexte

L'audit des dépendances du 2026-10-28 montrait une dérive de plusieurs majeures :
Electron 37, Vite 6, Vitest 3, ESLint 9, TypeScript 5.7, Zod 3, lucide-react
0.469 et better-sqlite3 12. Le propriétaire a demandé une remise à niveau
« dernière version, selon compatibilité » sans casser les invariants du POS :
SQLite seule source métier, renderer derrière `window.veloria`, émission
CommonJS du main/preload, fonctionnement hors ligne, migrations immuables.

Contraintes de compatibilité vérifiées avant toute installation :

- `typescript-eslint@8.72.1` déclare `typescript >=4.8.4 <6.1.0` : **TypeScript 7
  est incompatible avec la porte lint actuelle**.
- `@vitejs/plugin-react@6` exige Vite `^8` ; `vitest@5` exige Vite `>=6.4` ;
  `@tailwindcss/vite@4.3` accepte Vite 8.
- Electron 45 embarque Chromium 156 / Node 24.22 ; `better-sqlite3@13` est
  N-API avec des prebuilds (`prebuilds/win32-x64.node`), donc plus de
  recompilation ABI.
- Le poste et la CI exécutent Node 22.23 ; Vite 8, Vitest 5 et
  better-sqlite3 13 exigent tous Node `>=22.12`.
- `mobile/` (Expo 52, React Native 0.76, React 18) est une toolchain séparée :
  elle reste **hors périmètre** de cette montée de gamme.

## Décision — grille retenue

| Paquet                    | Avant   | Après   | Motif                                                                |
| ------------------------- | ------- | ------- | -------------------------------------------------------------------- |
| electron                  | 37.2.0  | 45.1.0  | Dernière stable (Chromium 156, Node 24.22)                           |
| better-sqlite3            | 12.2.0  | 13.0.3  | N-API, prebuilds, SQLite 3.53.4 ; supprime rebuild/bindings          |
| vite                      | 6.0.7   | 8.3.5   | Rolldown/Oxc ; Node `>=22.12`                                        |
| @vitejs/plugin-react      | 4.3.4   | 6.1.2   | Compatible Vite 8                                                    |
| vitest / coverage-v8      | 3.1.1   | 5.0.5   | Node 22.12+, Vite 8                                                  |
| eslint                    | 9.17.0  | 10.13.0 | Flat config, nouvelles règles recommandées                           |
| @eslint/js                | —       | 10.0.1  | Dépendance explicite (n'était plus garantie transitivement)          |
| typescript                | 5.7.3   | 6.0.3   | Dernière version supportée par typescript-eslint `<6.1`              |
| zod                       | 3.24.1  | 4.6.7   | Dernière stable ; migration des API dépréciées                       |
| lucide-react              | 0.469.0 | 1.63.0  | Icônes actuelles ; aucun brand icon utilisé                          |
| tailwindcss / plugin      | 4.1.5   | 4.3.3   | Dernière 4.x ; tailwind-merge 3.7 est le pair correct                |
| tailwind-merge            | 2.6.0   | 3.7.0   | Supporte Tailwind 4.0 → 4.3                                          |
| react / react-dom         | 19.1.1  | 19.3.1  | Mineure sans rupture ; types 19.3                                    |
| zustand                   | 5.0.2   | 5.0.16  | Patch                                                                |
| pdfjs-dist                | 6.3.289 | 6.4.299 | Patch                                                                |
| @playwright/test          | ^1.63   | ^1.64.1 | Patch                                                                |
| prettier                  | 3.4.2   | 3.9.10  | Reformatage de 39 fichiers                                           |
| electron-builder          | 26.0.12 | 26.18.0 | Support Electron 45                                                  |
| typescript-eslint         | 8.19.1  | 8.72.1  | Compatible ESLint 10 / TypeScript 6                                  |
| eslint-plugin-react-hooks | ^5.2.0  | ^7.1.1  | Compatible ESLint 10                                                 |
| esbuild                   | —       | 0.28.2  | Vite 8 ne fournit plus esbuild implicitement (préloads main/manager) |
| @electron/rebuild         | 4.0.1   | retiré  | Inutile avec N-API                                                   |
| bindings                  | 1.5.0   | retiré  | Dépendance transitive de better-sqlite3 12, absente en 13            |

## TypeScript 6, pas 7

TypeScript 6.0.3 est la dernière version que `typescript-eslint` accepte. La 7
(native, Go) reste bloquée tant que la porte lint ne la supporte pas : monter
la 7 aurait obligé à désactiver le lint typé, ce qui est refusé.

TS 6 traite les dépréciations comme des **erreurs** :

- `baseUrl` supprimé de `tsconfig.json` et `tsconfig.electron.json` ; les
  `paths` deviennent relatifs au fichier (`./src/*`) ;
- `moduleResolution: "node10"` reste requis pour l'émission CommonJS de
  `electron/` et `license-manager/` ; il est explicite avec
  `"ignoreDeprecations": "6.0"` et un commentaire. Une migration `node16`
  exigerait des `package.json` par sous-arbre (les fichiers `src/` inclus dans
  le projet Manager sont ESM au niveau racine), elle est reportée à TS 7.

## Electron 45 + better-sqlite3 13 (N-API)

- `better-sqlite3@13` livre des binaires N-API par plateforme. Le paquet
  contient `prebuilds/win32-x64.node` (SQLite 3.53.4) et se charge sans
  `electron-rebuild`.
- Suppression de `@electron/rebuild`, `bindings`, du script `postinstall` et
  du script `rebuild` ; `npmRebuild: false` dans les deux configurations
  `electron-builder`, `asarUnpack: **/*.node` inchangé.
- La CI ne cherche plus `build/Release/better_sqlite3.node` : elle ouvre une
  base `:memory:` avec `better-sqlite3` pour prouver le chargement.
- Vérifié sur le paquet réel : `app.asar.unpacked/.../prebuilds/win32-x64.node`
  présent, `component-smoke` passe sur `release/win-unpacked/Veloria PoS.exe`.
- **Dette tracée** : `safeStorage.isEncryptionAvailable/encryptString/
decryptString` sont dépréciés en Electron 45 et retirés en 46. Les six appels
  (licensing + sync) restent avec une dérogation eslint documentée ; la
  migration async est un chantier séparé (chemins de lecture/écriture
  synchrones du licensing et de la sync, à traiter avant Electron 46).

## Vite 8 / Rolldown, Vitest 5, ESLint 10

- `build.rollupOptions` → `build.rolldownOptions`.
- `manualChunks` (forme objet) n'existe plus : remplacé par
  `codeSplitting.groups` avec deux groupes prioritaires (`react`, `vendor`) et
  `includeDependenciesRecursively`. Le build produit désormais un chunk
  `rolldown-runtime` et un découpage plus fin ; le plafond d'alerte reste 600 Ko.
- `esbuild@0.28.2` est une devDependency explicite : Vite 8 ne l'installe plus
  pour les préloads ; les scripts appellent `esbuild` (plus `npx`).
- `import.meta.dirname` remplace `__dirname` dans les configs Vite/Vitest
  (avertissement `configLoader: native`).
- Vitest 5 : `clearMocks` passe à `true` par défaut, la suite reste verte sans
  réglage. Les seuils de couverture DOMAINE/APPLICATION restent 80/75/88/80 par
  fichier.
- **Porte features recalibrée** (décision propriétaire 2026-10-29) : Vitest
  5/V8 compte les branches autrement et inclut les hooks `use*.ts` à 0 % (ils
  exigent React/DOM). Les hooks sont exclus du périmètre « modules purs sans
  DOM » ; la mesure réelle devient 53,77 statements · 66,11 branches · 74,62
  fonctions · 52,92 lignes (contre 27/82/65/27 avant avec l'ancien instrument).
  Les planchers passent à **50/65/70/50** : trois montent, seule la branche
  baisse (80 → 65) parce que l'instrument de mesure a changé, pas le code.
  Cinq tests de bornes ajoutés pour `proforma-rules.ts` (devis vide, >500
  lignes, ligne sans nom, remise > sous-total, répartition exacte) ; la suite
  features reste 160 fichiers / 1 085 tests.
- ESLint 10 : `@eslint/js` explicite, `preserve-caught-error` satisfaite par
  17 `cause` ajoutées. Deux règles sont neutralisées avec justification :
  `no-useless-assignment` (34 initialisations neutres avant `try/catch`) et
  `@typescript-eslint/no-unnecessary-type-conversion` (423 conversions de
  frontière SQLite/OCR, où le type TS peut mentir au runtime).

## Zod 4 et lucide 1

- `z.string().uuid()` → `z.uuid()` (51 occurrences) ; `.passthrough()` →
  `.loose()` (12) ; `.strict()` → `z.strictObject`.
- `z.ZodIssueCode.custom` → `"custom"` ; `.innerType()` supprimé : le schéma
  d'impression est scindé en `printPayloadBase` (extensible) +
  `printPayloadSchema` (base + `superRefine`).
- `z.ZodEffects` n'existe plus : le garde `schemaRequiresOperationId` lit
  directement `shape` (les `refine` Zod 4 conservent la classe objet).
- **Bug de production détecté par les tests** : `z.uuid()` est un `ZodUUID`,
  pas un `ZodString` ; le garde renvoyait `false` pour tous les schémas
  idempotents, ce qui aurait désactivé l'exigence d'`operationId` dans
  `handle.ts`. Le garde accepte désormais `ZodString | ZodUUID` (test
  `operation-id-coverage` 8/8).
- lucide-react 1.63 conserve `AlertTriangle` (alias) ; aucun brand icon n'est
  utilisé dans le POS, aucune icône retirée n'a dû être remplacée.

## Racine, Node et CI

- `engines` : Node `>=22.12.0`, npm `>=10.9.0` ; `packageManager: npm@10.9.9` ;
  `.nvmrc` = `22` ; CI `setup-node` lit `.nvmrc`.
- Pas de monorepo : la règle §8.6 de `docs/STRUCTURE.md` (un seul fichier
  SQLite offline-first, trains POS/APK découplés) reste valable. Le tronc
  racine reste volontairement maigre ; la modernisation porte sur les configs,
  pas sur un déplacement de dossiers.
- `mobile/` inchangé (Expo 52 / RN 0.76 / React 18) : une montée Expo est une
  décision produit séparée.

## Conséquences et limites

- Installation sans Visual Studio Build Tools : `npm ci` récupère le prebuild
  N-API. Sur ce poste, `node_modules/electron/dist/resources/default_app.asar`
  était verrouillé par le scanner (EBUSY) pendant la session : Electron 45 a
  été remplacé **dans la même arborescence** depuis le paquet officiel et le
  lock a été régénéré avec `--package-lock-only`. Un `npm ci` sur une machine
  propre installe la version du lock ; ne jamais forcer `rm` sur l'artefact
  verrouillé (STRUCTURE §7).
- `release/win-unpacked/` a été régénéré pour la vérification (Electron 45) ;
  les installateurs livrés (`release/*.exe`) n'ont pas été reconstruits.
- Les tailles de chunks changent (lucide 1 / Zod 4) : la porte de build reste
  sous 600 Ko par chunk, aucune régression métier.
- TypeScript 7, migration async `safeStorage` (Electron 46) et montée Expo sont
  les trois dettes explicites laissées ouvertes.

## Vérifications (2026-10-29)

- `format:check`, `typecheck` ×3, `lint`, `verify:migrations`, `verify:domain`,
  `verify:perf`, `verify:fr`, `verify:encoding`, `license:scan` : verts.
- `npm test` : **169 fichiers / 1 146 tests** (5 tests `proforma-rules`
  ajoutés), 0 échec (Vitest 5).
- `build` POS + `build:electron` + `build:manager-client` + `build:manager` :
  verts (Vite 8/Rolldown, TS 6).
- E2E Electron 45 : **11/11** (activation/DPAPI, PDF, studio impression, vente
  SQLite) + `component-smoke` sur l'application empaquetée.
- Couverture : `test:coverage` vert (seuils 80/75/88/80 par fichier, proforma
  90 % branches après ajout des tests) ; `test:coverage:features` vert avec les
  planchers recalés 50/65/70/50 (mesure 53,77/66,11/74,62/52,92).
