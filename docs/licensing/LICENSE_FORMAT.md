# Licensing — LICENSE_FORMAT (.vlic v1)

## Champs signés (toute mutation ⇒ INVALID_SIGNATURE)

| Champ                   | Exemple / valeurs                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `schemaVersion`         | `1`                                                                                        |
| `licenseId`             | `VLIC-A1B2C3D4`                                                                            |
| `productId`             | `veloria-pos`                                                                              |
| `edition`               | legacy : `basic`/`standard`/`professional`/`pro`/`enterprise`/`custom`                     |
| `plan`                  | `BASIC`/`STANDARD`/`PRO`/`ENTERPRISE`/`CUSTOM` (preset d'émission, optionnel)              |
| `licenseType`           | `term` \| `lifetime` (pas de date 2099 : le type EST le modèle)                            |
| `licenseStatus`         | `active` (défaut, omis) / `suspended` / `revoked` — révocation offline                     |
| `clientId`              | optionnel, ex. `CLI-0042`                                                                  |
| `clientName`            | optionnel, ex. `Ahmed Benali`                                                              |
| `storeName`             | optionnel, ex. `Épicerie Ennour`                                                           |
| `deviceBinding`         | `false` = licence flottante (hardware ignoré) ; défaut `true`                              |
| `maxDevices`            | optionnel, informatif (appliqué à l'émission)                                              |
| `hardwareFingerprint`   | SHA-256 hex (64)                                                                           |
| `issuedAt` / `startsAt` | ISO UTC                                                                                    |
| `expiresAt`             | ISO UTC, **absent** si `lifetime`                                                          |
| `features`              | triées, ex. `["invoice-a4","ocr","receipt-80mm"]` (14 ids, §4 CAPABILITIES)                |
| `pages`                 | ex. `{"sales":true,"stock":false}` (17 ids) — **absent = tout autorisé (licences legacy)** |

## Enveloppe

```json
{ "payload": { "...": "..." }, "signature": "base64url(ed25519)" }
```

puis `base64url(canonicalJSON(enveloppe))` dans le fichier `.vlic`.

## Durées (Manager)

1 mois / 6 mois / 12 mois calendaires (`addMonths`, jour clampé fin de mois),
`lifetime`, ou personnalisée (`startsAt` < `expiresAt`, ≤ 10 ans conseillés).
`startsAt` par défaut = jour d'émission.

## Plans (presets, §20)

Le plan charge un preset pages/features **modifiable avant signature**
(`PLAN_PRESETS` dans `electron/licensing/catalog.ts`). À l'exécution, seules
les capabilities signées comptent — jamais le nom du plan. Détail :
`CAPABILITIES.md`.
