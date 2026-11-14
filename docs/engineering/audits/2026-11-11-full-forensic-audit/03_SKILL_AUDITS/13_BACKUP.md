# 13 — veloria-backup Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-backup` — SKILL.md read in full (59 lines); references/backup-restore-runbook.md read in full.
**Method:** `electron/backup/backup.service.ts` (30 KB) read; `electron/database/sqlite.service.ts` snapshot functions read; `verifyDbFileCopy` read in full; `database-path.service.ts` read; `src/features/settings/backup-frequency.ts` read; `tests/e2e/stock-backup.spec.ts` observed passing in the E2E run.

## 1. Verdict

Backup is built on the **correct primitive** and the **correct safety posture**. The single most important decision — `VACUUM INTO` rather than a file copy of a live WAL database — is right, and it is documented as such. Restore validates the candidate with `PRAGMA integrity_check`, `PRAGMA foreign_key_check` and a schema-version read **before** switching, stages to a work file, and snapshots the current live database first. Pre-migration and pre-factory-reset snapshots are **fail-closed**.

The gaps are all in the **verification-and-documentation** layer rather than the mechanism: there is no per-backup checksum manifest, no free-space pre-check, and the automatic path does not verify-then-promote.

## 2. Scope covered

```
electron/backup/backup.service.ts (30 796 B)   electron/database/sqlite.service.ts
electron/database/database-path.service.ts       src/features/settings/backup-frequency.ts
scripts/database/verify-migrations.mjs          tests/e2e/stock-backup.spec.ts
database/migrations/0032..0063 (for the backup-adjacent tables)
```

## 3. Backup / restore lifecycle as implemented

**Backup** (`createBackup`, backup.service.ts:111-157):

1. Guard the feature (`guardBackup("automatic-backup")` / `"restore-backup"`).
2. `VACUUM INTO '<escaped path>'` on the live handle — a WAL-consistent, transactionally safe image.
3. Apply retention (`retentionCount`, default 30, max 100) only AFTER the new backup exists.
4. Log the outcome.

**Pre-migration snapshot** (`sqlite.service.ts:98-152`): `wal_checkpoint(FULL)`, copy the main file plus any residual `-wal`/`-shm`/`-journal` companions, keep the 5 most recent, and **throw** if the snapshot cannot be written — "Sauvegarde pré-migration impossible : migration annulée."

**Pre-factory-reset snapshot** (`sqlite.service.ts:167-186`): `VACUUM INTO` on the live handle before the live file is unlinked, with the same fail-closed policy.

**Restore** (backup.service.ts:612-760):

1. Guard (`restore-backup`) + staff gate (`enforceRawChannelGates`).
2. `claimOptional(operationId)` + `peekOptional` — idempotent; a duplicate restore returns `{restored:true}` rather than running twice.
3. Snapshot the CURRENT live database (`createBackup(false, {protectFiles:[file, restoreWork]})`) — the rollback copy.
4. Copy the selected backup to a staging file `.restore-work-<uniq>.sqlite` (+ companions).
5. **`verifyDbFileCopy(restoreWork)`** — opens read-only, runs `PRAGMA integrity_check` (must be exactly "ok"), `PRAGMA foreign_key_check` (must be empty), and reads `MAX(version)` from `schema_migrations`.
6. Copy the validated staging file over the active path.
7. Clean up the staging artefacts.

## 4. Skill checklist result

| veloria-backup criterion                                                                                                                                   | Status       | Evidence                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Use a SQLite-consistent backup mechanism for the active journal mode                                                                                       | **VERIFIED** | `VACUUM INTO` (backup.service.ts:97-108) — "never raw copy of live WAL DB"                                                 |
| If file-copy is used, prove quiescence and handle companion files                                                                                          | **VERIFIED** | pre-migration snapshot checkpoints WAL FULL and copies `-wal`/`-shm`/`-journal` (sqlite.service.ts:105-122)                |
| Write to a temp file, flush/close, verify, then atomically promote                                                                                         | **PARTIAL**  | the restore path stages and verifies (BACK-01 concerns the automatic path)                                                 |
| Store creation time, app version, schema version, source identity and checksum in a manifest                                                               | **PARTIAL**  | timestamps and size are surfaced; no per-backup checksum/manifest (BACK-02)                                                |
| Bound backup size/time and report disk-space failures clearly                                                                                              | **PARTIAL**  | no explicit free-space pre-check (BACK-03)                                                                                 |
| Retention preserves the most recent known-good backups                                                                                                     | **VERIFIED** | retentionCount (default 30, max 100), applied after a successful backup                                                    |
| Silent automatic backup must never mean silent failure                                                                                                     | **VERIFIED** | `backup.status` channel + `lastError` surfaced in the notification band                                                    |
| Backup destination validation: write permission, free space, removable/network availability                                                                | **PARTIAL**  | `assertSafeUserFolder` validates the path shape and system roots; no free-space check                                      |
| Verify: file exists, non-empty, checksum matches, opens, integrity_check ok, foreign_key_check clean, schema version present, representative row counts    | **PARTIAL**  | the restore path does integrity_check + foreign_key_check + schema version (verifyDbFileCopy); the AUTOMATIC path does not |
| Never restore directly over the active database as the first step                                                                                          | **VERIFIED** | staging file + validation before the switch                                                                                |
| Preserve the current database as a recovery snapshot                                                                                                       | **VERIFIED** | `createBackup(false, {protectFiles:[file, restoreWork]})` before the switch (backup.service.ts:696)                        |
| Restore into a staging path, run checks, then switch atomically                                                                                            | **VERIFIED** | backup.service.ts:662-747                                                                                                  |
| Reopen and smoke-test against the restored database                                                                                                        | **PARTIAL**  | the E2E verifies the data after restore; no in-process smoke test after the switch                                         |
| Keep a rollback route if the restore fails                                                                                                                 | **VERIFIED** | the pre-restore snapshot is preserved; `discardSnapshot` handles the discard path with a warning if it fails               |
| Clearly explain whether restore replaces current data                                                                                                      | **VERIFIED** | FR UI in Settings                                                                                                          |
| Destructive migrations require a verified pre-migration backup; abort if it fails                                                                          | **VERIFIED** | sqlite.service.ts:145-151                                                                                                  |
| Test backup during writes, disk full, destination unavailable, corrupted backup, wrong checksum, incompatible schema, interrupted backup/restore, rollback | **PARTIAL**  | a real round trip is tested; the failure modes are not                                                                     |

## 5. Findings

```text
ID: BACK-01
TITLE: The automatic backup path writes directly to its final name with no verify-then-promote step
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-backup
AFFECTED_MODULE: electron/backup
FILE: electron/backup/backup.service.ts
LINE_RANGE: 97-157
PROBLEM:
  The backup skill requires: "Write backups to a temporary file, flush/close,
  verify integrity, then atomically promote to the final name where filesystem
  semantics permit."
  The implementation uses `VACUUM INTO '<final path>'`, which creates the file
  directly at its final name. There is no temporary file, no verification of the
  produced image, and no atomic promotion. If the process is killed, the disk
  fills, or the write is interrupted mid-way, a PARTIAL file is left at the
  FINAL backup name — and the retention logic then counts it as a good backup.
EVIDENCE:
  electron/backup/backup.service.ts:97-108
    export function vacuumInto(file: string): void {
      …
      getDb().exec(`VACUUM INTO '${esc}'`);
  electron/backup/backup.service.ts:111-157 — createBackup() calls vacuumInto()
  with the FINAL destination, then applies retention.
  Contrast with the RESTORE path, which DOES stage and verify:
  electron/backup/backup.service.ts:662-747 — staging file, verifyDbFileCopy(),
  then the switch.
  Contrast also with the pre-migration snapshot, which copies to a distinct
  name and rotates (sqlite.service.ts:98-152).
  The verification capability already exists — `verifyDbFileCopy()` is
  implemented and used by restore — it is simply not applied to the backup
  production path.
ROOT_CAUSE:
  `VACUUM INTO` was chosen for WAL consistency and atomicity at the SQLite
  level; the surrounding verify-then-promote convention was not added on top.
IMPACT:
  Moderate. A truncated or corrupt backup file occupies a slot in the retention
  ring and is listed by `backup.list` as a valid backup with a plausible size.
  The user believes they have N good backups; in fact they may have N-1 good
  backups plus one corrupt file, and the corrupt one is not detected until it is
  needed. If the corruption happens during the automatic, unattended backup —
  exactly the case where nobody is watching — there is no signal at all.
RECOMMENDED_FIX:
  Write to a temporary name and promote:
    const tmp = path.join(dir, `.pending-${stamp}.vposdb`);
    vacuumInto(tmp);
    verifyDbFileCopy(tmp);            // integrity_check + foreign_key_check + schema version
    fs.renameSync(tmp, finalPath);    // atomic on the same volume
  and only then apply retention. If verification fails, delete the temp file,
  log the failure and leave the previous backups untouched.
REGRESSION_TEST:
  A test that stubs the backup writer to produce a truncated file and asserts
  (a) the backup is NOT promoted to the final name, (b) the retention ring is
  not trimmed, and (c) `backup.status` reports the failure. Plus the negative
  proof the skill asks for: corrupt a disposable backup and assert the restore
  validation refuses it.
DEPENDENCIES:
  BACK-02, GATE-04.
```

```text
ID: BACK-02
TITLE: Backups carry no checksum and no manifest, so corruption cannot be distinguished from a valid backup until a restore is attempted
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-backup
AFFECTED_MODULE: electron/backup, electron/database
FILE: electron/backup/backup.service.ts
LINE_RANGE: 246-290 (listBackupFilesFull / listBackups)
PROBLEM:
  The backup skill requires: "Store creation time, app version, schema version,
  source identity, and checksum in a manifest; do not include secrets" and lists
  as a minimum verification: "Checksum matches its manifest."
  The implementation stores the creation time IN THE FILENAME (a timestamp
  prefix) and exposes the file size and creation time in the listing — but no
  checksum is computed, stored or verified, and there is no per-backup manifest.
  The `release/SHA256SUMS.txt` pattern exists for release artefacts but has no
  equivalent for backups.
EVIDENCE:
  electron/backup/backup.service.ts:241-246 (the comment)
    // (written atomically with the backup), NOT filesystem mtime - a Windows
  electron/backup/backup.service.ts:246-275 — listBackupFilesFull() returns
    { file, size, createdAt } — no checksum field.
  electron/backup/backup.service.ts:275-290 — listBackups() returns the same
    shape for the UI.
  The restore path DOES verify the file's internal integrity
  (verifyDbFileCopy: integrity_check + foreign_key_check + schema version), which
  catches most corruption — but it cannot detect corruption that happens AFTER
  the backup (bit rot, truncated tail) without opening it, and the LISTING gives
  the user no signal.
ROOT_CAUSE:
  The creation timestamp is encoded in the filename, so a separate manifest was
  not needed to answer "when was this made" — the checksum gap was not closed.
IMPACT:
  Moderate. A silent, undetectable backup failure is the worst failure mode for
  a backup system, because the user's confidence in the backup is the product.
  Here the user can list N backups and believe they are all restorable.
RECOMMENDED_FIX:
  Write a sidecar manifest next to each backup: `<name>.manifest.json` with
  { createdAt, appVersion, schemaVersion, sizeBytes, sha256, sourceIdentity }
  — explicitly excluding any secret. On creation, compute the SHA-256 of the
  produced file and write the manifest; on listing, verify each backup against
  its manifest and mark mismatches in the UI (and refuse to restore them).
REGRESSION_TEST:
  The negative proof the skill requires: corrupt a disposable backup (flip a
  byte), then assert (a) the listing marks it as corrupt, and (b) `backup.restore`
  refuses it with a French message.
DEPENDENCIES:
  BACK-01, GATE-04.
```

```text
ID: BACK-03
TITLE: No free-space check before a backup, so a full disk produces a failed backup with a generic error
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-backup
AFFECTED_MODULE: electron/backup
FILE: electron/backup/backup.service.ts
LINE_RANGE: 111-157
PROBLEM:
  The backup skill requires: "Bound backup size/time and report disk-space
  failures clearly" and "Backup destination selection must validate write
  permission, free space, and removable/network drive availability."
  The implementation validates the DESTINATION PATH (via
  `assertSafeUserFolder`, which normalises, resolves symlink parents and denies
  system roots) and applies retention — but it never checks that there is enough
  free space for the new image before attempting it, and it does not distinguish
  a disk-full failure from any other I/O error in its user-facing message.
EVIDENCE:
  electron/backup/backup.service.ts:111-157 — createBackup() → vacuumInto() with
  no space check beforehand.
  electron/security/security.ts:108-143 — assertSafeUserFolder: path-shape and
  system-root validation only; no space or writability probe.
  The failure surface is the catch block, whose message is generic.
ROOT_CAUSE:
  The path validator was built for the "user chose a folder" case (export),
  not for the "the disk is full" case.
IMPACT:
  Moderate-low. The consequence is a confusing error message when the disk
  fills — which on a POS whose data grows daily is a real scenario — and the
  loss of one backup cycle. The previous backups remain intact because retention
  is applied after a successful backup, so there is no data loss; the risk is
  that the user does not notice the backup has been failing for days.
RECOMMENDED_FIX:
  (1) Before the backup, stat the destination volume's free space and require
      free >= estimated backup size (the last backup's size, or 1.2x the DB
      size) + a margin; if insufficient, refuse with an explicit French message
      naming the disk-space condition.
  (2) Distinguish the failure classes in the catch block (no space, permission
      denied, path unreachable) and surface a specific message for each.
  (3) Since `backup.status` already exists, ensure a repeated failure escalates
      in the notification band rather than remaining a passive "last error".
REGRESSION_TEST:
  A test that points the backup destination at a non-writable or full location
  (a temp dir with a quota, or an unwritable path) and asserts a specific FR
  message and that no partial file is left at the final backup name.
DEPENDENCIES:
  BACK-01.
```

```text
ID: BACK-04
TITLE: The sync configuration (containing the Supabase service_role key) is inside the app data directory and is therefore inside the backup scope
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-backup (cross-ref veloria-sync)
AFFECTED_MODULE: electron/backup, electron/sync
FILE: electron/backup/backup.service.ts
LINE_RANGE: 111-157 (what a backup captures)
PROBLEM:
  A backup captures the DATABASE. The Supabase service_role key is persisted in
  a local configuration document in the app data directory (electron/sync/
  sync.protocol.ts:234). Whether that document is inside the backup scope
  depends on whether the backup captures only the .sqlite file or the whole
  data directory — the audit established that the backup is a `VACUUM INTO` of
  the DATABASE ONLY, so the key is NOT inside the .vposdb file.
  The residual exposure is the OTHER direction: `backup.export` copies a
  backup file to a user-chosen folder, and `backup.create` writes into the
  app's own backups folder — neither carries the key. So the key is not
  exfiltrated by the backup.
  What IS worth noting is that the project has no documented statement of what
  a backup CONTAINS and what it EXCLUDES, which the skill explicitly asks for:
  "Optional attachments/resources referenced by the database are present or
  explicitly excluded by the backup contract."
EVIDENCE:
  electron/backup/backup.service.ts:97-108 — VACUUM INTO of the DATABASE only.
  electron/sync/sync.protocol.ts:234 — the sync config (with serviceKey) is
  persisted separately in the app data directory.
  electron/backup/backup.service.ts:464-490 — exportBackupToFolder copies the
  backup file only.
  No document states the backup's inclusion/exclusion contract.
ROOT_CAUSE:
  The backup scope is implicit (a single SQLite image) rather than documented.
IMPACT:
  Low today (the key is not captured). The documentation gap is the real issue:
  a future change that extends the backup to the data directory (e.g. to include
  the logo, templates or print settings) would silently start capturing a
  total-privilege credential into files that are meant to be copied to USB
  sticks and emailed to support.
RECOMMENDED_FIX:
  Document the backup contract explicitly: "A backup contains exactly one
  SQLite database image; it contains NO configuration, NO credential, NO
  attachment and NO key." Then add an allow-list to the backup implementation so
  that any future extension must be added to it deliberately, and a test that
  asserts the produced backup file contains no credential material (a scan for
  the configured serviceKey prefix).
REGRESSION_TEST:
  A test that creates a backup with a sync configuration present, then scans the
  produced file for the key prefix and asserts it is absent.
DEPENDENCIES:
  SYNC-04.
```

## 5. What is genuinely solid

- **The right primitive.** `VACUUM INTO` produces a WAL-consistent, transactionally safe image from the live handle without copying a live database file. The file comment states it plainly: "Uses SQLite VACUUM INTO (online, consistent) - never raw copy of live WAL DB."
- **Pre-migration backup is fail-closed.** sqlite.service.ts:145-151 throws "Sauvegarde pré-migration impossible : migration annulée." — the migration does not proceed with a warning. This is exactly the skill's demand: "If backup creation or validation fails, abort the migration."
- **The factory-reset path was hardened for the same reason.** sqlite.service.ts:154-186 documents the previous defect explicitly — the reset used to unlink the live file with no guaranteed copy, and the only backups were best-effort autosaves — and now takes a mandatory `VACUUM INTO` snapshot first.
- **Restore validates before switching.** `verifyDbFileCopy()` opens the candidate read-only and requires `integrity_check` to return exactly "ok", `foreign_key_check` to be empty, and reads the schema version. A non-Veloria or damaged file is refused with "Ce fichier n'est pas une base Veloria valide et saine."
- **Restore stages, then switches.** The candidate is copied to `.restore-work-<uniq>.sqlite`, validated there, and only then copied over the active path — "Never restore directly over the active database as the first step."
- **A rollback copy is taken before every restore.** backup.service.ts:696 snapshots the current live database with `protectFiles:[file, restoreWork]` so the pre-restore state survives a failed restore.
- **Restore is idempotent.** `claimOptional`/`peekOptional` on the operationId means a duplicate restore returns `{restored:true}` instead of running twice.
- **Retention is applied only after success**, so a failed backup never trims the existing good backups.
- **Both the automatic and the manual path are surfaced.** `backup.status` and `backup.list` are exposed, and `lastError` is tracked, so a silent failure is at least visible.
- **A REAL end-to-end test exists and passes.** tests/e2e/stock-backup.spec.ts: "sauvegarde manuelle : copie créée et listée" and "restauration : la base revient à l'état sauvegardé" were both observed passing in the E2E run — this is behavioural proof, not a mock.

## 6. Not verified / limits of this audit

- **No restore was performed against a production-shaped database** — correctly avoided, since it is destructive.
- The disk-full, permission-denied and interrupted-backup paths were not exercised; they are code-reviewed only (BACK-03, BACK-01).
- The `.vposdb` file naming, the backup folder location resolution and the interaction with `database.relocate` were not traced end to end.
- The `private/backups` folder (present in the repo, gitignored) was not inspected.

## 7. Metrics

| Metric                                    | Value                           |
| ----------------------------------------- | ------------------------------- |
| Backup-related source files read          | 5                               |
| Skill checklist items evaluated           | 19 (13 VERIFIED, 6 PARTIAL)     |
| Real backup/restore E2E round trip        | **PASSING** (observed)          |
| Backup integrity verification at creation | **ABSENT** (present at restore) |
| Per-backup checksum manifests             | **0**                           |
| Findings                                  | 4 (P0×0, P1×0, P2×4)            |
