# 06 — SQLite Architecture

## Database identity

**Logical name:** `veloria POS DB`  
**Default physical filename:** `Veloria POS DB.sqlite`

Recommended default directory:

```text
%PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite
```

If per-user installation semantics are preferred, use an application-data directory that survives app updates. The exact Windows path is an implementation decision, but the database must never live under a read-only packaged resource such as `app.asar`.

## Database ownership

Only the Electron main process opens the SQLite database.

```text
Renderer
  X direct SQLite
  X direct filesystem
  X direct Node APIs

Renderer
  ↓ typed preload API
Electron main
  ↓
SQLite service
  ↓
better-sqlite3
```

## SQLite configuration

At connection initialization:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 10000;
PRAGMA wal_autocheckpoint = 1000;
PRAGMA temp_store = MEMORY;
PRAGMA trusted_schema = OFF;
```

Choose any additional pragma only after profiling and documenting its reliability tradeoff.

## Monetary storage

Store DZD monetary values as integer minor units where practical:

- `100 DZD` is stored as `10000` centimes.
- UI formats the stored integer back to DZD.

Use a dedicated `Money` value object so business logic cannot accidentally treat money as a binary floating-point number.

If a future jurisdiction requires another precision, make scale explicit in one place.

## Identifiers

Use UUIDv7 or another sortable unique identifier strategy for business entities if the chosen library/runtime supports it cleanly. Keep an integer surrogate primary key only where it materially improves local indexing.

Every aggregate root has a stable `uuid` unique key.

## Dates

Persist timestamps as ISO-8601 UTC strings or integer Unix milliseconds consistently. Persist business dates such as invoice date or bread order date separately when they are calendar concepts.

Do not store locale-formatted text in the database.

## Migrations

Migrations are immutable files:

```text
0001_initial.sql
0002_indexes.sql
0003_financial_constraints.sql
...
```

A migration:

- is deterministic
- runs once
- is recorded in `schema_migrations`
- is transactional whenever SQLite permits it
- is never edited after release
- has an explicit down/recovery strategy if needed

## Repository rules

Repositories must:

- use prepared statements
- map DB rows to domain records
- not expose raw SQLite objects
- not contain UI behavior
- keep SQL discoverable and testable
- use transactions through the transaction port

## Query rules

- Never load an entire high-volume table into React for filtering.
- Pagination is mandatory for history/report grids.
- Search fields have appropriate indexes.
- Aggregates are calculated in SQL when that is more efficient.
- N+1 query patterns are prohibited.

## Referential integrity

Use real foreign keys for relationships that should exist together.

Use soft deletion only where business history requires it. Never physically delete a financial record that must be retained merely to simplify UI behavior.

## Local auditability

Critical write operations should create an append-only audit record containing:

- event id
- operation type
- aggregate type/id
- timestamp
- before/after snapshot or concise change record when appropriate
- reason

Do not store sensitive material that is not required for the audit.
