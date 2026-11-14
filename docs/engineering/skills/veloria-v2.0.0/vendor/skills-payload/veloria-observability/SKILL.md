---
name: veloria-observability
description: "Add privacy-preserving logs, diagnostics, performance measurements, crash handling, support bundles, and operational health indicators across the Veloria ecosystem, including offline operation."
---

# Veloria Observability — diagnostics and operational health

## Mission

Make failures diagnosable without collecting unnecessary personal data, leaking secrets, destabilizing the POS, or making core operation depend on telemetry connectivity.

## Offline-first observability

- Local diagnostics must work without internet.
- Remote telemetry is opt-in/approved by product policy; do not introduce silent remote tracking.
- Core POS operations must not wait for analytics, crash upload, or remote logging.
- A sanitized support bundle should be exportable by an authorized user and explain exactly what it contains.

## Logging rules

- Use structured logs with timestamp, severity, component, operation/correlation ID, event code, duration, and sanitized context.
- Never log passwords, PINs, signing keys, API tokens, license private material, full payment credentials, or unnecessary customer financial data.
- Redact or hash identifiers when raw values are not needed for diagnosis.
- Bound log size and retention; rotate safely and avoid unbounded disk growth.
- Do not let logging failure crash sales or database writes.
- Keep user-facing French messages separate from technical diagnostic records.

## Metrics and traces

Measure only metrics that drive a concrete engineering or support decision, such as startup duration, database operation duration, backup success/failure, queue depth, sync age, print failure count, and crash/restart count. Define sampling, aggregation, retention, and privacy impact.

Use operation IDs to correlate a workflow across UI, main, database, sync, and printer without copying sensitive payloads into every log line.

## Error and crash behavior

- Capture sanitized crash context and the last safe operation markers.
- Distinguish expected validation errors from unexpected faults.
- Avoid retry storms and log floods.
- Provide recovery instructions and safe restart behavior.
- Never report success before durable commit or confirmed device action.

## Support bundle

Include only approved diagnostic data: application/build version, OS/runtime details, sanitized configuration state, redacted recent logs, database schema version, backup status, device capabilities, and test results. Exclude database contents by default; if a database snapshot is necessary, require explicit authorization and encryption/secure transfer policy.

## Verification

Test log redaction, rotation, disk-full behavior, offline operation, corrupted logs, crash recovery, support bundle sanitization, and operation correlation.

## Reference

- `references/diagnostic-policy.md`
