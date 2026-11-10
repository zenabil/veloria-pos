# STRUCTURE — Carte du projet Veloria PoS (maintenance)

> Lire en premier avec `AGENTS.md` + `README.md`.
> Convention : une fonctionnalité = une **tranche verticale** > `features/<domaine>/` → `application/` → `domain/` → `electron/ipc/handlers/*.repo.ts`
> → `database/migrations/NNNN_*.sql` → `tests/{unit,integration,database,e2e}`.

## 1. Racine (volontairement maigre)

| Chemin                                                                      | Rôle                                                                                             | Ne jamais y mettre                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `README.md`, `AGENTS.md`                                                    | Entrée projet + règles contributeurs                                                             | Rapports de phase (→ `docs/reports/`)                   |
| `package.json`                                                              | Scripts uniques (`check`, `verify`, `ci`, `dev`, `build*`, `typecheck*`, `test*`, `package:*`)   | Logique métier                                          |
| `index.html`, `vite.config.ts`, `public/`                                   | Renderer POS (Vite, `base ./`)                                                                   | Données métier                                          |
| `config/`                                                                   | Configs non standard : `electron-builder/{pos,manager}.yml`, `playwright.config.ts`, `knip.json` | Entrées d'outils attendues à la racine (Vite/TS/ESLint) |
| `tsconfig.json` / `.electron.json` / `.manager.json` / `tsconfig.base.json` | POS+tests / main-preload / Manager / options strictes partagées                                  | Options divergentes dans la base                        |
| `eslint.config.mjs`, `.prettierrc`, `.prettierignore`                       | Garde-fous (renderer isolé, FR, centimes)                                                        | —                                                       |
| `opencode.jsonc`, `skills-lock.json`, `CLAUDE.md`                           | Outillage skills projet (`AGENTS.md` lie les deux)                                               | Dépendance runtime                                      |
| `vitest.config.ts`, `vitest.features.config.ts`                             | Portes de test (unit/integration/database, écrans)                                               | Scénarios métier dans le config                         |
| `.nvmrc`, `packageManager`, `engines`                                       | Node 22.12+ / npm 10.9+ (CI alignée ; Electron 45 embarque Node 24.22)                           | Version Node ad hoc dans un script                      |
| `handoff.md`                                                                | Continuité entre sessions (§1 = état courant, une section par session)                           | Duplication de l'ADR (pointe, ne recopie pas)           |

## 2. Runtime POS (le seul qui compte en prod)

```
src/app/shell/          Chrome (App.tsx, WindowChrome.tsx) + main.tsx
src/features/<domaine>/ Écrans + dialogs/ + types.ts (FR uniquement)
src/shared/             ui/, types/ipc-*, errors/fr-map, money/parse,
                        formatters/, documents/, dates, company, settings, sound, export/csv
src/domain/             Pur, framework-free (money, sales, customers, inventory,
                        suppliers, returns, proforma, closings, expenses,
                        packaging (carton), barcode, units, ocr, … — liste
                        complète : docs/METRICS.md)
src/application/        Use-cases fins (sales/create-sale, sales/packaging-lines,
                        customers/client-access)
electron/               main/, ipc/{channels,validators,registry + handlers/*.repo.ts},
                        database/, preload/ (seul pont window.veloria),
                        licensing/, printing/, ocr/, backup/, sync/, security/
database/migrations/    IMMUABLES (plage exacte : docs/METRICS.md) — tout changement = NOUVELLE migration
                        + `npm run verify:migrations` vert
```

Règles dures (voir `AGENTS.md`) :

1. SQLite seule source métier. `localStorage` = prefs UI seules.
2. Renderer → `window.veloria` uniquement (garde ESLint `no-restricted-imports`).
3. IPC `domain.action` + Zod (`channels.ts`, `validators.ts`, `registry.ts`). Zéro `run-sql`.
4. Argent = centimes entiers DZD + `db.transaction()` + `operationId` idempotent.
5. `src/domain` sans `react`/`electron`/`better-sqlite3` (repos = prepared statements).
6. UI FR + `frError()` — jamais d'exception brute.

## 3. Outils vendor / satellites (périmètres séparés)

| Dossier                        | Quoi                                                                                                                                                  | Toolchain                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `license-manager/`             | 2ᵉ app Electron (émission `.vlic` Ed25519)                                                                                                            | `tsconfig.manager.json`, `vite.license-manager.config.ts` |
| `mobile/`                      | APK Expo lecture seule (exception bilingue ADR-051)                                                                                                   | Expo/EAS, hors `tsc` racine                               |
| `cloud/supabase/`              | Miroir jetable lecture seule (ADR-053), `functions/client-sync`                                                                                       | Deno, jamais master                                       |
| `scripts/`                     | `database/` (verify, integrity, relocate, probes), `licensing/` (scan, sign, keygen), `quality/` (domain, perf), `release/` (stamp, smoke, checksums) | Node pur, couverts par exécution                          |
| `resources/license/public.key` | Clé publique embarquée (fail-closed)                                                                                                                  | `license:scan` obligatoire avant package                  |
| `private/`                     | Clés vendor + `.vlic` locaux — GITIGNORÉ, jamais committé                                                                                             | —                                                         |

## 4. Docs (où écrire quoi)

| Dossier                   | Quoi                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/ADR-*.md`           | Décisions d'ingénierie (séquentiel, jamais réécrit — dernier ADR : cf. docs/METRICS.md — une révision = un nouvel ADR qui pointe l'ancien) |
| `docs/INDEX.md`           | Index des ADR + Où écrire quoi (pointe, ne duplique pas)                                                                                   |
| `docs/METRICS.md`         | **Volumétrie vivante** (migrations, canaux, tests, ADR) — section générée, gardée par `verify:docs`                                        |     |
| `handoff.md` (racine)     | État courant + une section par session — la doc vivante du chantier                                                                        |
| `docs/reports/PHASE_*.md` | Avancement par phase (canonique — la racine n'en contient plus)                                                                            |
| `docs/archive/`           | `root-legacy/` (anciens rapports racine) + `stitch/` (maquettes) — lecture seule                                                           |
| `docs/licensing/`         | `CAPABILITIES.md`, `ACTIVATION.md`, … (détail licences)                                                                                    |
| `docs/specs-archive/`     | Spec source of truth (figée)                                                                                                               |
| `docs/STRUCTURE.md`       | Ce fichier (carte maintenance)                                                                                                             |

## 5. Tests (portes vertes)

```
tests/unit/         Règles domaine pures + contrats IPC + bridge-shape
tests/integration/  Tranches atomiques SQLite réel (ventes, FIFO, carts, sync…)
tests/database/     Migrations + invariants racine (toutes rejouées)
tests/e2e/          Playwright + Electron réel, base vierge par test (1 worker)
```

Commandes : `test`, `test:db`, `test:e2e`, `test:coverage` (seuils 80/75/88/80
sur `src/domain` + `src/application`), `test:coverage:features` (cran
interface), `verify:migrations`, `verify:domain`, `verify:docs`, `verify:perf`,
`verify:fr`, `verify:encoding`, `license:scan`.

Volumétrie (fichiers de test, canaux IPC, migrations, ADR) : **source unique**
`docs/METRICS.md` — section générée par
`node scripts/quality/verify-docs.mjs --write`, **gardée** par
`npm run verify:docs` (porte rouge si un compteur du code bouge sans que la
documentation suive). Règle : aucun compteur n'est recopié à la main ailleurs —
les documents y renvoient.

## 5 bis. Compétences projet (`.opencode/`) — la mémoire de l'agent

Standard **Agent Skills** (OpenCode v2) : `.opencode/skills/<nom>/SKILL.md`,
`name` = nom du dossier (`^[a-z0-9]+(-[a-z0-9]+)*$`), `description` ≤ 1024
caractères (seul texte lu avant activation), corps < 5 000 jetons, détail
approfondi dans `references/*.md` (divulgation progressive). ADR-179.

| Compétence         | Domaine                                              | Agent de revue   |
| ------------------ | ---------------------------------------------------- | ---------------- |
| `veloria-db`       | schéma, migrations immuables, invariants SQL         | `db-guardian`    |
| `veloria-slice`    | tranche verticale, fin de tâche                      | `qa`             |
| `veloria-ui-fr`    | renderer, français, ergonomie, design system         | `ui-fr`          |
| `veloria-money`    | centimes, arrondi, parité, audit                     | `money-guardian` |
| `veloria-stock`    | FIFO, unités de base, carton, coût rendu             | `db-guardian`    |
| `veloria-closing`  | Z, jour métier, sessions de caisse, zakat, liasse    | `qa`             |
| `veloria-sync`     | miroir cloud, outbox, contrat Edge, accès client     | `sync-guardian`  |
| `veloria-license`  | `.vlic` Ed25519, empreinte, manifeste, capabilities  | `qa`             |
| `veloria-electron` | sécurité main, enveloppe IPC, sauvegarde, impression | `qa`             |
| `veloria-gates`    | doctrine des portes non vacantes, inventaire         | `qa`             |

Commandes : `/migration-new`, `/slice`, `/verify`, `/docs-metrics`,
`/council`. Agents : `db-guardian`, `qa`, `ui-fr`, `money-guardian`,
`sync-guardian`.

Règles :

- une compétence est une **instruction exécutable** : tout chiffre qu'elle
  cite doit être vrai au jour de sa lecture (d'où l'interdiction des
  compteurs périmés) ;
- les compteurs « vivants » ne sont **pas** recopiés : on renvoie à
  `docs/METRICS.md` ;
- toute compétence **nouvelle ou modifiée** passe `npm run verify:docs`
  (standard + liste noire + table de routage `AGENTS.md`) ;
- la table de routage d'`AGENTS.md` (règles 13-14) doit nommer **des
  compétences existantes** — la porte le vérifie.

## 6. Ajouter une fonctionnalité (checklist)

1. `database/migrations/NNNN_<sujet>.sql` (nouveau numéro, jamais d'édit).
2. `src/domain/<sujet>/*-rules.ts` pur + `tests/unit/<sujet>.test.ts`.
3. `src/application/<sujet>/…` si use-case (operationId fourni, jamais généré).
4. `electron/ipc/handlers/<sujet>.repo.ts` (prepared + transaction + idempotence)
   - canal `domaine.action` dans `channels.ts` + schéma Zod dans `validators.ts`
   - enregistrement `registry.ts` + bridge `preload.ts` + `ipc-client.ts` + `ipc-contracts.ts`.
5. `src/features/<sujet>/` (Screen + dialogs/ + types.ts, FR, `frError`).
6. `tests/integration/<sujet>.test.ts` (+ e2e si parcours critique).
7. `format → typecheck(+electron+manager) → test(+db) → verify:migrations → build`.
8. ADR si décision structurante, `docs/reports/PHASE_X` si phase.

## 7. Pièges connus (ne pas réintroduire)

- Rapports à la racine → `docs/reports/` ou `docs/archive/` (ADR-058).
- **Compteurs dans la documentation** : aucun nombre figé dans `README.md`,
  `docs/STRUCTURE.md`, `docs/INDEX.md`. Tout indicateur vivant (migrations,
  canaux IPC, fichiers de test, ADR) vit dans `docs/METRICS.md`, section
  générée ; `npm run verify:docs` échoue si le code a bougé sans la doc
  (ADR-178). `handoff.md` fait exception : c'est un journal, ses chiffres
  passés sont des archives datées.
- **Angle mort `knip`** : `config/knip.json` ne couvre pas `scripts/**` — un
  script mort passe la porte. Vérifier à la main avant d'ajouter un script
  (ou l'ajouter au périmètre `knip` dans le même commit).
- Maquettes Stitch à la racine → `docs/archive/stitch/` (ADR-033/035/036/055).
- `dist*/`, `release/`, `*.log` : artefacts ignorés, jamais committés
  (`npm run clean` + `clean:logs` pour purger le poste). Les `tsbuildinfo`
  vivent désormais sous `node_modules/.cache/tsbuildinfo/` (ADR-156), plus à
  la racine.
- Scratch de session (`check_like.py`, `full-inventory.txt`) : git-ignorés **par
  nom** (`.gitignore`), purgés le 2026-10-27 (session 57) — ne pas les réécrire
  à la racine, écrire sous `docs/reports/` ou dans un dossier de script.
- À ne **jamais** supprimer sans ordre explicite du propriétaire : `private/`
  (clés vendor + `.vlic`), `mobile/veloria-release.keystore`, `release/*.exe`
  et `release/_prev-*` (binaires livrés), `.opencode/` (skills liés par
  `AGENTS.md` §13), `graphify-out/` (graphe vivant) et tout `docs/` suivi par
  git (rapports d'audit cités noir sur blanc dans `handoff.md`). Un artefact
  peut être **verrouillé par l'antivirus** (`app.asar` : « Device or resource
  busy ») — ne jamais forcer le `rm`, il part au redémarrage.
- `mobile/android/**` (git-ignoré, ~442 Mo) : **jetable** — `npx expo prebuild`
  - Gradle régénèrent tout (`app/build/intermediates`, `.gradle`, dumps de crash
    JVM). **SaUF** `app/build/outputs/apk/`, qui portait le seul APK réel du poste
    : `app-release.apk` (88,5 Mo, 2026-10-05, `dz.veloria.client` 1.0.0) déplacé
    le 2026-10-27 sous **`release/apk-android/`** avec `output-metadata.json` et
    son `SHA256SUMS.txt`. `mobile/veloria-release.keystore` est la clé qui signe
    cet APK — perdu, il ne se re-signera plus.
- `release/` : les `.exe` + `.blockmap` + `SHA256SUMS.txt` **courants** et
  `apk-android/` sont des livrables ; `win-unpacked/` et `builder-debug.yml`
  sont des intermédiaires de `electron-builder` (régénérés à chaque package).
- `signAndEditExecutable: true` dans les 2 configs
  (`config/electron-builder/{pos,manager}.yml`) — ADR-070. Un `false`
  (contournement TEMP-BUILD 2026-10-02) est interdit en release.
- `mobile/android|ios`, `*.keystore`, `.expo/` : locaux, jamais committés.
- `cloud/` n'est qu'un miroir — toute écriture métier hors SQLite = bug P0.

## 8. Conventions 2026 (FSD + Clean Arch — ADR-062)

Recherche 2025-2026 (FSD Nov 2025, Smashing local-first Mai 2026, Expo
local-first, Electron `contextBridge` + `ipcMain.handle`/`invoke` wrappé par
canal) : l'architecture actuelle est déjà conforme — aucun remaniement,
conventions figées ci-dessous (garde : `tests/unit/a3-organisation.test.ts`).

Couches (dépendances uniquement vers le bas) :

```
src/features/<domaine>/  tranches verticales (Screen + dialogs/ + types.ts)
src/application/          use-cases fins (operationId fourni, jamais généré)
src/domain/               pur, framework-free (jamais react/electron/sqlite)
src/shared/               ui/, formatters/, money/parse, errors/fr-map, …
electron/                 main/, ipc/channels+validators+registry+handlers,
                          database/, preload/ (seul pont window.veloria)
database/migrations/      0001..00NN IMMUABLES (+ verify-migrations vert)
mobile/src + cloud/       satellites isolés (aucun import vers src/electron)
```

Règles de graphe (vérifiées 2026-10-03, zéro cycle) :

1. `features → shared|domain|application` libre ; `features → features`
   UNIQUEMENT feuille à sens unique : `products|stock → suppliers`
   (réutilisation `SupplierQuickCreateDialog`), `sales → customers`
   (fiche client caisse), `customers → {debts,history,returns}` (types +
   helpers de libellés), `settings → license` (label seul). Jamais de
   store → store, jamais de A↔B.
2. `src/domain` sans `react`/`electron`/`better-sqlite3`/`node:`/`ipcRenderer`.
3. `electron/` n'importe jamais `src/` (miroirs documentés : `PO_TRANSITIONS`,
   `isRealCalendarDate`, `paymentMethodLabel` print — parité par tests).
4. Renderer : uniquement `window.veloria` typé ; aucun `electron`/`fs`/`path`.
5. `mobile/src` + `cloud/` : aucun import vers `src/` ou `electron/`
   (duplication volontaire : `mobile/src/format.ts`, `mobile/src/i18n.ts` —
   toolchain Expo séparée, ADR-051/052).
6. Pas de migration vers monorepo `pnpm-workspaces/Turborepo` : rejeté
   (1 seul fichier SQLite offline-first, trains de release POS/APK découplés,
   Expo hors `tsc` racine — le découpage actuel EST la séparation).
7. Nommage connu : `src/shared/ui/use-busy.ts` exporte `isAnyModalOpen()`
   (garde, pas un hook) — renommage refusé (14 fichiers pour zéro gain).
