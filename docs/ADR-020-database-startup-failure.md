# ADR-020 — Échec base au démarrage : fatal pour la coquille, page de récupération

Date : 2026-09-17. Statut : accepté.

## Contexte

`electron/main/main.ts:startup()` capturait l'échec `openDatabase()` (log FATAL)
puis enregistrait quand même tout l'IPC et créait la fenêtre principale :
l'application tournait en état instable (écran正常, requêtes en échec).
De plus, `integrityCheck() !== "ok"` n'était que journalisé, et les violations
de clés étrangères ignorées.

## Décision

- Nouveau module pur `electron/main/startup-flow.ts` (aucun import Electron) :
  `attemptDatabaseStartup()` (ouverture + intégrité + FK, ne lève jamais),
  `classifyStartupError()` (open / migration / version / integrity, message FR
  sans trace), `resolveStartup()` (exactement un mode : `main` ou `recovery`).
- `main.ts` ne crée la coquille que via `enterMainMode` (base prête) ; sinon
  `enterRecoveryMode` (jamais de fenêtre principale). Réessai en place
  (`recovery.retry`) rebascule vers la coquille sans ré-enregistrer l'IPC
  (gardes d'idempotence, `ipcMain.handle` lève sur doublon).
- Nouvelle fenêtre de récupération (`window-manager:showRecoveryWindow`,
  HTML statique FR généré par `recovery-view.ts`, sans stack ni SQL) avec les
  actions existantes : Réessayer, Restaurer (`backup.list/restore` puis
  `app.restart`), Ouvrir le dossier, Changer l'emplacement
  (`system.selectFolder` + `database.relocate` puis `app.restart`), Quitter.
- `registry.ts` : `registerIpc()` = `registerCoreIpc()` (canaux sûrs sans base :
  app.version/restart, database.location/relocate, system dossiers) + métier ;
  mode récupération = noyau + backup + `registerRecoveryIpc`
  (`recovery.retry`/`recovery.exit`, charge vide validée par
  `recoveryActionSchema`). Aucun canal générique, restrictions inchangées.
- `backup.service:restore` : si la base ne s'ouvre pas (récupération), repli
  explicite et journalisé vers une copie brute du fichier fermé
  (`snapshotClosedDbFile`, compagnons WAL inclus) au lieu d'échouer ; catches
  de rollback désormais journalisés (plus de catch silencieux sur ce chemin).
- Aucun changement de schéma ni de logique métier ; migrations intactes.

## Conséquences

- 12 tests `tests/unit/startup-flow.test.ts` : nominal, ouverture, migration,
  version, intégrité, FK, réessai, HTML sûr. Suite complète 158/158,
  `typecheck` + `typecheck:electron` verts, `verify-migrations` vert, builds OK.
