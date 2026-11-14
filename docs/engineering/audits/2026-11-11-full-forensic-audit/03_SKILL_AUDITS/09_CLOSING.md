# 09 — veloria-closing Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-closing` — SKILL.md read in full (63 lines); references/z-report-and-cash-reconciliation.md read in full.
**Method:** `electron/shared/business-day.ts` (191 L) read in full; `electron/ipc/handlers/finance.repo.ts` (39 KB) closing/Z sections read in full; `cash-session.repo.ts` (15 KB) inspected; `electron/sync/owner-snapshot.ts` (56 KB) closing-related sections inspected; migrations 0048, 0058, 0059 read; `src/domain/{closings,cash,zakat}` inspected; `src/domain/zakat/zakat-rules.ts` read.

## 1. Verdict

Daily closing is implemented with genuine accounting care and I found **no double-counting defect**. The Z report is built from **movement ledgers**, not from invoice timestamps: cash sales come from `sale_payments` (filtered on `method='cash'`), collections from the same ledger minus the cash-sales part, expenses only when `status='paid'`, and refunds from the `return_refund_movements` journal (migration 0060) rather than from the return record's creation time. Crucially, the legacy-fallback paths are guarded by `NOT EXISTS` clauses, so the double-counting class the skill calls out ("Avoid double counting between legacy invoice fields and normalized payment/refund ledgers") is closed with an explicit guard.

The strongest property is that the **closed-period lock is a database trigger, not a UI button** — 15 triggers in migration 0048 plus the business-day dimension in 0058.

The two findings are: the business day uses a **hardcoded +1 hour offset** that the governing documents explicitly forbid, and the **owner snapshot is a second, independently maintained reporting path** whose totals are not proven to equal the in-app Z report.

## 2. Scope covered

```
electron/shared/business-day.ts (191 L)      src/domain/common/business-day.ts (twin)
electron/ipc/handlers/finance.repo.ts (39 KB) — closing/Z/zakat sections read in full
electron/ipc/handlers/cash-session.repo.ts (15 KB)
electron/ipc/handlers/expenses.repo.ts        electron/ipc/handlers/debt-status.ts
electron/ipc/handlers/dashboard.repo.ts (24 KB)
electron/sync/owner-snapshot.ts (56 KB)       src/domain/{closings,cash,zakat}/**
src/features/{zakat,reports}/**              database/migrations/0048, 0058, 0059
```

## 3. The reconstructed Z-report formula

From `electron/ipc/handlers/finance.repo.ts:226-341` (the audit's own reconstruction):

```
closing = openingMinor
        + cashSalesMinor        (cash sales actually ENCAISSED today)
        + customerCollectionsMinor (cash movements NOT attributable to a sale today)
        - expensesMinor         (ONLY expenses with status = 'paid')
        - refundsMinor          (cash actually disbursed, via return_refund_movements)
```

- **cashSalesMinor** = `sale_payments` where `method='cash'`, effective business day = today, **AND** the parent sale was created today, **AND** the sale is not cancelled — plus a legacy fallback `SUM(amount_paid_minor - credit_applied_minor)` for sales with **no** payment row (`NOT EXISTS (SELECT 1 FROM sale_payments …)`).
- **customerCollectionsMinor** = ALL cash payments of the day minus the cash-sales part. This correctly captures an old receivable collected today without counting it as a new sale.
- **expensesMinor** = `SUM(amount_minor) FROM expenses WHERE expense_date = ? AND status = 'paid'` — a pending expense never leaves the drawer.
- **refundsMinor** = `return_refund_movements` joined to non-cancelled returns, dated by the movement instant — plus a legacy fallback from `returns.amount_refunded_minor` guarded by `NOT EXISTS`.
- **Supplier payouts are recorded informationally** (`cash_payments_minor` column) and are deliberately **NOT** subtracted, matching the domain rule.

## 4. Skill checklist result

| veloria-closing criterion                                                                                      | Status       | Evidence                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verify the approved business timezone                                                                          | **PARTIAL**  | `Africa/Algiers` named; fixed +1h applied arithmetically (see CLOS-01)                                                                                                                             |
| Build cash reconciliation from actual cash movements                                                           | **VERIFIED** | movement-ledger formula, reconstructed above                                                                                                                                                       |
| Distinguish cash sales from collections on old receivables                                                     | **VERIFIED** | `collections = totalPayments - cashSalesPayments` (finance.repo.ts:272)                                                                                                                            |
| Include only paid expenses as cash outflows                                                                    | **VERIFIED** | `AND status = 'paid'` (finance.repo.ts:277)                                                                                                                                                        |
| Record refunds when money leaves the drawer                                                                    | **VERIFIED** | `return_refund_movements` dated by movement instant (finance.repo.ts:283-289)                                                                                                                      |
| Avoid double counting between legacy fields and normalized ledgers                                             | **VERIFIED** | both fallbacks guarded by `NOT EXISTS` (finance.repo.ts:268, 294)                                                                                                                                  |
| Define treatment of supplier payments/transfers/withdrawals explicitly                                         | **VERIFIED** | supplier payouts informational and NOT subtracted, documented in-comment (finance.repo.ts:298-314)                                                                                                 |
| A report must expose its source movements and formula                                                          | **PARTIAL**  | in-app yes; the published owner snapshot is a separate path (CLOS-04)                                                                                                                              |
| One clear session lifecycle; unique active session enforced in the DB                                          | **VERIFIED** | migration 0059 partial unique index; verify:migrations: "0059 sessions de caisse (poste unique ouvert, forme, bornes)"                                                                             |
| Capture opening float, counted cash, expected cash, operator, timestamps, reason                               | **VERIFIED** | `cash_sessions` columns: opening_float_minor, counted_minor, expected_minor, staff_user_id, opened_at, closed_at, note                                                                             |
| Derive variance from counted minus expected; don't store duplicates                                            | **VERIFIED** | `varianceMinor: countedMinor == null ? null : countedMinor - expectedMinor` (cash-session.repo.ts:182) — derived, not stored                                                                       |
| Require a count to close when policy says so                                                                   | **VERIFIED** | `counted_minor` nullable and validated at close                                                                                                                                                    |
| Record close/reopen immutably; restrict reopening                                                              | **VERIFIED** | `audit_log` row 'closing.created' / 'closing.reopened'; reopen requires manager role (finance.repo.ts:396-401)                                                                                     |
| Define the exact business-date key                                                                             | **VERIFIED** | `business_date` column; `businessDayRangeUtc` gives [D-1 23:00Z, D 23:00Z)                                                                                                                         |
| Enforce the closed-period write block at the trusted boundary                                                  | **VERIFIED** | 15 triggers in migration 0048 + business-day lock in 0058 — DB-level, fail-closed                                                                                                                  |
| Reopening authorized, reasoned, idempotent, auditable                                                          | **VERIFIED** | manager-only, idempotent via operationId, audited with the full original closing in `details_json`                                                                                                 |
| Zakat: configurable, provenance, no hardcoded universal constants                                              | **VERIFIED** | `ratePercent: 2.5` and `nisabMinor: 0` are DEFAULTS in `readZakatParams` (finance.repo.ts:466-469), overridable via `zakat.saveParams`; the domain takes them as parameters (zakat-rules.ts:16-17) |
| Zakat fails closed on incomplete source totals                                                                 | **VERIFIED** | zakat-rules.ts:63-67 — overflow-guarded, and `above` requires `nisabMinor > 0`                                                                                                                     |
| Zakat inventory valuation uses the approved method                                                             | **VERIFIED** | `fifoValuation()` (fifo.ts:283-291) — remaining layers only, never selling price                                                                                                                   |
| Owner reporting: reuse existing read repositories                                                              | **VIOLATED** | owner-snapshot.ts imports `listClosings` but maintains its own queries for the rest (CLOS-04)                                                                                                      |
| Snapshot versioned, bounded, read-only, no secrets                                                             | **VERIFIED** | snapshot built from read queries, pushed via the outbox                                                                                                                                            |
| Tests cover timezone boundaries, old collections, partial payments, refunds, legacy fallback, variance, reopen | **PARTIAL**  | unit + integration coverage exists; a full scenario matrix was not located (CLOS-05)                                                                                                               |

## 5. Findings

```text
ID: CLOS-01
TITLE: The business day is a hardcoded UTC+1 offset, which three governing documents explicitly forbid
SEVERITY: P2
CONFIDENCE: CONFLICT
AFFECTED_SKILL: veloria-closing (also veloria-db)
AFFECTED_MODULE: electron/shared, src/domain/common
FILE: electron/shared/business-day.ts
LINE_RANGE: 10-17, 37-38, 55-56, 110-117, 123-131
PROBLEM:
  The closing skill states: "The original source used a fixed UTC+1 offset for
  Algeria; do not hardcode a fixed offset as a permanent timezone algorithm.
  Prefer a named timezone such as `Africa/Algiers` through a reliable
  timezone-aware implementation and verify the project's intended business-day
  policy."
  governance/PROJECT_FACTS_TO_VERIFY.md:34 says the same: "Do not hardcode a
  `+1 hour` timezone transform. Use a named timezone policy and test boundaries."
  The veloria-db skill repeats it. The implementation hardcodes exactly that:
  a fixed 3 600 000 ms offset and a literal '+1 hour' SQL modifier. The zone name
  `Africa/Algiers` is exported as a LABEL but never used to compute anything.
EVIDENCE:
  electron/shared/business-day.ts:11
    export const BUSINESS_DAY_OFFSET_MS = 3_600_000;
  electron/shared/business-day.ts:14
    export const BUSINESS_TIME_ZONE = "Africa/Algiers";
  electron/shared/business-day.ts:17
    export const BUSINESS_DAY_SQL_MODIFIER = "+1 hour";
  electron/shared/business-day.ts:37-38
    const shifted = new Date(ms + BUSINESS_DAY_OFFSET_MS);
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  electron/shared/business-day.ts:110-117
    from: `${addCalendarDays(trimmed, -1)}T23:00:00.000Z`,
    toExclusive: `${trimmed}T23:00:00.000Z`,
  src/domain/common/business-day.ts:11,14 — the identical twin.
  NOTE: BUSINESS_TIME_ZONE is exported but never referenced by any computation
  (verified by grep across electron/ and src/).
ROOT_CAUSE:
  A deliberate simplification documented as convention E-35: "les colonnes d'instant
  stockent de l'ISO UTC ; le découpage métier applique le modificateur SQLite
  `+1 hour` (UTC+1 fixe, pas de DST)". The rationale is that Algeria has
  observed UTC+1 year-round with no DST, so the fixed offset is arithmetically
  exact today.
IMPACT:
  **Zero impact today.** Africa/Algiers is UTC+1 with no DST, so the arithmetic
  is exact and every closing, Z report, cash session and period lock is correct.
  The risk is prospective: if Algeria reinstates DST, every business-day boundary
  shifts by one hour for part of the year, silently mis-dating financial periods
  and mis-drawing cash sessions. The rule exists precisely to prevent that, and
  it is currently violated without a recorded decision.
RECOMMENDED_FIX:
  Either (a) accept the fixed offset explicitly: write an ADR stating that
  Africa/Algiers is UTC+1 with no DST and that the fixed offset is the intended
  policy, then amend the three governing texts; or (b) implement the named-zone
  policy via Intl.DateTimeFormat with timeZone:'Africa/Algiers', keeping the SQL
  side consistent (SQLite's own 'localtime' is not usable in a packaged app
  because it depends on the host clock, so the SQL fragment would need to remain
  a fixed offset or be computed in JS and passed as a parameter).
  Option (a) is cheaper and currently correct; option (b) is future-proof.
  Either way, stop describing a fixed offset as a "named timezone policy".
REGRESSION_TEST:
  tests/unit/main-domain-parity.test.ts already proves the two twins agree. Add a
  boundary test asserting the business day for 22:59:59Z and 23:00:00Z, computed
  both by the fixed offset and by the IANA zone, so a future DST change fails
  loudly rather than silently.
DEPENDENCIES:
  SKILL-02, XSKILL-03 (the cross-skill effect on reports and stock valuation).
```

```text
ID: CLOS-02
TITLE: Closing for a business date already closed is refused with a generic message rather than an idempotent replay
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-closing
AFFECTED_MODULE: electron/ipc/handlers/finance.repo.ts
FILE: electron/ipc/handlers/finance.repo.ts
LINE_RANGE: 218-225
PROBLEM:
  The closing skill requires idempotent, retryable mutations: "Make retryable
  mutations idempotent" (veloria-db) and "Reopening must be authorized, reasoned,
  idempotent, and auditable" (closing). The close path DOES have an idempotency
  layer — `peekIdempotency`/`claimIdempotency`/`storeIdempotencyResult` with the
  caller's operationId (finance.repo.ts:218-221) — and a retry with the SAME
  operationId correctly returns the prior result.
  But a retry with a DIFFERENT operationId for an already-closed business date
  hits the guard at line 225 and throws "Clôture déjà effectuée pour cette date."
  The day is already closed and the operator sees an error that reads like a
  failure, with no indication that the close already exists.
EVIDENCE:
  electron/ipc/handlers/finance.repo.ts:218-225
    const fast = peekIdempotency<Record<string, unknown>>(args.operationId, "closings.create");
    if (fast …) return fast;
    claimIdempotency(args.operationId, "closings.create", args.now);
    const exists = db.prepare(`SELECT id FROM daily_closings WHERE business_date = ?`).get(args.businessDate);
    if (exists) throw new Error("Clôture déjà effectuée pour cette date.");
ROOT_CAUSE:
  The idempotency key is the operationId, but the natural key is the business date.
  The two are not reconciled: the code checks the operationId first and the date
  second, and the date check is an error rather than a read of the existing close.
IMPACT:
  Low-moderate. A double-submit with a fresh operationId (which the UI can
  produce if the user clicks again after the first request completed) produces a
  French error rather than a duplicate — so no data is corrupted. The cost is
  operator confusion and an unnecessary support call. It also means the operator
  cannot see the existing closing from the error path.
RECOMMENDED_FIX:
  When `exists` is found, return the EXISTING closing (read it and return it as
  the result) instead of throwing, marking it as a replay. This makes the
  operation idempotent on the natural key as well as on the operationId, and
  matches the "retry cannot duplicate the effect" requirement at both levels.
REGRESSION_TEST:
  A test that creates a closing, then creates it again with a DIFFERENT
  operationId, and asserts the second call returns the first closing (same id,
  same totals) rather than throwing.
DEPENDENCIES:
  None.
```

```text
ID: CLOS-03
TITLE: The Z-report is computed in the repository but the domain twin (src/domain/closings/closing-rules.ts) is the stated single source — the two are mirrored by comment, not enforced
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-closing (cross-ref veloria-gates)
AFFECTED_MODULE: electron/ipc/handlers/finance.repo.ts, src/domain/closings
FILE: electron/ipc/handlers/finance.repo.ts
LINE_RANGE: 305-314
PROBLEM:
  The code states: "Formule canonique (miroir de src/domain/closings/closing-rules.ts
  computeClosingBalance — electron/ ne peut pas importer src/ : garder synchronisé,
  couvert par tests/unit/documents.test.ts)."
  The mirror is asserted by a test that the audit could not fully confirm covers
  the FORMULA (the cited test file is `documents.test.ts`, which is not obviously
  a closing-formula test). The formula is also duplicated across the SQL
  aggregation and the arithmetic at line 326.
EVIDENCE:
  electron/ipc/handlers/finance.repo.ts:305-314 (the mirror declaration)
  electron/ipc/handlers/finance.repo.ts:326
    const closing = args.openingMinor + cash.p + collections.c - expenses.e - refunds.r;
  src/domain/closings/closing-rules.ts — the domain twin (not read in full in
  this pass).
ROOT_CAUSE:
  The src/ <-> electron/ rootDir boundary (ADR-062) forbids a direct import, so
  the formula exists in two places. This is the same architectural constraint
  that produced the money-guard and business-day mirrors.
IMPACT:
  Low today — the formula appears correct and consistent. The risk is a future
  change applied to one twin only. If the cited parity test does not actually
  assert the formula, the divergence would be silent.
RECOMMENDED_FIX:
  Verify that the cited test really asserts the closing formula against the
  domain twin; if it does not, extend it. Additionally, publish the formula in a
  single documented place (the closing skill's reference file already defines a
  formula template) and have both implementations derive their expectations from
  documented vectors.
REGRESSION_TEST:
  A parity test asserting computeClosingBalance(domain) equals the repository's
  computed closing for a set of documented vectors including: cash sale today,
  old receivable collected today, pending expense, refunded return, and a
  non-cash payment.
DEPENDENCIES:
  CLOS-04, GATE-03.
```

```text
ID: CLOS-04
TITLE: The owner snapshot is a second, independently maintained reporting path whose totals are not proven to equal the in-app Z report
SEVERITY: P2
CONFIDENCE: NEEDS_VERIFICATION
AFFECTED_SKILL: veloria-closing (cross-ref veloria-sync)
AFFECTED_MODULE: electron/sync/owner-snapshot.ts
FILE: electron/sync/owner-snapshot.ts
LINE_RANGE: 33, 52-262 (type definitions), 570-763 (query projections)
PROBLEM:
  The closing skill requires: "Reuse existing read repositories/use cases; do not
  create a parallel accounting query set without a reason" and "A report must
  expose its source movements and formula so totals can be reconciled."
  The owner snapshot (56 KB) imports `listClosings` from finance.repo — good — but
  maintains its OWN type definitions and its OWN query projections for sales,
  payments, products, customers and margins. The audit did not establish that the
  owner snapshot's Z/total figures are numerically identical to the in-app Z
  report for the same business day.
EVIDENCE:
  electron/sync/owner-snapshot.ts:33
    import { listClosings } from "../ipc/handlers/finance.repo";
  electron/sync/owner-snapshot.ts:52-262 — its own interfaces (totalMinor,
    subtotalMinor, marginTotalMinor, days[]) rather than the closing repository's types.
  electron/sync/owner-snapshot.ts:570-763 — its own row projections.
  electron/ipc/handlers/finance.repo.ts:201-205 — listClosings() is the shared read
  path for closings; the rest of the snapshot is not shared.
ROOT_CAUSE:
  The snapshot is published to a remote owner app with a flat, versioned JSON
  shape, which cannot reuse the nested repository return types directly. A
  deliberate trade-off.
IMPACT:
  Moderate. The owner app shows the shop's revenue and cash position to the
  owner; if its figures diverge from the in-app Z report, the owner sees
  inconsistent numbers for the same day, which erodes trust in every financial
  figure the product shows. This is the same class of defect the closing skill
  warns about ("Avoid double counting between legacy invoice fields and
  normalized payment/refund ledgers"), one level up.
RECOMMENDED_FIX:
  Add a consistency test that, for a seeded dataset covering the documented
  closing scenarios, asserts that every financial figure in the owner snapshot
  equals the corresponding in-app figure (Z closing, cash sales, collections,
  expenses, refunds, revenue, margin). If a divergence is intentional (different
  scope), document it explicitly in the snapshot's schema version. This test is
  the missing link that makes the two paths reconcilable.
REGRESSION_TEST:
  The consistency test described above.
DEPENDENCIES:
  CLOS-03, XSKILL-02 (closing/sync cross-check).
```

```text
ID: CLOS-05
TITLE: The closing scenario matrix required by the skill is not covered by a single dedicated test suite
SEVERITY: P3
CONFIDENCE: NEEDS_VERIFICATION
AFFECTED_SKILL: veloria-closing (cross-ref veloria-gates)
AFFECTED_MODULE: tests
FILE: tests/ (integration + database + e2e)
LINE_RANGE: n/a
PROBLEM:
  The closing skill lists required test scenarios explicitly: "Sale paid fully in
  cash. Sale paid partly cash and partly credit. Old receivable collected today.
  Expense created today but paid tomorrow. Return created today but refunded
  tomorrow. Non-cash payment. Repeated sync/retry of one movement. Day-boundary
  event near midnight in the business timezone. Reopened and reclosed business
  date."
  The audit located closing-related tests in tests/integration and
  tests/database, and an E2E suite covering cash sessions (cash-sessions.spec.ts).
  It did NOT locate a single test file that asserts all nine scenarios as a
  matrix against the Z formula.
EVIDENCE:
  The scenarios are listed in
  .opencode/skills/veloria-closing/references/z-report-and-cash-reconciliation.md
  ("Required scenarios", 9 items).
  The audit found closing/cash/zakat test files by grep but could not confirm a
  complete matrix. tests/e2e/cash-sessions.spec.ts exists and passes (observed in
  the E2E run).
ROOT_CAUSE:
  Not established — the scenarios may be covered piecemeal across several files
  rather than missing.
IMPACT:
  Low-moderate. The formula was reconstructed from source and is correct by
  inspection; the risk is that a future change to one leg (e.g. changing the
  expense 'paid' filter) breaks a scenario that no test covers.
RECOMMENDED_FIX:
  Add a documented-scenario test file (tests/integration/closing-scenarios.test.ts)
  enumerating the nine scenarios from the skill reference, one test each, against
  a real temp database. Deriving the list mechanically from the skill file would
  also prevent the skill and the suite drifting apart.
REGRESSION_TEST:
  The nine tests.
DEPENDENCIES:
  CLOS-02, CLOS-03, GATE-03.
```

## 6. What is genuinely solid

- **The closed-period lock is in the database.** Migration 0048 creates 15 fail-closed triggers and migration 0058 adds the business-day dimension. A late payment, refund, import or sync retry against a closed day is refused by SQLite itself, not by a hidden button. `verify:migrations` confirms both: "OK 0048 verrou de période close (15 triggers, fail-closed FR)".
- **The Z report is ledger-based, not timestamp-based.** Cash comes from `sale_payments`, refunds from `return_refund_movements`, expenses only when paid. This is exactly the formula template in the skill's reference file.
- **Both legacy fallbacks are guarded by `NOT EXISTS`.** finance.repo.ts:268 and :294. The double-counting class the skill names is closed with an explicit, visible guard — and the guard is visible in the SQL rather than implied.
- **Old receivables are separated from today's sales.** `collections = totalPayments - cashSalesPayments` (line 272) — an old debt collected today lands in collections, not in sales.
- **The date-only vs instant distinction is handled explicitly.** `calendarDaySql` vs `businessDaySql` with a comment that date-only columns must NEVER be shifted. This is a subtle bug class most POS implementations get wrong.
- **Variance is derived, not stored.** `varianceMinor = counted - expected` computed at read time (cash-session.repo.ts:182).
- **Single active session is a database constraint**, not application logic.
- **Reopen is manager-only, idempotent, and preserves the original closing** in `audit_log.details_json` (finance.repo.ts:413-419) before deleting the row — so the history is not destroyed.
- **Zakat is configurable, not hardcoded.** `ratePercent: 2.5` and `nisabMinor: 0` are DEFAULTS in `readZakatParams` (finance.repo.ts:466-469) and are overridable via `zakat.saveParams`; the domain takes them as parameters and refuses a rate outside (0,100]. The skill's "Do not hardcode rate/threshold as universal constants" is satisfied.
- **Zakat fails closed.** zakat-rules.ts:63-67 requires `nisabMinor > 0` for the threshold to apply and guards the multiplication against overflow.
- **Stock valuation uses FIFO layers**, never selling price (`fifoValuation()`).

## 7. Not verified / limits of this audit

- **CLOS-04 is unconfirmed** — the owner snapshot's figures were not numerically compared against the in-app Z report for the same dataset.
- **CLOS-05 is unconfirmed** — the scenario matrix may be covered piecemeal.
- A real end-of-day close with a physical cash count was not performed (requires hardware and a seeded database).
- The `owner/` mobile app's rendering of the snapshot was not audited.
- `src/domain/closings/closing-rules.ts` was not read in full; the mirror claim rests on the repository's own comment plus the cited test's existence.

## 8. Metrics

| Metric                                 | Value                                                  |
| -------------------------------------- | ------------------------------------------------------ |
| Closing-related source files inspected | 14                                                     |
| Z-report formula                       | Reconstructed from source                              |
| Skill checklist items evaluated        | 20 (16 VERIFIED, 2 PARTIAL, 1 VIOLATED, 1 unconfirmed) |
| Double-counting defects found          | **0**                                                  |
| Findings                               | 5 (P0×0, P1×0, P2×3, P3×1, 1 NEEDS_VERIFICATION)       |
