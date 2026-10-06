# ADR-059 — Outillage OpenCode pour Veloria POS

Date : 2026-10-03
Statut : Accepté

## Contexte

Le travail futur sur Veloria POS (slices verticales, migrations, UI française)
doit respecter systématiquement les 11 règles de `AGENTS.md`.
Aucune configuration OpenCode n'existait dans le dépôt.

## Décision

1. `opencode.jsonc` à la racine : `formatter:true` (prettier existant),
   permissions `ask` sur `database/migrations/*` et `*.sqlite*`,
   4 serveurs MCP (`context7`, `playwright` local, `github` readonly,
   `figma`), références `docs/` et `database/migrations/`.
2. 3 sous-agents : `db-guardian` (règles 1,3,4,5,11), `ui-fr`
   (règles 2,6), `qa` (règles 8,9,10).
3. 3 commandes : `/verify`, `/slice`, `/migration-new`.
4. 3 skills : `veloria-slice`, `veloria-db`, `veloria-ui-fr`.

## Conséquences

- `github` et `figma` exigent une connexion OAuth via `/mcps`.
- Toute slice future passe par `/slice` puis `db-guardian` + `ui-fr` + `/verify`.
- Les migrations restent immuables ; `verify:migrations` vert vérifié à l'installation (34/34 OK).
