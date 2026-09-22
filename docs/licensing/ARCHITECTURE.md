# Licensing — ARCHITECTURE

## Vue d'ensemble

```
┌─────────────────────────┐
│ Veloria License Manager │  outil vendor (build séparé)
│  PRIVATE KEY (jamais    │
│  dans POS) + registre   │
│  SQLite local vendor    │
└────────────┬────────────┘
             │  .vlic signé Ed25519 (fichier remis au client)
             ▼
┌─────────────────────────┐
│      Veloria POS        │  vérification seule (PUBLIC KEY)
│  license-service (main) │
│  ├─ protocol (canonique + Ed25519 verify)
│  ├─ catalog (pages/features/plans/seuils, pur)
│  ├─ fingerprint (SHA-256 matériel Win)
│  ├─ secure-state (safeStorage/DPAPI)
│  ├─ clock guard (anti-rollback)
│  └─ integrity (manifeste signé vendor)
│  IPC license.* (Zod, main décide, renderer affiche)
│  gardes capabilities (registry + printing/backup/ocr)
│  badge licence (header + modal)
└─────────────────────────┘
```

## Écart assumé vs spec §5

Pas de monorepo `apps/` : restructurer casserait tous les alias/imports/build.
Équivalent obtenu avec l'arborescence actuelle :

| Spec                                 | Réalisation                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `apps/veloria-pos`                   | racine existante (`electron/`, `src/`)                                                                 |
| `apps/veloria-license-manager`       | `license-manager/` (main+preload+ipc+db+renderer dédiés)                                               |
| `packages/safe-license-verification` | `electron/licensing/` (protocol+fingerprint purs, inclus par les 2 builds via `tsconfig.manager.json`) |
| `private/signing-infrastructure`     | `private/` (gitignoré) + `scripts/licensing/`                                                          |
| `docs/licensing`                     | ce dossier                                                                                             |

## Flux de décision

Renderer → preload (`window.veloria.license.*`) → `registerLicenseIpc`
→ `license-service` (main) → reaf `secure-state`/`protocol`.
Le renderer ne décide jamais : il affiche `LicenseStatus` et déclenche
l'import (dialogue fichier main). Les mutations métier passent par
`LICENSE_PROTECTED_CHANNELS` (garde centrale dans `handle()`), chaque canal
sensible exige en plus ses capabilities (`PAGE_GATED_CHANNELS` /
`FEATURE_GATED_CHANNELS`, gardes locales dans printing/backup/ocr pour les
canaux directs). Les états `REVOKED`/`SUSPENDED` sont vérifiés dans la chaîne
avant produit/hardware. Détail : `CAPABILITIES.md` (ADR-026).

## Enforcement

Actif **dans tous les modes d'exécution** : sans `ACTIVE`/`EXPIRING_SOON`,
mutations bloquées (FR) ; sans état valide du tout (`UNACTIVATED`, `REVOKED`,
`SUSPENDED`, signatures/hardware invalides, tamper, horloge), fenêtre
d'activation dédiée au lieu de la coquille ; `EXPIRED` = coquille en lecture
seule (pages autorisées, sauvegarde toujours permise).
Aucune donnée n'est jamais supprimée. Conséquence assumée : tout lancement
(dev compris) exige une licence valide + un manifeste d'intégrité signé
(`build:electron` le (re)signe via la clé vendor) — pas de contournement.
