# PHASE 12 — Découpe P2 (suite) : `backup-frequency` + `files` (2026-10-02)

> Suite de PHASE 11. Comportement strictement identique, prouvé par tests.

## Livré

1. **`backup-frequency.ts`** (`src/features/settings/backup-frequency.ts`) extrait verbatim de `SettingsSectionsB.tsx` : type `BackupFrequency` + `BACKUP_FREQUENCIES` (8 libellés) + `backupFrequencyMinutes` + `backupFrequencyFromAuto` (repli legacy `intervalDays`). NOTE : `backupFrequencyMinutes` renderer ≠ domaine (`@domain/backup/backup-rules.ts` borne [5,10080] — parité main/domaine par `main-domain-parity.test.ts`, ici affichage seul, sémantique conservée).
2. **`files.ts`** (`src/shared/formatters/files.ts`) : `formatBytes` dédupliqué (`OcrImportDialog` + `SettingsSectionsB`, version gardée `—` si corrompu ; `File.size` toujours fini ≥ 0 → rendu identique). NOTE : décimales à point (« 1.0 Ko ») conservées verbatim — harmonisation virgule FR hors périmètre (changement visuel, à trancher).
3. Tests `tests/unit/settings-helpers.test.ts` (3 tests).

## Gardes

`format` ✓ · `typecheck` ✓ · `unit` 438 ✓ (435 + 3) · `eslint` fichiers touchés ✓.
