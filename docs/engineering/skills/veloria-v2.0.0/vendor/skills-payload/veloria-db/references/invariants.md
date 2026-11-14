# Database invariant catalogue

This is a design checklist, not a declaration that every invariant already exists in the current database. Verify every item against the current schema and code before relying on it.

## Entity integrity

- Every business row has a stable primary key and intentional ownership/reference fields.
- Foreign keys are enabled and point to the intended parent row.
- Unique constraints encode real uniqueness rules (such as invoice numbers or active customer access) without blocking legitimate history.
- Soft deletion, archival, and hard deletion have explicit semantics.

## Financial integrity

- Document totals reconcile with line totals, discounts, fees, taxes, payments, credits, and refunds under the current business rules.
- Paid amount cannot exceed allowed limits unless overpayment is an explicitly supported workflow.
- Outstanding balance is derived or updated atomically, never maintained by uncoordinated code paths.
- All persisted monetary values use the representation mandated by `veloria-money`.

## Inventory integrity

- Quantity cannot become negative unless a specifically approved business rule allows it.
- Stock movements have traceable reason, source document, quantity, and actor/operation identity.
- If FIFO is the approved costing method, layer quantities remain within original bounds and every consumption is traceable to its source layer.
- Reversals are linked to the original event and do not rewrite historical facts silently.

## Idempotency and audit

- Duplicate operation identifiers are rejected or return the prior result safely.
- Audit events are append-only where feasible and contain no secrets.
- Uniqueness rules and retention periods are compatible with retries and reversals.

## Operational integrity

- Closed-period rules are enforced at the write boundary, not merely by hiding UI buttons.
- Backup/migration operations are serialized appropriately.
- Integrity checks are run after restore and destructive migrations.

For each invariant, record its enforcement layer (domain, main process, database, tests) and a regression test. If no enforcement exists, classify it as a gap; do not imply it is protected.
