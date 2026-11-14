---
name: veloria-backup
description: "Design and verify Veloria's offline backup, retention, database snapshots, restore, migration safety, backup-path selection, integrity verification, and disaster recovery."
---

# Veloria Backup — recoverable data protection

## Mission

Ensure every supported customer database can be backed up consistently and restored into a valid, usable state without silent data loss.

## Inspect the real storage model

Verify where SQLite files, WAL/SHM files, attachments, configuration, encryption material, and backups live. Determine whether SQLite is using WAL mode and which supported backup API/strategy the project already uses. Never assume copying an open `.sqlite` file is safe.

## Backup rules

- Use a SQLite-consistent backup mechanism appropriate to the active journal mode (for example, SQLite online backup API or another verified mechanism).
- If file-copy is used, prove the database is quiescent/checkpointed and that all required companion files are handled; otherwise do not use raw copy.
- Write backups to a temporary file, flush/close, verify integrity, then atomically promote to the final name where filesystem semantics permit.
- Store creation time, app version, schema version, source identity, and checksum in a manifest; do not include secrets.
- Bound backup size/time and report disk-space failures clearly.
- Retention must preserve the most recent known-good backups and must not delete the only recoverable copy.
- Silent automatic backup must never mean silent failure. Log and expose backup status safely.
- Backup destination selection must validate write permission, free space, and removable/network drive availability.

## Integrity verification

A successful file write is not a valid backup. Verify at minimum:

- File exists and is non-empty.
- Checksum matches its manifest.
- SQLite can open it read-only or in a disposable validation environment.
- `PRAGMA integrity_check` returns the expected success result.
- `PRAGMA foreign_key_check` reports no violations where foreign keys apply.
- Required tables/schema version and representative row counts are present.
- Optional attachments/resources referenced by the database are present or explicitly excluded by the backup contract.

## Restore rules

- Never restore directly over the active database as the first step.
- Validate the selected backup and compatibility before switching.
- Preserve the current database as a recovery snapshot.
- Restore into a staging path, run integrity checks and any supported migrations, then switch atomically where possible.
- Reopen and smoke-test the application against the restored database.
- Keep a rollback route if restore or first launch fails.
- Clearly explain whether restore replaces current data and which date/version will be restored.

## Migration safety

Destructive or high-risk migrations require a verified pre-migration backup. If backup creation or validation fails, abort the migration. Never continue with a warning that the only recovery path is unavailable.

## Required tests

Test backup while the app is active, backup during writes, disk full, destination unavailable, corrupted backup, wrong checksum, missing attachments, incompatible schema, interrupted backup, interrupted restore, rollback, and restore from a real representative database copy.

## Reference

- `references/backup-restore-runbook.md`
