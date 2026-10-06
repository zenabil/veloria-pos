# ADR-067 — Icône officielle de l'APK client (2026-10-04)

## Décision

`docs/archive/veloria customer.jpg` (cartouche or sur noir, 1024²) devient
l'identité officielle de l'APK client, en remplacement du « V » générique.

## Déploiement

- Launcher Android : `mipmap-*/ic_launcher(.png,_round.png)` régénérés
  (48→192px, logo à 68 % sur fond `#051424`, `.webp` Expo supprimés —
  doublon = erreur build). `AndroidManifest` inchangé (`@mipmap/ic_launcher`).
- `app.json` : `icon` + `splash` (fond `#051424`) + `android.adaptiveIcon`
  (foreground dédié `veloria-customer-foreground.png` 432px).
- In-app (`mobile/assets/brand/veloria-customer.png` 512px, 280 Ko) :
  splash, marque écran de connexion (96px), logo barre haute (34px),
  écran de secours `RootErrorBoundary` (72px).
- `require()` PNG statiques + `// eslint-disable` ciblés (même règle
  ADR-066 : jamais d'alias).

## Vérification

`tsc mobile` + `eslint --max-warnings 0` + `expo export android`
(666 modules, asset embarqué) verts.
