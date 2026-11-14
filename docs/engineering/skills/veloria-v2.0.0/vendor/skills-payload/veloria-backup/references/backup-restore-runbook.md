# Backup and restore runbook

## Backup lifecycle

1. Acquire the application's backup coordination lock.
2. Capture a consistent SQLite snapshot using the verified project mechanism.
3. Copy/collect all in-scope attachments and metadata.
4. Write to a temporary destination.
5. Flush and close all handles.
6. Validate checksum, SQLite integrity, foreign keys, schema version, and attachment manifest.
7. Atomically rename/promote to the final backup name.
8. Apply retention only after a new backup has been verified.
9. Record outcome, duration, size, and sanitized failure reason.

## Restore lifecycle

1. Show backup timestamp, version, schema version, size, and validation state.
2. Verify the backup again before use.
3. Create a verified snapshot of the current live database.
4. Restore into a staging location.
5. Run integrity and compatibility checks.
6. Apply only supported migrations in a controlled process.
7. Switch the active path using an atomic/recoverable mechanism.
8. Launch a smoke test and validate key business records.
9. If any stage fails, restore the previous active database and preserve diagnostics.

## Acceptance criteria

A backup is considered verified only if a restore test has succeeded on a disposable environment. Periodically perform restore drills; do not rely solely on a successful backup log.
