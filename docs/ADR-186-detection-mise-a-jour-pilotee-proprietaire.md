# ADR-186 — Détection automatique de mise à jour, application pilotée par le propriétaire

Date : 2026-11-15 · Statut : accepté

## Contexte

Le projet est offline-first et sans réseau dans le processus principal. Deux
décisions écrites encadraient jusqu'ici toute mise à jour :

- **ADR-023** (« Distribution hors-ligne ») : pas de mise à jour automatique
  embarquée (pas d'`electron-updater`), pas de signature de code ; les
  mises à jour se font par **réinstallation NSIS complète**.
- **ADR-161 §4** : le téléchargement/exécution automatique est **refusé**
  tant que les exécutables ne portent pas de signature Authenticode et
  qu'aucun hébergement n'existe. « Le jour où un certificat de signature et
  un hébergement seront disponibles, `electron-updater` pourra être ajouté
  avec vérification de signature obligatoire. »

État réel vérifié au moment de la décision (2026-11-15) :

- aucun code de mise à jour n'existe (ni `electron-updater`, ni
  `autoUpdater`) ; `publish: []` dans `config/electron-builder/pos.yml` ;
- le dépôt **n'a pas de remote GitHub** : il n'existe donc aucune release, et
  aucun chemin de distribution ;
- le client Android (APK) est construit par EAS (`preview`) et n'a aucun
  mécanisme de détection ;
- le POS et le client partagent déjà une **version unique** (ADR-161,
  `scripts/release/version.mjs`), donc une comparaison de versions est
  possible sans nouvelle donnée métier.

Décision du propriétaire (2026-11-14) : les mises à jour doivent être
**automatiques**, sans jamais retirer à l'utilisateur la décision
d'installer.

## Décision

### 1. Détection automatique, en lecture seule

Le processus principal lit un **manifeste JSON** publié en asset d'une release
et compare la version annoncée à la version en cours d'exécution. La lecture
est **en lecture seule** : aucun exécutable n'est téléchargé, lancé ou
remplacé par l'application.

Points figés :

- **Un seul manifeste** pour les deux produits (`suiteVersion` +
  `androidVersionCode`) : la version reste unique (ADR-161).
- **URL fixe** `…/releases/latest/download/update-manifest.json` : **jamais
  l'API GitHub**, limitée à 60 requêtes/h par IP — un parc de clients Android
  la saturerait.
- **Origines autorisées** (liste blanche, deny-by-default) : `github.com`,
  `raw.githubusercontent.com`, `objects.githubusercontent.com`. La boucle
  locale n'est tolérée que **hors paqueté** (développement et tests).
- **Échec = silence** : hors ligne, manifeste illisible, réponse inattendue
  ⇒ aucune annonce, aucune erreur affichée, une ligne de journal.

### 2. Annonce au propriétaire, application manuelle

Le POS annonce la version dans la section **« À propos »** (écran Réglages) et
n'offre qu'une action : **ouvrir la page de la release dans le navigateur du
système**. L'application **n'exécute jamais l'installateur** : la décision
d'installer reste humaine, y compris pour le compte de l'utilisateur Windows
qui n'a pas les droits d'administrateur (le POS s'installe en `perMachine`).

Le client Android fait de même : bandeau « version plus récente » + ouverture
du lien de téléchargement. Android interdit l'installation silencieuse d'un
APK téléchargé hors magasin — la confirmation de l'utilisateur y est
systématique, ce qui est le comportement voulu.

### 3. Ce qui reste refusé

- **Pas d'`electron-updater`, pas de `quitAndInstall`, pas d'exécution
  automatique** : inchangé tant qu'aucun certificat de signature n'existe.
  La porte `verify:release-config` continue d'interdire
  `verifyUpdateCodeSignature: false` (ADR-070).
- **Pas de signature de code** dans cette version : SmartScreen peut demander
  confirmation à l'installation, comportement déjà documenté (ADR-023).
- **Pas de migration, pas d'écriture de donnée métier** : la détection ne
  touche ni la base ni les sauvegardes.

### 4. Contrat de version : une seule source

La version du bundle client devient la constante `APP_VERSION`
(`mobile/src/App.tsx`), source unique consommée par l'écran Compte **et** par
la détection de mise à jour. `scripts/release/version.mjs` la remplace à
chaque `version:set`, et `tests/unit/version-alignment.test.ts` vérifie son
alignement avec `package.json`.

### 5. Points d'ancrage

- `electron/services/update-feed.ts` : contrat du manifeste (validation
  pure, comparaison de versions, liste blanche d'origines, `fetch` injectable).
- `electron/services/update-check.ts` : service (cache, silence, ouverture de
  la page de release) — l'URL du manifeste est **vide par défaut** : la
  détection est **désactivée** tant que le dépôt de distribution n'existe
  pas (fail-closed).
- `scripts/release/update-manifest.mjs` : fabrication du manifeste
  (`npm run release:manifest`) — **hors** de la chaîne `package:win`, pour
  qu'un build local ou une CI sans dépôt distant reste possible.
- Canaux IPC `system.updateStatus` et `system.openUpdatePage` (lecture seule,
  entrée vide ; le renderer ne fournit **aucune URL** — la page vient du
  manifeste lu par le processus principal).

## Conséquences

- Le propriétaire est **informé sans être interrompu** : l'écran de caisse
  n'affiche jamais d'alerte de mise à jour.
- La détection est **invisible** tant que le dépôt GitHub de distribution
  n'existe pas (URL vide) : le comportement en production reste celui
  d'aujourd'hui jusqu'à l'activation (voir §Procédure d'activation).
- Le canal de distribution retenu (GitHub Releases) sert aussi de source
  unique des empreintes : `SHA256SUMS.txt` et le manifeste portent les mêmes
  SHA-256.
- Une **compromission du compte de distribution** reste possible tant que
  rien n'est signé : elle permettrait d'annoncer une fausse version (le
  propriétaire verrait un lien vers une page inconnue). Elle ne permettrait
  **pas** l'installation automatique — c'est pourquoi cette porte reste
  fermée jusqu'au certificat.

## Alternatives écartées

- **`electron-updater` maintenant** : refusé — ADR-161 §4 exige un certificat
  pour l'exécution automatique ; l'ajouter sans signature reviendrait à
  exécuter du code non signé téléchargé depuis le réseau.
- **Microsoft Store / Google Play** : distribution par une plateforme tierce
  (modèle différent, hors périmètre).
- **`expo-updates` (OTA)** : mise à jour silencieuse du code JavaScript
  uniquement, mais exige un projet EAS Update configuré et ne couvre pas les
  changements de paquets natifs — décision differée, non retenue ici.
- **Push de notification au client Android** : hors de portée (Android
  interdit l'installation silencieuse d'un APK de toute façon).
- **CDN tiers pour le manifeste** : refusée pour l'instant (liste blanche
  d'origines restreinte) ; l'élargir serait une décision explicite.

## Procédure d'activation

1. Créer le dépôt GitHub de distribution (public) et le pousser comme remote.
2. Publier une release contenant : l'installateur, le portable, l'APK,
   `SHA256SUMS.txt` et `update-manifest.json` (produit par
   `npm run release:manifest` avec `VELORIA_RELEASE_BASE_URL` pointant sur la
   page de la release).
3. Renseigner l'URL du manifeste :
   - POS : `DEFAULT_UPDATE_MANIFEST_URL` dans
     `electron/services/update-check.ts` (ou la variable
     `VELORIA_UPDATE_MANIFEST_URL` au lancement) ;
   - client Android : `EXPO_PUBLIC_UPDATE_MANIFEST_URL` au build EAS.
4. Vérifier sur un poste de test : annonce affichée, ouverture de la page,
   installation manuelle, données conservées.

## Vérification

- `tests/unit/update-feed.test.ts` : contrat du manifeste, comparaison de
  versions (dont `1.0.10 > 1.0.9`), liste blanche d'origines, rejets.
- `tests/unit/update-check.test.ts` : service (silence hors ligne, cache,
  ouverture de la page, refus d'origine non autorisée) — Electron simulé.
- `tests/unit/mobile-update.test.ts` : côté client (comparaison, annonce,
  silence, refus du http).
- `tests/unit/release-update-manifest.test.ts` : fabrication du manifeste
  (refus sans URL de release, empreintes, liens de téléchargement).
- `tests/unit/version-alignment.test.ts` : alignement de `APP_VERSION`.
- `npm run verify` (dont `verify:release-config` et `version:check`) et
  `npm run ci` doivent rester verts.
- **Validation manuelle requise** : annonce réelle sur un poste (POS packagé)
  et sur un téléphone (APK installé), installation manuelle par-dessus une
  version existante, conservation des données.
