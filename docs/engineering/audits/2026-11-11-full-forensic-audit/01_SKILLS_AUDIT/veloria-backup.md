# veloria-backup â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

Backup is built on the correct primitive â€” SQLite `VACUUM INTO` gives a WAL-consistent snapshot without copying a live database â€” and the retention/rotation and mandatory-snapshot-before-destructive-operation behaviours are strong. The gap is that restore is a live-data operation whose safety is asserted in code comments and guards but not demonstrated by an automated restore-drill gate.

## 2. Scope covered

SKILL.md (59 L) + references/backup-restore-runbook.md; electron/backup/backup.service.ts (30 KB); electron/database/sqlite.service.ts (snapshotBeforeMigration, snapshotBeforeFactoryReset); scripts/database/verify-migrations.mjs; tests/e2e/stock-backup.spec.ts; src/features/settings/backup-frequency.ts.

## 3. Skill checklist result

| Criterion                                                                                                                    | Status       | Evidence                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use a SQLite-consistent backup mechanism                                                                                     | **VERIFIED** | VACUUM INTO (backup.service.ts:97-108) â€” never a raw copy of a live WAL database                                                                       |
| If file-copy is used, prove quiescence and handle companions                                                                 | **VERIFIED** | snapshotBeforeMigration checkpoints WAL FULL and copies -wal/-shm/-journal companions (sqlite.service.ts:105-122)                                        |
| Write to a temp file, flush/close, verify, then atomically promote                                                           | **PARTIAL**  | VACUUM INTO writes directly to the final name; no separate verify-then-promote for the automatic path                                                    |
| Store creation time, app version, schema version, source identity, checksum in a manifest                                    | **PARTIAL**  | backups carry timestamps and sizes; no per-backup checksum manifest                                                                                      |
| Bound backup size/time and report disk-space failures clearly                                                                | **PARTIAL**  | size is logged; no explicit free-space pre-check                                                                                                         |
| Retention preserves the most recent known-good backups                                                                       | **VERIFIED** | retentionCount (default 30, max 100) applied only to verified backups                                                                                    |
| Silent automatic backup must never mean silent failure                                                                       | **VERIFIED** | backup.status channel + lastError surfaced in the UI notification band                                                                                   |
| Backup destination selection validates write permission, free space, drive availability                                      | **PARTIAL**  | assertSafeUserFolder validates system roots and symlinks; no free-space check                                                                            |
| Integrity verification: file exists, checksum matches, opens, integrity_check, foreign_key_check, schema version, row counts | **PARTIAL**  | integrity_check + foreign_key_check are run by verify:migrations, but the RESTORE path does not re-run them against the selected backup before switching |
| Never restore directly over the active database as the first step                                                            | **VERIFIED** | restore stages then switches                                                                                                                             |
| Preserve the current database as a recovery snapshot                                                                         | **VERIFIED** | snapshotClosedDbFile() (backup.service.ts:193)                                                                                                           |
| Destructive migrations require a verified pre-migration backup; abort if it fails                                            | **VERIFIED** | sqlite.service.ts:145-151 â€” throws, migration refused                                                                                                  |
| Test backup during writes, disk full, corrupted backup, interrupted restore, rollback                                        | **PARTIAL**  | tests/e2e/stock-backup.spec.ts covers a real backup+restore round trip; disk-full / corruption / interruption are not automated                          |

## 4. Findings raised by this skill

No skill-level contradiction was found. The skill's rules are implementable and, where checkable, already implemented in the codebase. Domain-level defects discovered while auditing this skill's subject matter are reported in the corresponding `03_SKILL_AUDITS/` file and are cross-referenced there.

## 5. What is genuinely solid

- The fail-closed pre-migration snapshot is exactly the behaviour the skill demands, including the refusal to continue with a warning.
- The factory-reset path was hardened to require a VACUUM INTO snapshot before unlinking the live file (sqlite.service.ts:154-180) â€” the comment explicitly documents that the old behaviour could destroy a customer's data irrecoverably.
- A real E2E round trip exists: 'sauvegarde manuelle : copie crÃ©Ã©e et listÃ©e' then 'restauration : la base revient Ã  l'Ã©tat sauvegardÃ©' (both observed passing).
- Backups are excluded from the secret scan and the migration snapshot rotation keeps the 5 most recent pre-migration snapshots.

## 6. Not verified / limits of this audit

- A restore drill against a production-shaped database was not performed (destructive to real data â€” correctly avoided).
- No disk-full / permission-denied / corrupted-backup automated test was found; these paths are code-reviewed only.

## 7. Metrics

- Checklist items evaluated: **13** â€” VERIFIED: 7, PARTIAL: 6
- Skill-level findings owned by this skill: **0**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
