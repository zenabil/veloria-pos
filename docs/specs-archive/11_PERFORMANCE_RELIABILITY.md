# 11 — Performance & Reliability

## Performance targets

Target behavior, measured on a normal supported Windows workstation:

- cold app start to interactive shell: <= 2.5s target
- warm restart: <= 1.5s target
- product barcode search: <= 50ms local target for indexed lookup
- common sale commit: <= 150ms target excluding printer hardware latency
- simple page transitions: effectively immediate (<100ms perceived)
- no visible freeze during normal CRUD operations

These are targets, not guarantees; benchmark on representative hardware before release.

## Startup

Startup stages:

```text
Electron process
  -> single-instance lock
  -> logging
  -> configuration
  -> database open
  -> migrations
  -> integrity health check
  -> IPC registration
  -> window creation
  -> UI ready
```

Do not load expensive reports, OCR engines, printer enumeration, or large datasets during shell startup.

## Database performance

- prepared statements
- appropriate indexes
- pagination
- SQL aggregation
- bounded result sets
- one connection owner
- explicit transactions
- no N+1 reads

## UI performance

- virtualize very large tables where needed
- debounce text search
- memoize only measured hot paths
- avoid rendering hidden large datasets
- keep global state small
- avoid broad subscriptions to changing stores

## Reliability principles

### Atomic writes

No partial sale state.

### Idempotent command handling

A UI retry should not create a second sale if the original command committed. Use an operation id generated before the mutation and persisted in the transaction.

### Graceful shutdown

Close database resources and stop background work before process exit.

### Crash resilience

The database must use WAL and full synchronization. After abnormal termination, the app must reopen and pass integrity checks or enter a controlled recovery mode.

## Integrity verification

At startup and on-demand, support:

```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

Do not run expensive checks on every screen load.

## Memory

The application must not retain large report datasets indefinitely. Use bounded query results, disposal patterns, and explicit lifecycle management.

## Error budgets

Any issue that can silently corrupt:

- sales
- balances
- stock
- invoices
- backup files

is release-blocking.
