# 18 — Acceptance Criteria

## Application

- [ ] Windows installer installs cleanly.
- [ ] Application launches without developer tooling.
- [ ] Single-instance behavior works.
- [ ] Window lifecycle is stable.
- [ ] Restart preserves all committed data.

## Database

- [ ] Database name is `veloria POS DB`.
- [ ] Default file is `Veloria POS DB.sqlite`.
- [ ] SQLite is the sole business-data source.
- [ ] WAL enabled.
- [ ] Foreign keys enabled.
- [ ] Migrations are versioned.
- [ ] Integrity checks pass.
- [ ] No Dexie/IndexedDB business persistence.
- [ ] No remote sync dependency.

## Sales

- [ ] Barcode search works.
- [ ] Product search works.
- [ ] Cart quantity changes work.
- [ ] Discount logic is correct.
- [ ] Delivery fee is correct.
- [ ] Full payment works.
- [ ] Partial payment works.
- [ ] Credit sale works.
- [ ] Invoice number is unique.
- [ ] Stock decreases correctly.
- [ ] Customer balance changes correctly.
- [ ] Sale commit is atomic.
- [ ] Sale cancellation reverses the correct state.

## Products

- [ ] CRUD works.
- [ ] Multiple barcodes work.
- [ ] Search is fast.
- [ ] Stock status is correct.
- [ ] Import is validated before commit.

## Customers

- [ ] CRUD works.
- [ ] Statement works.
- [ ] Payment recording works.
- [ ] Debt status works.
- [ ] Credit limit behavior is deterministic.

## Inventory

- [ ] Stock intake works.
- [ ] Damage quantity works.
- [ ] Stock ledger is auditable.
- [ ] Returns/restocking work.
- [ ] Valuation works.

## Finance

- [ ] Expenses work.
- [ ] Period reports work.
- [ ] Daily closing works.
- [ ] Zakat calculation inputs are explicit.

## Printing

- [ ] 80mm receipt renders correctly.
- [ ] Silent printing works when a compatible printer exists.
- [ ] A4 black-and-white invoice renders correctly.
- [ ] Printer errors do not crash the app.

## Backup

- [ ] Manual backup works.
- [ ] Automatic backup works according to configuration.
- [ ] Backup validation works.
- [ ] Restore works.
- [ ] Restore creates a safety snapshot first.
- [ ] Database relocation works.

## Security

- [ ] Renderer has no Node integration.
- [ ] Context isolation enabled.
- [ ] IPC inputs validated.
- [ ] No arbitrary SQL API exposed to renderer.
- [ ] No arbitrary shell/command execution from renderer.

## Quality

- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] Critical E2E flows pass.
- [ ] Production package passes runtime smoke test.
- [ ] No critical dead code or duplicate business logic remains.

## Release verdict

Allowed states:

```text
PRODUCTION READY
PRODUCTION READY WITH MINOR ISSUES
NOT PRODUCTION READY
CRITICAL FAILURE
```

The presence of any unresolved data-integrity, security, installer/runtime, or financial-calculation defect forces `NOT PRODUCTION READY` or `CRITICAL FAILURE`.
