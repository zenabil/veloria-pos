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
3. Ré-émettre les licences actives (le Manager garde l'historique : `renew`
   avec la nouvelle clé ; anciennes licences = `INVALID_SIGNATURE` après MAJ).
4. Révoquer l'ancienne clé (détruire copies sauf archive scellée).

## Compromission suspectée

Rotation immédiate + audit `license_events` + ré-émission. Les licences
existantes restent valides jusqu'à MAJ du POS (fenêtre assumée, documentée).
