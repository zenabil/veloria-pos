# Diagnostics and telemetry policy

## Default stance

- Local logging enabled at a minimal useful level.
- Remote telemetry disabled unless the product owner explicitly approves a documented collection contract.
- No personal/financial record contents in logs by default.
- Support bundle is user-initiated and previews its contents before export.

## Retention

Set explicit per-log retention and size caps. Rotate by size/time. Preserve security/audit logs according to the project's approved retention policy. Do not purge records still needed to understand an unresolved incident or an idempotent retry window.

## Redaction tests

Create test fixtures containing fake email addresses, phone numbers, tokens, PIN-like strings, license payloads, customer names, invoice totals, and file paths. Confirm the sanitizer removes or masks them before they reach exported logs.

## Operational health indicators

- Database open and integrity state.
- Last verified backup and last restore drill.
- Pending sync queue size and oldest item age.
- Last successful print and device connectivity.
- Last successful update verification.
- Crash/restart count and recent sanitized error codes.
