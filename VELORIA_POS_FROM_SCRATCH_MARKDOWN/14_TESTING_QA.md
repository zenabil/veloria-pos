# 14 — Testing & QA

## Test pyramid

```text
many unit tests
      ↓
fewer integration tests
      ↓
critical end-to-end tests
      ↓
small number of hardware/manual validation tests
```

## Unit tests

Cover:

- Money
- rounding
- discount rules
- sale totals
- debt calculation
- stock movement rules
- return rules
- payment allocation
- invoice numbering
- zakat calculations
- date boundaries

## Repository integration tests

Use a temporary SQLite database.

Test:

- migrations
- foreign keys
- indexes where performance matters
- CRUD
- transactions
- rollback
- concurrent read/write behavior as applicable
- integrity checks

## Critical atomicity tests

### Sale

Force failures after each stage:

1. sale insert
2. item insert
3. payment insert
4. stock movement
5. customer balance update
6. audit log

Expected result: no partial financial state.

### Stock intake

Failure in any child insert must roll back the entire intake.

### Return

Failure after stock change must roll back the refund/credit and stock update.

## Electron tests

Test:

- single-instance behavior
- window lifecycle
- preload API shape
- denied unsafe APIs
- IPC validation
- database startup
- printer command handling
- backup command handling
- crash recovery

## E2E critical flows

### First run

```text
Install
→ Launch
→ Create/open DB
→ Company profile
→ Add product
→ Add customer
```

### Sale

```text
Search/scan
→ Add product
→ Set customer
→ Pay
→ Commit
→ Verify stock
→ Verify payment
→ Verify balance
→ Print
```

### Credit

```text
Sale on credit
→ Verify customer balance
→ Record payment
→ Verify reduced balance
```

### Return

```text
Open sale
→ Return item
→ Restock
→ Refund/credit
→ Verify balances
```

### Recovery

```text
Create backup
→ Modify database
→ Restore backup
→ Verify exact expected state
```

## Performance tests

Generate realistic data:

- 10k products
- 10k customers
- 100k sales
- 300k+ sale items
- large stock ledger

Measure:

- startup
- product search
- customer search
- sale commit
- history paging
- dashboard
- reports
- backup

## Release quality gates

A release cannot ship if:

- typecheck fails
- lint fails on blocking rules
- critical tests fail
- migration tests fail
- database integrity fails
- packaging fails
- runtime smoke test fails
- critical security check fails
