# ADR-066 — APK client : fermeture immédiate au lancement (2026-10-04)

## Constat

APK installé se ferme dès l'ouverture, sans aucune UI, sur Reno 7
(CPH2371, Android 12/13). Reproduit avec le build local du 03/10.

## Cause racine (logcat device, preuve directe)

`adb logcat` sur le Reno 7 au lancement :
`FATAL EXCEPTION: mqt_native_modules` —
`JavascriptException: Error: Requiring unknown module "expo-secure-store"`
(+ `expo-sqlite`), via `loadNative → secureGet → loadSession` (boot).

`mobile/src/cache.ts` utilisait un require ALIASÉ
(`const req = require`) : Metro ne détecte que les `require("…")` directs
et littéraux — les deux modules étaient ABSENTS du bundle release, et
l'erreur échappait au try/catch → mort fatale avant le premier écran.

## Décisions

1. `require()` directs à littéraux statiques dans `loadNative`
   (`mobile/src/cache.ts`) — seule forme vue par Metro (+14 modules :
   651 → 665 à l'export). Règle : jamais d'alias de `require` dans
   le code embarqué.
2. Effet de boot blindé (`App.tsx`) : tout échec → écran de connexion
   quand même (`setBooted(true)` en `finally`).
3. `RootErrorBoundary` bilingue (`mobile/src/ui/error-boundary.tsx`,
   enregistré via `Root` dans `index.js`) : toute exception au rendu
   affiche un écran ar/fr + réessai au lieu de fermer sans message.
4. Rebuild release + réinstallation sur device avec vérification
   (`pidof` vivant, logcat sans FATAL).

## Second crash (même session device, après fix §1)

Nouveau FATAL au premier écran (login) :
`UnexpectedNativeTypeException: Value for scale cannot be cast from
ReadableNativeMap to double` (`TransformHelper.processTransform`,
Paper old-arch). Seul `transform` de l'appli : `Tap` (`ui/kit.tsx`,
`transform: [{ scale }]` avec `Animated.Value`) — affiché dès l'écran
de connexion. Fix : pression en nombres purs (`pressed ? to : 1`,
plus d'`Animated` dans `Tap` ; `Skeleton` (`ui/states.tsx`) figé aussi —
aucun nœud animé ne traverse le pont).

## Vérification finale (Reno 7 CPH2371, `adb`)

APK rebuildé (`assembleRelease` OK, 84,4 Mo, bundle 666 modules) :
`pidof` vivant à 10 s ET 20 s, logcat sans FATAL/JavascriptException/
unknown-module. Lancement sain, écran de connexion affiché.
