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
npm run typecheck
npm run lint
npm run test
npm run test:db
```

## Production

```powershell
npm run package:win   # release/Veloria-PoS-Setup-*.exe + portable
node scripts/release/smoke.js
```

La base vit dans `%PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite`
(repli `userData` si non inscriptible), jamais dans `Program Files`/`app.asar`.
Sauvegardes via `VACUUM INTO` (`.vposdb`), restauration avec snapshot de sécurité.

## Spécification

`VELORIA_POS_FROM_SCRATCH_MARKDOWN/` est la source of truth.
Décisions d'ingénierie : `docs/ADR-*.md`. Avancement : `PHASE_X_REPORT.md`.
