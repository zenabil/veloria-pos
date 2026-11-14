# SQLite migration playbook

1. Read the migration runner and current maximum applied version from the live repository/database.
2. Confirm whether the migration has shipped. If yes, add a forward migration; do not edit history.
3. Write preconditions, schema change, data backfill, and postconditions.
4. Make the migration safe for empty, populated, and partially legacy data.
5. Capture a consistent pre-migration backup using the project's supported mechanism.
6. Use a transaction where SQLite and the required PRAGMA sequencing allow it. If a table rebuild requires foreign-key mode changes, follow SQLite's documented ordering and verify `foreign_key_check` afterward.
7. Add a migration test that runs from a fresh database and from the previous supported schema.
8. Test interruption/failure behavior: the database must not be left half-migrated.
9. Verify schema metadata, indexes, constraints, foreign keys, and representative row counts.
10. Update migration lock/hash files only with the new migration when the project uses immutable migration hashes.
11. Document backup, rollback, and forward-repair steps. A destructive change without a safe rollback needs an explicit recovery plan and approval.
