# ADR-006 — Preload bundlé (sandbox `preloadRequire` sans require relatif)

Date : 2026-09-16. Statut : accepté.

## Symptôme (bloquant, prouvé par CDP dans l'app empaquetée)

Écran « Pont applicatif indisponible » permanent dans Electron, console :
`Unable to load preload script .../preload.js` /
`Error: module not found: ../ipc/channels at preloadRequire
(node:electron/js2c/sandbox_bundle.js)` → `window.veloria === undefined`.

## Cause

Avec `sandbox: true`, le `require()` du preload est le `preloadRequire`
restreint d'Electron : seuls `electron` et les builtins Node sont chargeables.
Notre preload compilé (`tsc`, CommonJS multi-fichiers) faisait
`require("../ipc/channels")` → exception → `contextBridge.exposeInMainWorld`
jamais atteint. Le pont n'a donc **jamais** fonctionné en sandbox ; les tests
de boot ne regardaient que les logs main-process, d'où la non-détection.

## Décision

- `build:electron` bundle le preload en **un seul fichier autonome** via
  esbuild (`--bundle --platform=node --packages=external --external:electron`,
  CJS) : les canaux sont inlinés, seul `require("electron")` subsiste (autorisé).
- `smoke.js` garde-fou : échec si `dist-electron/preload/preload.js` contient
  un `require()` relatif ou si `exposeInMainWorld` manque.
- `sandbox: true` conservé (pas de régression sécurité, spec 09).
- Bonus constaté au passage : `autoHideMenuBar: true` (plus de menu
  File/Edit/... inutile en caisse).

## Vérification

Bundling reproduit vers un dossier temporaire : 0 require relatif,
`exposeInMainWorld` présent, canaux inlinés, `electron` externe.
Vérification runtime (sonde CDP `typeof window.veloria`) à refaire après le
prochain `npm run build` + packaging — procédure : lancer l'exe avec
`--remote-debugging-port`, évaluer `typeof window.veloria` (attendu :
`"object"`).
