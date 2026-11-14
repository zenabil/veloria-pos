# Device adapter contract

Every adapter should define:

- Stable device type and capability list.
- Supported connection modes and model/firmware constraints.
- Discovery and explicit selection behavior.
- Connection lifecycle and status values.
- Operation request/response schemas.
- Timeout, cancellation, retry, and duplicate-command semantics.
- User-safe French error mapping.
- Diagnostic fields safe to log (never credentials or full sensitive payloads).
- Mock implementation and real-device acceptance procedure.

## Minimum device test matrix

| Scenario | Expected behavior |
|---|---|
| Device absent | Clear unavailable status; no crash |
| Permission denied | Actionable setup guidance; no false success |
| Device busy | Bounded retry or manual retry, as safe |
| Disconnect mid-operation | Explicit uncertain/failure state; no duplicate business action |
| Reconnect | Controlled reinitialization |
| Duplicate event | Exactly one intended business effect |
| Unsupported capability | Graceful fallback |
