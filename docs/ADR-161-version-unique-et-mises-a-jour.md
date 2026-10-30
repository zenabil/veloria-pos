# ADR-161 — Version unique 1.0.4 et contrat de mise à jour des trois produits

- **Date** : 2026-10-30
- **Statut** : accepté
- **Branche** : `chore/root-layout`
- **Portée** : `package.json` + lockfiles, `scripts/release/version.mjs`,
  `tests/unit/version-alignment.test.ts`, License Manager (base + IPC + UI),
  documentation de release. Aucune migration SQLite POS, aucun canal POS,
  aucune donnée financière touchée.

## Contexte

Les trois produits avaient des versions divergentes :

- POS et License Manager : **1.0.0** (`package.json` racine, embarqué par
  electron-builder dans les deux installateurs) ;
- Client Android : **1.0.4** (`app.json` + `build.gradle`), mais l'écran
  Compte affichait une chaîne **codée en dur** dans `App.tsx` ;
- License Manager : migrations de colonnes « best effort » sans copie de
  sécurité préalable, et aucune version visible dans l'interface.

Une mise à jour ne peut pas être vérifiée ni répétée si les numéros divergent :
Android refuse un `versionCode` qui ne croît pas, et deux installateurs NSIS
avec des identités différentes coexistent au lieu de se remplacer.

## Décision

### 1. Une seule source de version

`package.json` racine = version de la suite (**1.0.4**). electron-builder
l'embarque dans les installateurs POS **et** License Manager ; `app.getVersion()`
l'affiche (À propos POS, en-tête du Manager). Le client Android porte le même
numéro via `mobile/app.json`, `mobile/package.json`, `build.gradle`
(`versionName`) et le libellé `appVersion` de `App.tsx`.

`npm run version:check` refuse toute divergence ; il est branché dans
`npm run verify` (donc CI). `npm run version:set x.y.z` met à jour toutes les
cibles d'un coup :

- `package.json` + `package-lock.json` (POS + Manager) ;
- `mobile/package.json` + `mobile/package-lock.json` + `mobile/app.json` ;
- `mobile/android/app/build.gradle` (`versionName`, `versionCode`) ;
- `mobile/src/App.tsx` (`appVersion="…"`).

**`versionCode` Android strictement croissant** : `version:set` l'incrémente
quand `app.json` change (ou accepte `--code N`), et refuse toute régression —
Android n'installe pas une mise à jour dont le code baisse.

### 2. Contrat de mise à jour POS + License Manager

- **Même `appId`** (`com.veloria.pos` / `com.veloria.license-manager`) : NSIS
  détecte l'installation précédente et remplace les fichiers applicatifs.
- **`perMachine: true`** + **`deleteAppDataOnUninstall: false`** : la base
  (`%PROGRAMDATA%\Veloria PoS\Data`), les sauvegardes et les réglages
  (`%APPDATA%`) vivent hors du dossier d'installation.
- POS : les migrations SQLite immuables sont appliquées au démarrage avec
  **snapshot pré-migration** (5 conservés) et vérification de checksum déjà en
  place (aucune modification).
- License Manager : avant d'ajouter des colonnes à un registre existant,
  `openManagerDb` crée désormais un **snapshot `VACUUM INTO`**
  (`backups/manager-avant-migration-*.sqlite`, 5 conservés). Échec de
  sauvegarde = mise à jour annulée (fail-closed). Seules les colonnes absentes
  sont rejouées.
- Clé privée vendor et licences : `userData` (`keys/`, `license-manager.sqlite`),
  jamais dans `Program Files` — conservées à la mise à jour.
- La licence POS est liée au matériel, pas à la version : monter 1.0.0 → 1.0.4
  ne révoque ni ne réactive la licence.

### 3. Contrat de mise à jour du client Android

- Même `applicationId` (`dz.veloria.client`) et **même keystore release**
  (`mobile/veloria-release.keystore`) : Android accepte l'APK comme mise à
  jour, pas comme application concurrente.
- `versionCode` strictement croissant (outil ci-dessus).
- Données conservées par Android à la mise à jour : session SecureStore
  (téléphone/PIN), cache SQLite, endpoint mémorisé ; aucun re-scan QR requis.
- Version affichée (écran Compte) maintenue par `version:set` + test.

### 4. Pas de mise à jour automatique en ligne

Aucun serveur de mise à jour n'existe et les exécutables Windows ne portent pas
de signature Authenticode (`verifyUpdateCodeSignature: false`). Un
téléchargement/exécution automatique serait donc dangereux : il est **refusé**.
La mise à jour se fait en installant l'installateur/APK signé au-dessus de la
version précédente. Le jour où un certificat de signature et un hébergement
seront disponibles, `electron-updater` pourra être ajouté avec vérification de
signature obligatoire.

## Procédure de release

```powershell
npm run version:set 1.0.4      # (ou version suivante) — vérifie l'alignement
npm run build                  # renderer
npm run build:electron         # main/preload + manifeste signé
npm run package:win            # POS Setup + Portable
npm run package:manager        # License Manager Setup + Portable
npm run release:checksums      # release/SHA256SUMS.txt
# Android : versionCode incrémenté par version:set, puis build APK/AAB
```

Un installateur de version inférieure peut être exécuté, mais une base POS déjà
migrée refuse de s'ouvrir avec une application plus ancienne (« version plus
récente ») : la règle protège les données, elle n'est pas contournable.

## Alternatives écartées

- **electron-updater immédiat** : nécessite un provider (GitHub/S3/Supabase
  Storage), des artefacts signés et une stratégie de rollback — hors périmètre
  et risqué sans certificat.
- **Version par produit indépendante** : complique le support et la vérification
  (« quelle version du Manager va avec quel POS ? ») ; la suite est distribuée
  ensemble.
- **Play Store pour le client** : possible (AAB déjà configuré), mais la
  distribution actuelle est l'APK direct ; le versionCode croissant reste la
  condition commune aux deux canaux.

## Tests

- `tests/unit/version-alignment.test.ts` : racine/locks/app.json/Gradle/
  `App.tsx` alignés, `versionCode` positif, `appId` stables, données hors
  installation, package/keystore Android inchangés.
- `tests/unit/license-manager.test.ts` : `missingManagerMigrations` ne rejoue
  que les colonnes absentes d'un registre 1.0.0.
- Suite complète + builds : voir le handoff de la session.
