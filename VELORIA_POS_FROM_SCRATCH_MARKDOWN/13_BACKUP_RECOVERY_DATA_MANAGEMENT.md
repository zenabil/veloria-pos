# 13 — Backup, Restore & Data Management

## Goal

A POS database is business-critical. Backup/recovery is a core product feature, not an afterthought.

## Backup types

### Automatic silent backup

Configurable schedule, for example:

- on application close
- daily
- before restore
- before schema migration

### Manual backup

User chooses a destination.

## Backup method

Use SQLite's online backup API or an equivalent safe mechanism. Do not blindly copy a live WAL-mode database file while writes are active.

## Backup file

Recommended extension:

```text
.vposdb
```

or:

```text
.sqlite
```

Include metadata outside the database only if necessary.

## Backup metadata

Record:

- application version
- schema version
- database logical name
- creation timestamp
- source database path
- backup checksum

## Restore workflow

```text
Select backup
  -> validate file type
  -> validate SQLite readability
  -> integrity_check
  -> foreign_key_check
  -> schema compatibility check
  -> create safety snapshot of current DB
  -> restore
  -> reopen
  -> verify
  -> report result
```

Never overwrite the active database without a safety backup unless the user explicitly confirms a destructive operation.

## Database relocation

Allow the user to select a data folder from Settings.

Moving the database must:

1. pause writes
2. create a verified copy
3. verify integrity
4. switch path atomically at application level
5. reopen database
6. write configuration only after successful reopen
7. keep the previous database until the new location is validated

## Recovery states

Possible startup states:

```text
HEALTHY
MIGRATING
RECOVERY_REQUIRED
CORRUPTED
RESTORE_AVAILABLE
```

The UI should show French recovery guidance instead of technical stack traces.

## Export/import

Business data export may include:

- products
- customers
- suppliers
- sales history
- expenses

Exports should be explicit and never become a hidden second source of truth.
