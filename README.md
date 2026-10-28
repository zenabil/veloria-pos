# Veloria PoS — Professional Offline-First Retail POS

**Produit :** Veloria PoS · **Base :** `veloria POS DB` (`Veloria POS DB.sqlite`)
**Plateforme :** Windows Desktop · **Langue :** Français · **Devise :** DZD
**Architecture :** Offline-first, SQLite-first, Electron sécurisé, Clean Architecture.

## Démarrage (dev)

Prérequis : Node.js 22 LTS, npm 11, Python 3 + Visual Studio Build Tools (C++ workload) pour `better-sqlite3`.

```powershell
npm ci
npm run rebuild
npm run dev          # renderer seul (Vite)
# + terminal 2 (après build electron) :
npm run build:electron
$env:VITE_DEV_SERVER_URL="http://localhost:5173"; npx electron .
```

## Qualité

```powershell
npm run typecheck          # renderer + tests
npm run typecheck:electron # main/preload (strict + noUncheckedIndexedAccess)
npm run typecheck:manager  # License Manager (outil vendor)
npm run lint
npm run test               # 168 fichiers / ~1 141 tests (domaine pur, contrats
                           # IPC, intégration SQLite réel via node:sqlite)
npm run test:db
node scripts/database/integrity.js        # base réelle, lecture seule
npm run verify:migrations
npm run license:scan       # aucun secret/bypass dans le POS
npm run verify:domain      # invariants domaine (passe par --experimental-strip-types)
npm run verify:perf        # garde-fous perf (requêtes N+1, listes non paginées)
```

## Tests E2E (Playwright + Electron réel)

```powershell
npm run build              # renderer requis par l'app empaquetée en test
npm run build:electron     # main/preload requis
npm run test:e2e           # 24 specs / 50 tests, 1 worker (~30 min la suite)
```

- **Piège de shell** : un shell qui exporte `ELECTRON_RUN_AS_NODE=1` (terminal
  intégré de certains éditeurs) fait planter tout lancement Electron. Lancer avec
  `env -u ELECTRON_RUN_AS_NODE npx playwright test …` (ou `npx electron .`).
- Sous `test:e2e`, une spec ciblée se relance seule :
  `npx playwright test tests/e2e/carton-barcode.spec.ts` (création fiche +
  carton + codes-barres, scans caisse, preuve SQLite des `sale_items`).

- Chaque test démarre la vraie application avec une base **vierge**
  (`PROGRAMDATA` + `userData` temporaires par test) : aucune donnée de
  production, répétable, indépendant de l'ordre d'exécution.
- Installeur NSIS : `npm run test:e2e:installer` (après `npm run package:win` ;
  ignoré proprement sinon). Vérifie install silencieuse, branding
  (nom/version/éditeur), raccourcis, réinstallation sans perte, désinstallation
  sans toucher base/sauvegardes/réglages.
- Couvert : ouverture, création produit, panier + quantités + totaux, vente
  comptant, historique, stock après vente, aperçu d'impression (80mm, sans
  imprimante), vente à crédit, retour client, réception fournisseur,
  sauvegarde, restauration, redémarrage avec persistance, **conditionnement
  carton** (vente mixte carton + pièces, tarif de gros, devis, retours
  fournisseur) et **scan d'un code-barres de carton** (ADR-149).
- Non couvert : impression physique (aucune imprimante en test), dialogues
  natifs hors `confirm`, mise à jour/packaging, multi-fenêtres.
- Pas de `sleep` arbitraire (attentes Playwright + seuls polls justifiés :
  sortie processus et verrou single-instance après restart).

## Production

```powershell
npm run package:win         # release/Veloria-PoS-Setup-*.exe + portable
node scripts/release/smoke.js
npm run release:checksums   # release/SHA256SUMS.txt
```

La base vit dans `%PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite`
(repli `userData` si non inscriptible), jamais dans `Program Files`/`app.asar`.
Sauvegardes via `VACUUM INTO` (`.vposdb`), restauration avec snapshot de sécurité.

Livrables : `release/` = installateurs + portables POS et Manager (+
`SHA256SUMS.txt`) ; `release/apk-android/` = APK Android signé (`dz.veloria.client`)
avec son hash — `mobile/android/**` est régénérable, pas ce dossier.

## Licences (offline-first, par client)

Chaque poste s'active par fichier `.vlic` signé (Ed25519, clé privée vendor
jamais distribuée) : pages (17) + fonctions (14) par licence, plans
BASIC/STANDARD/PRO/ENTERPRISE/CUSTOM comme presets modifiables, badge d'état
dans l'en-tête. Vérification 100 % locale (main uniquement, jamais le
renderer). Détail : `docs/licensing/` (`CAPABILITIES.md`, `ACTIVATION.md`).

```powershell
npm run build:manager      # main du Manager (+ client : build:manager-client)
npm run dev:manager        # lancer le License Manager en dev
npm run license:keygen     # rotation des clés vendor (machine vendor)
npm run license:scan       # garde-fou : aucun secret dans le POS
```

## Spécification

`docs/specs-archive/` est la source of truth figée.
Décisions d'ingénierie : `docs/ADR-*.md` (001→153, indexées dans `docs/INDEX.md`).
Avancement : `docs/reports/PHASE_X_REPORT.md` + `handoff.md` (continuité entre
sessions — à lire en premier après `AGENTS.md`).
Carte maintenance : `docs/STRUCTURE.md`. Archives : `docs/archive/` (`root-legacy/`, `stitch/`).
