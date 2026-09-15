# 23 — Observability & Diagnostics

## Logging levels

- DEBUG — development only
- INFO — normal lifecycle
- WARN — recoverable issue
- ERROR — failed operation
- FATAL — process-threatening failure

## Structured log fields

- timestamp
- level
- component
- event
- operation_id
- error_code
- duration_ms when relevant

## Diagnostics screen

Settings > Diagnostics should show:

- app version
- Electron version
- OS version
- DB path
- DB size
- schema version
- SQLite health
- backup status
- selected printer
- last successful backup
- log folder

Do not show secrets.

## Performance tracing

For critical operations record durations in development/diagnostic mode:

- startup
- database open
- product search
- sale transaction
- report query
- backup
- print initiation

## User errors

Map technical failures into French categories:

- `DATABASE_UNAVAILABLE`
- `DATABASE_CORRUPTED`
- `PRINTER_UNAVAILABLE`
- `BACKUP_FAILED`
- `VALIDATION_ERROR`
- `CONFLICTING_OPERATION`
- `UNKNOWN_ERROR`

The user sees a useful French message and recovery action; technical details go to logs.
