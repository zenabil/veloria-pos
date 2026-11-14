---
name: veloria-db
description: "Design and change Veloria's local SQLite data model safely, including schemas, migrations, repositories, transactions, constraints, indexes, integrity checks, and data lifecycle."
---

# Veloria DB — local data integrity and SQLite engineering

## Mission and truth boundary

Treat the local SQLite database as the authoritative source of truth for core POS operations. The renderer must not connect directly to SQLite. A cloud mirror, spreadsheet, export, cache, or customer app must not become a competing authority for POS transactions.

## Before touching the database

1. Inspect the actual database driver, schema, migration runner, migration naming convention, lock/hash mechanism, repositories, and test helpers.
2. Determine the current schema version from code and the database, not from an old skill or report.
3. Inspect foreign keys, indexes, triggers, CHECK constraints, transaction boundaries, backup behavior, and data volume.
4. Identify every read/write path affected by the change, including IPC, reports, import/export, sync, and recovery.

## Non-negotiable rules

### Schema evolution

- Add a new migration using the repository's actual convention. Never edit an already-applied migration unless the project explicitly documents a safe pre-release exception and proves it has not shipped.
- Make migrations deterministic, ordered, idempotent where the runner requires it, and safe for supported existing databases.
- Destructive migrations require a verified backup/snapshot, an explicit rollback/recovery plan, and post-migration integrity checks.
- Test both a fresh database and an upgrade from representative prior schema versions.
- Preserve data and historical records unless a user-approved retention policy says otherwise.

### Integrity and constraints

- Put invariants as close to the data as practical: foreign keys, NOT NULL, UNIQUE, CHECK, and triggers where justified.
- Do not rely only on UI validation for business invariants.
- Enable and verify foreign-key enforcement on every connection where supported by the driver.
- Never suppress a constraint failure and continue as though a write succeeded.
- Avoid triggers that conceal business behavior or create untraceable side effects. Document every non-obvious trigger.

### Transactions and idempotency

- A business mutation that spans multiple rows/tables must be atomic.
- Re-read mutable facts inside the transaction to avoid time-of-check/time-of-use errors.
- Make retryable mutations idempotent using the repository's established operation/idempotency mechanism.
- Define how an operation ID is created, retained, deduplicated, and expired. A retry must not duplicate a sale, payment, return, stock movement, or license action.
- Do not generate a fresh idempotency key on every retry.

### SQL and performance

- Use parameterized/prepared statements for values.
- Allow dynamic SQL structure only through strict allowlists (for example, known sort columns/directions).
- Do not expose a generic arbitrary-SQL IPC endpoint.
- Add indexes based on measured query patterns and `EXPLAIN QUERY PLAN`; avoid indexes without a demonstrated query benefit.
- Paginate or bound unbounded result sets. Do not load an entire history table into memory by default.

### Numeric and time fields

- Monetary values must follow `veloria-money` and the project's documented representation; do not introduce floating-point money.
- Store instants and business dates according to one documented convention. Do not mix UTC timestamps, local timestamps, and date-only values without an explicit contract.
- Use `Africa/Algiers` as the intended business timezone only after verifying the product contract and runtime timezone handling; do not hardcode `+1 hour` as a permanent timezone algorithm.

### Data lifecycle

- Define retention and purge rules for audit/idempotency/log data before adding automated deletion.
- Never purge records required for accounting traceability, reconciliation, legal retention, or retry safety without approved policy.
- Avoid cascading deletion of business history unless explicitly approved.

## Required workflow

1. State the invariant and affected entities.
2. Inspect current schema and all relevant write paths.
3. Design migration and compatibility behavior.
4. Update repository/use-case logic and IPC contract as needed.
5. Add database-level constraints and tests.
6. Test rollback, duplicate retry, concurrency, and legacy data.
7. Run integrity checks on a disposable database and verify backup/restore where relevant.
8. Update schema documentation and metrics if the project maintains generated metrics.

## Acceptance checklist

- [ ] No already-shipped migration was edited.
- [ ] Fresh install and upgrade paths pass.
- [ ] Foreign keys and constraints are actually enabled and tested.
- [ ] Multi-row writes are atomic.
- [ ] Retry cannot duplicate the effect.
- [ ] SQL values are parameterized.
- [ ] No renderer-to-database shortcut exists.
- [ ] Query plans and bounded reads are reasonable.
- [ ] Backup and recovery implications are addressed.
- [ ] Tests prove both success and failure paths.

## References

- `references/invariants.md`
- `references/migrations.md`
