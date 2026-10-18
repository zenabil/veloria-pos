# ADR-115 — Rotation de clés licensing : réparation Manager + garde `verify:licensing`

## Contexte

Signalement opérateur : « Licence invalide : signature non reconnue. » à
l'activation, POS 1.0.0 (build du 2026-10-17, clé embarquée K17).

Diagnostic (logs `%APPDATA%/Veloria PoS/logs` + inspection crypto) :

- Deux rotations de clé vendor ont eu lieu sans les étapes 3/4 de
  `docs/licensing/KEY_MANAGEMENT.md` :
  K-committed (≤ 2026-09-29) → K11 (≤ 2026-10-11) → K17 (2026-10-17).
- La licence locale (2026-09-29) et la clé STOCKÉE par le Manager
  (`%APPDATA%/Veloria License Manager/keys/private.enc`, 2026-10-11)
  appartiennent aux générations précédentes. Le Manager signait donc encore
  avec K11 : toute licence émise ensuite est refusée par le POS K17
  (`import_bad_signature`, log 2026-10-17 23:16–23:19Z).
- Aucun bug de code : la paire du dépôt, le `public.key` embarqué et la
  vérification Ed25519 sont cohérents. Le maillon manquant est opérationnel
  (ré-import Manager + ré-émission), non instrumenté.

## Décisions

- **Réparation opératoire (poste vendor)** : la clé stockée du Manager est
  réécrite avec la paire courante (via le code Manager, DPAPI) ; la licence
  locale est ré-émise avec K17 (`issue-local-license.cjs`) puis importée
  (`ACTIVE`, VLIC-D756A0C1). Sauvegardes : `private.enc.bak-2026-10-18`,
  `license-state.dat.bak-2026-10-18`, ancien `.vlic` archivé
  (`private/Veloria-POS-LOCAL-2026-09-29-ancienne-cle.vlic`).
- **Garde `npm run verify:licensing`** (`scripts/licensing/verify-licensing.cjs`,
  lecture seule) : vérifie la chaîne complète — paire du dépôt,
  `resources/license/public.key` embarqué, clé stockée du Manager, licence
  locale — et échoue (exit 1) sur toute divergence. À lancer après chaque
  rotation et avant release.
- **`KEY_MANAGEMENT.md`** : la procédure de rotation intègre le ré-import
  Manager (étape 3) et la vérification `verify:licensing` (étape 5).
- **Pas de rebuild** : les installeurs 1.0.0 livrés embarquent déjà K17 ;
  seul l'état opérationnel (clé Manager + licences) était à réparer.

## Conséquences

- Licences antérieures au 2026-10-17 (DB Manager : VLIC-508A3775,
  VLIC-4D89FB8B, VLIC-55AAC0D6, …) = `INVALID_SIGNATURE` sur les builds K17 :
  à ré-émettre depuis le Manager (historique conservé), comme prévu par la
  rotation.
- `resources/license/public.key` (K17) est modifié dans l'arbre de travail :
  à committer avec la release (l'ancienne valeur reste dans l'historique git).
- L'incident est verrouillé : une rotation oubliée (Manager non ré-importé)
  est désormais détectée par `verify:licensing` en une commande.
