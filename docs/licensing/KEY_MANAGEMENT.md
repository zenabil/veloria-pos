# Licensing — KEY_MANAGEMENT

## Génération (machine vendor uniquement)

```
npm run license:keygen
```

Crée `private/vendor-keys/{private.key,public.key}` (PEM, 0600 best-effort)
et publie `resources/license/public.key` (sûr à commiter).
Refuse d'écraser sans `--force` (rotation = procédure ci-dessous).

## Règles d'or

1. `private/` est gitignoré : vérifier avec `license:scan` avant chaque release.
2. Sauvegarde offline : 2 supports chiffrés distincts (USB coffre + papier ?
   non — USB chiffré + gestionnaire de mots de passe), jamais cloud non chiffré.
3. Jamais dans : POS (code/build/installeur/BDD/config/env/logs/IPC/renderer),
   tickets, e-mails non chiffrés, dépôts.
4. Accès : uniquement le détenteur (zenagui bilal). Le Manager lit la clé
   depuis `%APPDATA%/Veloria License Manager/keys/private.key` (packagé) ou
   `private/vendor-keys/` (dépôt dev).

## Rotation

1. `license:keygen --force` (nouveau couple).
2. Re-signer le manifeste (`license:integrity`) + rebuild POS + release.
3. Ré-importer la clé dans le Manager (écran « Importer la clé privée… »).
   Sans cette étape, le Manager continue de signer avec l'ANCIENNE clé :
   toutes les licences émises ensuite sont refusées par le POS
   (« Licence invalide : signature non reconnue ») — incident 2026-10-17.
4. Ré-émettre les licences actives (le Manager garde l'historique :
   réémission avec la nouvelle clé ; anciennes licences = `INVALID_SIGNATURE`
   après MAJ). Poste vendor : `npx electron ./scripts/licensing/issue-local-license.cjs`.
5. Vérifier toute la chaîne : `npm run verify:licensing` (paire du dépôt, clé
   embarquée, clé stockée Manager, licence locale) — doit être vert.
6. Révoquer l'ancienne clé (détruire copies sauf archive scellée).

## Compromission suspectée

Rotation immédiate + audit `license_events` + ré-émission. Les licences
existantes restent valides jusqu'à MAJ du POS (fenêtre assumée, documentée).

## Installation au premier lancement (canal manager.keyImport)

Le Manager ne bloque plus sur un message d'erreur : si la cle est absente,
l'ecran propose 'Importer la cle privee...' : dialogue fichier main ->
validation stricte (PEM + Ed25519 chargeable, validee par
validateVendorPrivateKeyPem, testee) -> copie dans
userData/keys/private.key (mode 0600 best-effort). La cle ne transite jamais
par le renderer et n'est jamais affichee.

Rappel : la cle n'est JAMAIS cuite dans l'installeur (un .exe se desassemble
et la cle extraite permettrait de forger des licences illimitees).
