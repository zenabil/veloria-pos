# Licensing — IPC_SECURITY

## Surface licence (6 canaux, charge vide validée)

`license.getStatus | getHardwareId | importLicense | validate | getInfo | getPermissions`
— schéma `licenseActionSchema` (`{}`) : l'import passe par **dialogue fichier
main** (jamais de blob .vlic via IPC/renderer). Réponses : `LicenseStatus`
(pages + features + identité client) et sous-ensembles info/permissions
(jamais de clé, hash interne, chemin, stack). **Aucun canal d'écriture de
permissions** : le renderer ne peut pas s'octroyer de capabilities.

## Gardes capabilities

`LICENSE_PROTECTED_CHANNELS` (~45 canaux d'écriture métier) vérifiée dans
`handle()` côté main via `requireLicensedMutation()`, puis
`PAGE_GATED_CHANNELS` (au moins une page requise, ex. breadOrders OU pain)
via `requireLicensedPage()` et `FEATURE_GATED_CHANNELS` (+ `debt-management`
pour les paiements, crédit/partiel détectés dans `sales.create`) via
`requireLicensedFeature()` — le tout sur le payload **signé**. Canaux directs
hors `handle()` : printing (ticket→`receipt-80mm`, A4→`invoice-a4`,
rapports→`advanced-reports`, étiquettes→`barcode-scanner`), backup
(create/export→`automatic-backup`, restore→`restore-backup`), OCR
(select+analyze→`ocr`). Lectures, réglages, entreprise, licence : ouverts
(réactivation/sauvegarde toujours possibles, poste expiré = lecture seule
des pages autorisées). Erreurs FR mappées (`LICENSE_REQUIRED` /
`FEATURE_NOT_LICENSED` / `PAGE_NOT_LICENSED`).

## Invariants vérifiés par test

`bridge-shape` : chaque canal exposé au preload, aucun `run-sql`/`eval`,
chaque schéma Zod consommé (dont `licenseActionSchema` via registry).
