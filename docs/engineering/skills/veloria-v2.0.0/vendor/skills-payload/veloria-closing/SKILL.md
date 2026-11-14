---
name: veloria-closing
description: "Implement and verify Veloria's daily business closing, cash sessions, Z reports, reconciliations, period locks, owner reporting, and configurable zakat calculations with traceable financial sources."
---

# Veloria Closing — business day, cash control, and reporting

## Mission

Ensure end-of-day reports reconcile with actual money movements, cash sessions, expenses, collections, refunds, and closed-period rules. Avoid counting documents as cash when no cash moved.

## Verify the current contract first

Inspect the approved business timezone, timestamp/date-only conventions, payment ledger, refund ledger, expense states, supplier-payment treatment, session model, close/reopen permissions, and report definitions. The original source used a fixed UTC+1 offset for Algeria; do not hardcode a fixed offset as a permanent timezone algorithm. Prefer a named timezone such as `Africa/Algiers` through a reliable timezone-aware implementation and verify the project's intended business-day policy.

## Cash and Z-report rules

- Build cash reconciliation from actual cash movements, not merely invoice creation timestamps.
- Distinguish cash sales created today from collections on older credit documents.
- Include only paid expenses as cash outflows.
- Record refunds at the time money actually leaves the cash drawer/bank, not automatically at return creation time.
- Avoid double counting between legacy invoice fields and normalized payment/refund ledgers. Any fallback must be guarded by an explicit absence check and regression test.
- Define treatment of supplier payments, transfers, deposits, opening floats, cash withdrawals, and non-cash payments explicitly.
- A report must expose its source movements and formula so totals can be reconciled.

## Cash sessions

- Define one clear session lifecycle and the entity that identifies a cash register/terminal.
- Enforce uniqueness of active sessions in the database when the rule requires it.
- Capture opening float, counted cash, calculated expected cash, operator, timestamps, and close reason.
- Derive variance from counted minus expected; do not store duplicate derived values unless there is a documented snapshot/audit reason.
- Require a count to close when the business policy says so.
- Record close/reopen actions immutably and restrict reopening to the approved role/capability.

## Closed periods

- Define the exact business-date key used for closure.
- Enforce the closed-period write block at the trusted application/database boundary, not only in UI.
- Reopening must be authorized, reasoned, idempotent, and auditable.
- Test late-arriving payments, refunds, imports, sync retries, and timezone boundaries.

## Zakat reporting

- Treat the calculation as a configurable informational tool, not a legal, religious, or personal ruling.
- Expose source balances, included/excluded categories, valuation basis, threshold (nisab), rate, and calculation date.
- Do not hardcode rate/threshold as universal constants; make them explicit configurable inputs with provenance.
- When inventory is included, use the project's approved valuation method and show that basis.
- Fail closed on incomplete or unsafe source totals; never substitute zero for missing data without disclosure.

## Owner reporting and snapshots

- Reuse existing read repositories/use cases; do not create a parallel accounting query set without a reason.
- Keep snapshots versioned, bounded, validated, and read-only for consumers.
- Exclude secrets and unnecessary personal data.
- Make publication opt-in and document the exact data set, cadence, and destination.

## Tests

Cover timezone boundaries, daylight/timezone policy, old-invoice collections, partial payments, paid/unpaid expenses, refund timing, legacy fallback, cash variance, duplicate sessions, close lock, authorized reopen, and owner snapshot corruption.

## Reference

- `references/z-report-and-cash-reconciliation.md`
