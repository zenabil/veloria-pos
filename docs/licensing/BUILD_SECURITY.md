# Licensing — BUILD_SECURITY

## Chaîne release POS (`npm run package:pos`)

```
license:scan  →  build  →  build:electron  →  license:integrity  →  electron-builder --win
(secrets/bypass)   (renderer)   (main+preload)   (manifeste signé)      (Setup + portable)
```

`prepackage` rejoue le scan pour tout packaging (y compris `package:win`).

## Chaîne Manager (`npm run package:manager`)

`build:manager-client` + `build:manager` + `electron-builder -c
electron-builder.license-manager.yml` → `Veloria-License-Manager-Setup.exe`
(appId dédié, dossier de données dédié, **sans** clé privée embarquée —
le Manager la lit sur la machine vendor).

## Garde-fous

- `license:scan` : en-têtes `PRIVATE KEY`, flags `*_LICENSE`/`*_ACTIVATION`,
  fichiers interdits (`.env*`, `private.key`), sourcemaps (`*.map`) dans
  `electron|src|public|resources|scripts|dist|dist-electron` ; clé publique
  présente obligatoire. Échec = build stoppé.
- Manifeste absent en packagé ⇒ `TAMPER_DETECTED` (fail-closed) ; le pipeline
  le génère toujours (clé vendor requise).
- `sourcemap:false` (renderer + manager), asar, `deleteAppDataOnUninstall:false`
  (base/sauvegardes/réglages/état licence conservés).
