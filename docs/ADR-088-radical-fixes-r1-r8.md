# ADR-088 — Correctifs radicaux R1–R8 (causes racines, pas symptômes)

Date : 2026-10-13. Audit profond : 42 migrations vertes, 193 canaux IPC, zéro `run-sql`, domaine pur.
Verdict sécurité : MOYEN — 1 faille HIGH (H1) + 5 MEDIUM. Ce ADR trace les correctifs radicaux appliqués.

## Contexte

L'audit a montré des fondations saines (SQLite unique, centimes DZD, 1 tx + operationId, IPC + Zod,
FR via fr-map) mais 8 causes racines structurelles. Chaque correctif ci-dessous traite la cause,
jamais le symptôme isolé.

## Décisions

### R1 — Garde centrale des handlers bruts (H1, HIGH)

- Cause : `backup/*`, `printing/*`, `ocr/*` utilisent `ipcMain.handle` direct et contournaient
  `handle()` → `enforceStaffGates` jamais appelée (backup.restore imprimable/sauvegardable sans
  permission `settings`).
- Décision : nouveau module `electron/ipc/raw-guards.ts` (`enforceRawChannelGates`, outcome FR,
  jamais d'exception brute) appelé par TOUS les handlers bruts après le parse Zod ; la carte
  `STAFF_CHANNEL_PERMISSION` (`staff-gates.ts`) est étendue à `printing.*` (sales/stock/settings
  selon la nature du document), `ocr.*` (stock), `backup.create/export/autoSave` (settings).
  `RAW_GUARDED_CHANNELS` = garde-fou de revue (tout nouveau handler brut doit s'y ajouter).
- Conséquence : un renderer compromis sans session se voit refuser `STAFF_SESSION_REQUIRED` /
  `STAFF_FORBIDDEN` sur les 37 canaux bruts.

### R2 — URL dev verrouillée au non-packagé (M1)

- Cause : `window-manager.ts` chargeait `VITE_DEV_SERVER_URL` même en prod packagée (RCE contenu distant).
- Décision : `if (devUrl && !app.isPackaged)`. Test manuel : variable positionnée + build packagé → `loadFile`.

### R3 — SVG QR neutralisé par défaut (M2)

- Cause : `payment-ticket.ts` injectait `${d.qrSvg}` brut ; `chrome.ts` possédait déjà la garde.
- Décision : `safeQrSvg()` exporté de `chrome.ts` (seul `<svg` passe, sinon vide) et utilisé dans
  `payment-ticket.ts`. Règle : tout futur builder passe par `safeQrSvg`/`qrBlockSvg`/`codeBlocks`.

### R4 — Restauration confinée (M5)

- Cause : `backup.restore` ne vérifiait que l'extension (import silencieux d'une base piégée).
- Décision : `assertSafeUserFolder(dirname(normalize(file)))` avant existence + `verifyDbFileCopy`
  inchangé (dernier mot). Message FR, jamais de chemin brut.

### R5 — Secrets sync chiffrés au repos (M3)

- Cause : `serviceKey` en clair dans `app_settings`.
- Décision : `electron/sync/sync-secrets.ts` (backend injectable, `safeStorage`/DPAPI en prod avec
  préfixe `dpapi1:`, mémoire en test) ; `readDoc` décode (legacy clair accepté), `writeDoc` encode
  toujours → migration transparente sans migration SQL. Corrompu/préfixe inconnu = erreur FR
  fail-closed. `maskConfig` inchangé (renderer ne voit jamais le clair).
- Tests : `tests/unit/sync-secrets.test.ts` (roundtrip, legacy, cross-backend refusé, corrompu refusé).

### R6 — Bootstrap à code initial aléatoire (M4)

- Cause : `admin/admin` devinable entre l'installation et le changement forcé.
- Décision : `ensureDefaultManager` génère un code initial 6 chiffres (système, jamais Math.random),
  hash KDF moderne (fini `legacy-admin` pour les NOUVEAUX postes), retourné UNE fois (liste + login,
  même motif que le secours). Postes déjà installés : inchangés et toujours forcés au changement.
  UI : porte affiche le code une fois (`data-testid="initial-code-once"`), `ChangeCodeCard` forcé
  exige l'ancien code (champ vide, 64 car. pour compat legacy), écran `InitialCodeOnce` en cas de
  course liste/login. E2E (`helpers.ts`, `staff-session.spec.ts`) lit le code sur la porte.
- Conséquence : aucun secret par défaut ; le premier boot reste utilisable sans assistance.

### R7 — Garde monétaire unique côté main (D2)

- Cause : bornes `1e9/1e11` recopiées en dur (`registry.sales.ts`, `finance.repo.ts`).
- Décision : `electron/ipc/money-guard.ts` = SEULE origine main (`priceLine`, `percentOfTotal`,
  constantes miroirs) ; `registry.sales.ts` + zakat l'utilisent. Parité prouvée par
  `tests/unit/money-guard-parity.test.ts` (fail-closed). Règle : plus aucun littéral
  `1_000_000_000`/`100_000_000_000` hors de ce module.

### R8 — operationId figé par dialogue (D5, entamé)

- Cause : `newOperationId()` inline par clic (retry = nouvelle opération).
- Décision : hook `src/shared/ui/use-operation-id.ts` (UUID à l'ouverture, `regen` explicite) ;
  appliqué en exemplar à `CustomerReturnDialog`. Reste : 14 dialogues (returns/staff/expenses/
  suppliers/bread/proformas — voir § Travail restant).

## Vérification (2026-10-13)

- `tsc -p tsconfig.electron.json --noEmit` : propre.
- `tsc -b` (renderer) : propre.
- `verify-migrations.mjs` : `MIGRATIONS VERIFIED`, `integrity_check=ok`, 0 violation (42/42).
- `verify-domain.ts` : `DOMAIN VERIFIED`.
- Vitest ciblé : money-guard-parity (9) + sync-secrets (5) + sync-protocol (10) + staff-domain (11) = 35 verts.

## Travail restant (dette tracée, non structurelle)

1. R8 : migrer les 14 dialogues restants vers `useOperationId()` + `tests/e2e/idempotency.spec.ts`
   (double-submit même UUID → effet unique) pour sales + returns + staff.
2. Use-cases PUR manquants (`src/application/returns|staff|expenses|…`) sur le patron
   `adjust-stock.ts` + tests de parité Zod.
3. Split des god files (`SettingsSectionsB` 1363, `OcrImportDialog` 1152, `returns.repo` 1147,
   `finance.repo` 946) par slice, zéro sémantique par étape.
4. `docs/INDEX.md` : indexer ADR-085/086/087/088 ; skill `veloria-db` : dernier fichier = 0042.
5. Suivi git : commiter `0041_staff_roles.sql` + `0042_staff_recovery.sql` (non suivis au 13/10).
