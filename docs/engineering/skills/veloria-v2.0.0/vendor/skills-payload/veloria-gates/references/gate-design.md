# Quality gate design pattern

For every gate record:

| Field | Required content |
|---|---|
| ID | Stable gate identifier |
| Invariant | What must remain true |
| Scope | Files/components/artifacts inspected |
| Trigger | When the gate runs |
| Command | Exact reproducible command |
| Positive proof | Evidence of correct behavior |
| Negative proof | How the gate fails on a deliberate defect |
| Failure owner | Team/skill responsible |
| Waiver | Who may approve, expiry, and compensating control |

## Negative-proof examples

- Migration gate: alter a disposable applied migration and prove hash verification fails.
- IPC gate: send an invalid payload or wrong sender and prove the handler rejects it.
- Money gate: feed a half-rounding boundary and prove the documented result.
- Idempotency gate: repeat the same operation and prove there is only one business effect.
- Backup gate: corrupt a disposable backup and prove restore validation refuses it.
- Packaging gate: remove a required resource from a test package and prove artifact inspection catches it.

Never perform destructive negative tests against real user data or production signing material.
