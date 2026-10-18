# ADR-089 — Garde pin_algo (0043) + couverture vérificateur 0041/0042

Date : 2026-10-14. Statut : accepté.

## Contexte

Audit radical 2026-10-14 (42 migrations, 705 tests verts, typecheck vert,
`verify-migrations` vert, build vert) : aucune fuite de couche, aucun
`run-sql`, argent en centimes intacts, atomicité prouvée. Deux trous
restants au niveau invariants :

1. `database/migrations/0039_access_pin_kdf.sql:11-12` ajoute `pin_algo`
   sans `CHECK` — toute chaîne acceptée au niveau SQL, alors que le
   domaine (`src/domain/customer/client-access.ts:157`) ne connaît que
   `pbkdf2-sha256-100k` + historique `sha256`.
2. `scripts/database/verify-migrations.mjs:1173-1240` saute de 0040 à
   `integrity_check` sans aucun bloc sémantique 0041/0042 : le vérificateur
   est vert par construction, pas par preuve.

## Décision

- Nouvelle migration `0043_pin_algo_guard.sql` (0001..0042 immuables) :
  normalisation défensive + 2 triggers `BEFORE INSERT/UPDATE` avec message
  FR `PIN invalide : algorithme non pris en charge.`
- Extension du vérificateur : blocs 0041 (tables + 2 gardes dernier
  gérant), 0042 (singleton `id=1`), 0043 (2 gardes + rejet `md5` en FR).
- Nouveau test `tests/database/pin-algo-guard.test.ts` :
  canoniques acceptées, `md5` refusé, double-submit même `operationId` =
  effet unique, tentative avortée = rollback total.

## Conséquences

- Vente/argent/stock inchangés ; surface couverte : activation accès client.
- `verify-migrations` reste la porte : tout futur ajout de migration exige
  son bloc sémantique sous peine de rouge.
