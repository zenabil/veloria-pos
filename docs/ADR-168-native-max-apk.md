# ADR-168 — APK Native-max : R8, ABIs ARM, compression, permissions et APK Owner

## Contexte

Demande opérateur : « اجعل تطبيقات apk native الى اقصى درجة ممكنة » (rendre
les applications APK aussi natives que possible), puis choix explicite du
**Native-max sur React Native** plutôt qu'une réécriture Kotlin.

État mesuré de l'APK client 1.0.4 (code 6) avant toute modification :

- **85 Mo** pour une application de lecture seule.
- **4 ABIs** : arm64-v8a 19,5 Mo + armeabi-v7a 13,6 Mo + x86 18,7 Mo +
  x86_64 18,2 Mo de bibliothèques non compressées (x86 = émulateurs).
- **Dex 25,4 Mo** (3 fichiers), `enableProguardInReleaseBuilds=false` et
  `enableShrinkResourcesInReleaseBuilds=false`.
- Moteur **Hermes activé**, **New Architecture désactivée**.
- Moteur QR `expo-camera` → ML Kit `barhopper_v3` embarqué (~18 Mo sur 4 ABIs).
- `expo.useLegacyPackaging=false` : bibliothèques natives non compressées.
- Permissions héritées du prebuild : `RECORD_AUDIO`,
  `READ/WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW` alors que l'app ne les
  utilise pas.
- Le manifeste Owner n'existe pas : `owner/android/` est absent, aucun APK
  Owner n'a encore été produit.

Les deux applications sont **React Native** (vues natives, pas de WebView) ;
« native » au sens strict signifierait Kotlin/Compose. Une réécriture complète
coûterait 4-6 semaines pour le client et 8-12 pour les deux, gèlerait les
fonctionnalités et réimpliquerait les contrats de synchronisation, le QR
`VELORIA2`, l'i18n ar/fr et les tests. Le gisement principal est le
**packaging** (ABIs, R8, compression) et non le rendu JS.

## Décision — Native-max sur React Native

1. **R8 + shrinkResources** en release
   (`android.enableProguardInReleaseBuilds=true`,
   `android.enableShrinkResourcesInReleaseBuilds=true`), avec keeps explicites
   pour les modules Expo (autolink/réflexion), le pont RN, Hermes, SoLoader et
   les méthodes natives (`mobile/android/app/proguard-rules.pro`).
2. **ABIs ARM uniquement** (`armeabi-v7a,arm64-v8a`, déjà dans
   `gradle.properties`) et **compression des bibliothèques**
   (`expo.useLegacyPackaging=true`) : APK plus petit, extraction unique à
   l'installation.
3. **Permissions nettoyées** : retrait de `RECORD_AUDIO`, stockage externe et
   `SYSTEM_ALERT_WINDOW` du manifeste et ajout à `blockedPermissions` pour que
   le prochain prebuild ne les réintroduise pas.
4. **Owner** : génération du projet natif (`expo prebuild`), mêmes réglages
   R8/ABIs/compression, signature avec le keystore vendor existant
   (`mobile/veloria-release.keystore`), package `dz.veloria.owner`, puis APK
   release.
5. **Différé, faute d'appareil ADB connecté** :
   - remplacement d'`expo-camera`/ML Kit par un scanner **ZXing natif**
     (activité Android + pont) : gain restant estimé ~7 Mo ARM, mais la
     caméra/le login QR doivent être validés sur un téléphone réel ;
   - **New Architecture** : mesure de compatibilité Expo SDK 52 à faire sur
     appareil ; le build reste Hermes + ancienne architecture pour ne pas
     risquer le runtime sans test.

## Constats de build (corrigés)

- `reactNativeArchitectures` ne filtre pas le packaging des AAR Expo : les
  bibliothèques x86/x86_64 restaient dans l'APK malgré la propriété. Un
  `ndk.abiFilters` explicite dans `defaultConfig` est la source de vérité.
- `expo-camera` réintroduit `RECORD_AUDIO` via le manifeste fusionné de son
  AAR : retrait explicite `tools:node="remove"` (en plus de
  `blockedPermissions` dans `app.json`).
- Le template Owner généré utilisait Kotlin **1.9.24** alors que le Compose
  Compiler **1.5.15** (expo-modules-core) exige **1.9.25** : le classpath
  `kotlin-gradle-plugin` est épinglé à 1.9.25 (le projet mobile avait déjà ce
  correctif).
- `assembleRelease` déclenche `lintVital` module par module (~10 min sur cette
  machine) : les builds APK locaux le sautent (`-x lintVital…`) ; le lint
  source reste une porte séparée.

## Conservé

- L'identité visuelle Stitch sombre/ambre et tous les écrans ; aucun redesign.
- Hermes, les modules Expo natifs (SecureStore, SQLite, Haptics, Font) et le
  code/tests existants.
- Le keystore et la signature release existants ; aucun nouveau secret.

## Risques et validation

- **R8 runtime non testé sur appareil** : aucun ADB connecté pendant la
  tranche. L'APK doit être installé et lancé sur le téléphone du vendor avant
  diffusion ; en cas de crash (classe retirée), ajouter le keep correspondant
  et reconstruire.
- **Caméra/QR inchangée** : ML Kit reste embarqué ; le login QR doit être
  vérifié au premier test.
- **Owner** : première signature release avec la clé vendor existante ; le
  package est distinct (`dz.veloria.owner`), les mises à jour restent
  installables par-dessus.

## Résultats mesurés

- **Client 1.0.4 (code 6)** : `88 726 616` octets (84,6 MiB) →
  **`22 677 056` octets (21,6 MiB)**, soit **−74,4 %**. ABIs finales :
  `arm64-v8a` + `armeabi-v7a` uniquement (x86/x86_64 retirés). Dex :
  **25,4 Mo → 9,3 Mo** (R8). Bibliothèques ARM 33,1 Mo décompressées,
  compressées dans l'APK (`useLegacyPackaging=true`). Permissions finales :
  CAMERA, INTERNET, VIBRATE, USE_BIOMETRIC/USE_FINGERPRINT (SecureStore),
  ACCESS_NETWORK_STATE ; `RECORD_AUDIO`, stockage externe et
  `SYSTEM_ALERT_WINDOW` retirés. Signature vendor vérifiée (SHA-256
  `c190b12a…`), APK SHA-256 `8ee498b5…`.
- **Owner 0.1.0 (code 1)** : premier APK, **`18 101 035` octets
  (17,3 MiB)**. ABIs `arm64-v8a` + `armeabi-v7a` uniquement, Dex **7,3 Mo**
  (un seul fichier), permissions INTERNET/VIBRATE (+ biométrie héritée de
  SecureStore), signature vendor vérifiée, APK SHA-256 `e720ba19…`.
- L'ancien APK client 4 ABIs est conservé sous
  `release/Veloria-Client-1.0.4-4abi-legacy.apk` (84,6 MiB) pour retour
  arrière ; le nom canonique pointe désormais sur l'APK natif-max.

## Reproductibilité

`mobile/android/` et `owner/android/` sont des projets **générés** et
**ignorés par git** (politique existante, `.gitignore`). Les réglages
R8/shrink/ABIs/compression/ProGuard/signature et l'épinglage Kotlin 1.9.25
sont appliqués à ces dossiers locaux ; après un `expo prebuild --clean` il
faut les réappliquer (ce document liste les points exacts) avant de
reconstruire. Les APK livrés vivent dans `release/` (non suivi) :
`Veloria-Client-1.0.4.apk` et `Veloria-Owner-0.1.0.apk`.

## Fichiers

- `mobile/app.json` (permissions bloquées)
- `owner/app.json` (permissions bloquées)
- `.gitignore` (`owner/android`, `owner/ios`, `owner/.expo`)
- Projets natifs générés/ignorés : `mobile/android/*`, `owner/android/**`
  (R8/ABIs/compression/ProGuard/signature/Kotlin 1.9.25)
- `release/Veloria-Client-1.0.4.apk`,
  `release/Veloria-Client-1.0.4-4abi-legacy.apk`,
  `release/Veloria-Owner-0.1.0.apk` (artefacts non suivis)

## Portes

- `./gradlew assembleRelease` client et owner : **verts** (client 27 min 57 s
  après `clean` ; owner 25 min 30 s après correction Kotlin).
- `apksigner verify` : **vert** pour les deux APK, certificat vendor
  `CN=Veloria`.
- `npm run check` : **vert** (format, lint, typechecks root/electron/manager/
  mobile/owner).
- `npm test` : **173 fichiers / 1 194 tests**, 0 échec.
- `npm run verify` : migrations, domaine, FR, encodage, perf, version,
  secret-scan — **vert**.
- `npm run knip` : **vert**.
- Aucun fichier TS modifié : couverture non relancée.
- **Non testé** : installation et lancement réels — aucun appareil ADB
  connecté pendant la tranche ; caméra/QR et runtime R8 restent à valider au
  premier test sur téléphone.
