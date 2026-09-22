# ADR-023 — Distribution hors-ligne : pas de mise à jour automatique, pas de signature

Date : 2026-09-18 · Statut : accepté

## Contexte

Veloria PoS est offline-first : aucune requête réseau (CSP `connect-src 'self'`,
aucun `fetch` dans `src/` ni `electron/`, OCR 100 % local). Le projet n'a ni
certificat de signature de code, ni serveur de mise à jour. `publish: []`
(`electron-builder.yml`) et `verifyUpdateCodeSignature: false` reflètent cet
état, mais sans décision écrite ; `release/` contient des artefacts antérieurs
aux audits (à reconstruire avant toute distribution).

## Décision

- **Pas de mise à jour automatique embarquée** (pas d'`electron-updater`) :
  un POS hors-ligne ne doit jamais télécharger ni exécuter du code depuis le
  réseau. Les mises à jour se font par **réinstallation NSIS complète** avec
  `appId` stable (`com.veloria.pos`) : seuls les fichiers applicatifs sont
  remplacés, base (`%PROGRAMDATA%`), sauvegardes et réglages sont conservés
  (`deleteAppDataOnUninstall: false`).
- **Pas de signature de code** (coût du certificat) : Windows SmartScreen
  demandera confirmation — c'est attendu et documenté (`../reports/RELEASE_NOTES.md`).
  Réévaluer si distribution publique large.
- **`release/` est un artefact gitignoré** : reconstruit à chaque version
  (`package:win` + `release:checksums` → `SHA256SUMS.txt`, à vérifier avant
  installation). Les binaires présents sur disque entre deux versions sont
  périmés par construction et ne sont jamais distribués tels quels.
- **Garde-fous déjà en place** : `smoke.js` (dist + preload sandbox-safe +
  stamp CJS), `checksums.js`, downgrade refusal (base plus récente que l'app
  refusée avec message FR), snapshot + rollback à la restauration.

## Conséquences

- L'utilisateur ne reçoit aucune mise à jour sans action manuelle : c'est le
  comportement voulu (caisse critique, changements contrôlés).
- Avant chaque distribution : `build` + `build:electron` + `electron-builder`
  - `checksums`, jamais de réutilisation de `dist/`/`release/` existants.
