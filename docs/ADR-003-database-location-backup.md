# ADR-003 — Emplacement base + backup WAL-safe

**Date :** 2026-09-14 · **Statut :** Accepté

## Décision

- Défaut : `%PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite`, repli `userData/Data` si non inscriptible.
- Chemin persistant dans `userData/config.json`, écrit **après** vérification du nouvel emplacement.
- Backups via `VACUUM INTO` (cohérent sous WAL), extension `.vposdb` + sidecar JSON (version, schéma, checksum SHA-256).
- Restauration : validation header SQLite → snapshot de sécurité auto → swap → reopen → verify.
- `deleteAppDataOnUninstall: false` — désinstallation ne supprime jamais la base.

## Raisons

Conformité 06/13 : jamais sous `Program Files`/`app.asar`, jamais de copie brute d'une DB WAL live.
