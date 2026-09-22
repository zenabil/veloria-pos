# ADR-005 — Correctifs runtime & packaging découverts par la QA Phase 3

Date : 2026-09-15. Statut : accepté.

Trois défauts bloquants ont été trouvés en exécutant réellement l'application
(Electron 37.2.0 / Node 22.17.0) — jamais visibles en typecheck/lint/tests seuls.

## 1. Bundle Electron CommonJS sous racine `"type": "module"`

`tsconfig.electron.json` émet du CommonJS (`require`/`exports`) dans
`dist-electron/`, mais la racine est `"type": "module"` (Vite/vitest ESM).
Electron chargeait `main.js` en ESM → `exports is not defined`, aucune fenêtre.

**Décision** : `npm run build:electron` enchaîne
`scripts/release/stamp-electron-pkg.js` qui écrit
`dist-electron/package.json` = `{"type":"commonjs"}` (résolution Node au
`package.json` le plus proche — pattern standard Electron+Vite, zéro changement
de code). `smoke.js` vérifie le tampon (non régression).

## 2. Double enregistrement IPC `printing.printA4`

`registry.ts` ET `printing.service.ts` appelaient `ipcMain.handle` sur le même
canal → exception → `startup()` abandonné AVANT `createMainWindow` (aucune
fenêtre, base pourtant ouverte).

**Décision** : propriété unique — `registerPrintingIpc` possède `printing.*`,
`registerBackupIpc` possède `backup.*`, `registerIpc` le reste. Commentaire
garde-fou dans `registry.ts`.

## 3. better-sqlite3 absent du paquet + lockfile désynchronisé

- `files` (whitelist) excluait `node_modules` ; de plus les motifs `files`
  explicites ne peuvent jamais ré-inclure `node_modules` (le walker principal
  ne descend pas dedans — `getNodeModuleFileMatcher` + graphe de dépendances
  uniquement). Le paquet démarrait mais `database.open_failed`.
- Cause racine : `package-lock.json` désynchronisé (`better-sqlite3` marqué
  `dev:true`, absent des `dependencies` racine) → élagué comme dev.
- **Décision** : `better-sqlite3` + `bindings` passent en `dependencies`
  (pratique standard : module natif shippé), lock régénéré
  (`npm install --package-lock-only`), `files` inclut les deux paquets,
  `asarUnpack: **/*.node` déjà en place. Vérifié : `.node` dans
  `app.asar.unpacked`, `database.opened schemaVersion 5` dans l'app empaquetée.

## 4. Outillage de build sans privilèges symlink

`winCodeSign-2.6.0.7z` contient 2 symlinks darwin → extraction 7zip impossible
sans `SeCreateSymbolicLinkPrivilege` (machine non-admin).

**Décision (machine locale, non commité)** : extraction complète dans le cache
à l'emplacement final attendu
`%LOCALAPPDATA%/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0`
(rcedit utilisé uniquement pour métadonnées, pas de signature avec certificat).
Aucun changement de code ; à refaire sur une nouvelle machine via un compte
pouvant créer des symlinks (ou mode développeur Windows).

## Cibles natives vérifiées

- `better_sqlite3.node` compilé pour Electron 37.2.0 (NODE_MODULE_VERSION 136,
  Node 22.17.0) via `electron-rebuild` — charge OK dans le runtime Electron
  (incompatible avec le Node hôte 26, c'est attendu).
- Exécutables : `Veloria-PoS-Setup-2.0.0.exe` (NSIS, 87,7 Mo) +
  `Veloria-PoS-Portable-2.0.0.exe` (87,4 Mo), checksums SHA-256 dans
  `../reports/PHASE_3_REPORT.md`.
