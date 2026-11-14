# Google Sheets V1 bridge — constraints and implementation outline

## Responsibility split

| Component | Owns |
|---|---|
| Veloria POS / SQLite | Canonical local customers, invoices, payments, balances, and sale history |
| Outbox in POS | Durable record of approved outbound snapshots awaiting delivery |
| Trusted bridge service | Credential custody, validation, customer authorization, controlled Sheets access |
| Google Sheets | V1 intermediary projection/transport store; not the POS transaction ledger |
| Customer app | Authenticated customer-facing read experience; no unrestricted sheet access |

## Minimum data contract

Design a versioned, per-customer projection with only the fields needed by the experience. Candidate fields should be reviewed before inclusion: opaque customer reference, invoice reference/number, invoice date, line summaries if required, total, paid amount, outstanding amount, payment history, currency, update timestamp, and schema version.

Do not export internal purchase cost, margin, stock valuation, supplier information, employee notes, other customers' data, or secrets.

## Sync mechanics

- Use a durable local outbox with stable operation IDs.
- Reserve/claim a row before network transmission to prevent concurrent duplicate sends.
- Make bridge writes idempotent using unique operation/customer references.
- Apply bounded retries with exponential backoff and jitter for transient failures.
- Track row-level failures separately from global sheet/schema/configuration failures.
- Keep a monotonic update/version marker so stale updates cannot overwrite newer snapshots.
- Provide a manual retry/diagnostic action without requiring POS restart.

## Security gate — release blocker

Never ship direct mobile access to a shared spreadsheet using embedded credentials. The bridge must authenticate the customer and authorize every requested record against that customer's identity. Verify access with adversarial tests before release. If the chosen infrastructure cannot prove isolation, redesign the access layer before deployment.

## Open decisions that must be resolved in an ADR

- Bridge API/runtime hosting and authentication mechanism.
- Customer identity proofing and account recovery.
- Whether customer app is read-only in V1.
- Sheet layout, row key, versioning, retention, and quota handling.
- Cache duration and remote deletion/revocation propagation.
- Handling of customer phone changes and duplicate phone numbers.
