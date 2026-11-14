# Change Impact Matrix

Use this matrix during task planning. A check means “consider and verify,” not “always modify.”

| Change in                 | Inspect / test also                                                   | Typical regression risk                         |
| ------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| Money parsing or rounding | sales, returns, debt, reports, invoice/PDF, DB constraints            | one-cent drift, mismatch between layers         |
| Product price/packaging   | sales, quotes/proformas, stock, barcode, history                      | stale cart snapshot, wrong quantity/cost        |
| Stock movement/costing    | sales, returns, receiving, inventory count, COGS, reports             | negative stock, broken FIFO/valuation           |
| Payment/refund            | cash session, Z report, debts, closing, audit                         | double count, cash variance, idempotency        |
| Business date/time        | sales, payments, expenses, returns, close, sync snapshots             | boundary/day mismatch                           |
| SQLite schema/migration   | backup, restore, IPC, repositories, installers, old DB upgrades       | data loss, old-version incompatibility          |
| IPC/preload               | every caller, sender validation, schemas, license gates               | privileged channel exposure, contract drift     |
| UI navigation/feature     | license gates, dependencies, French strings, tests                    | inaccessible or unlicensed page/action          |
| License format/catalog    | License Manager, POS, key rotation, old issued licenses, updater      | legitimate activation breakage                  |
| Sync/outbox               | SQLite ownership, customer isolation, retries, privacy, Sheets quotas | data leak, duplicate rows, POS cloud dependency |
| Printing/PDF              | invoice totals, printer drivers, packaged workers, page dimensions    | clipping, wrong amounts, packaged-only failure  |
| Backup/restore            | SQLite WAL, migration, attachments, encryption, installer             | unrecoverable or inconsistent database          |
| Release/updater           | native modules, signing, migrations, backup, rollback                 | install failure, data loss, unsigned update     |
| Hardware adapter          | UI feedback, duplicate events, transactions, logs                     | repeated sale/print/drawer action               |
| Logging/support bundle    | privacy, disk growth, crash handling, offline behavior                | secret leakage, disk exhaustion                 |
| Dependency/toolchain      | license, native ABI, build reproducibility, security scans            | incompatible binary, supply-chain risk          |

## Minimum planning output

For each relevant row, state `affected`, `not affected with reason`, or `unknown—inspect`. A blank cell is not a decision.
