# 17 — From-Scratch Implementation Plan

## Phase 0 — Repository bootstrap

Create:

- package manifest
- TypeScript config
- lint/format config
- test config
- Electron builder config
- directory structure
- docs

## Phase 1 — Desktop shell

Implement:

- Electron main
- preload
- secure IPC registry
- window manager
- app lifecycle
- production static asset serving
- logging
- single-instance lock

Acceptance: shell launches and shuts down cleanly.

## Phase 2 — SQLite core

Implement:

- path service
- connection service
- pragmas
- migration runner
- schema versioning
- transaction abstraction
- integrity checks

Acceptance: clean machine creates `Veloria POS DB.sqlite` and opens it correctly.

## Phase 3 — Domain primitives

Implement:

- Money
- Quantity
- dates
- validation
- product rules
- sale rules
- debt rules
- stock rules
- returns rules

Acceptance: high-confidence domain tests pass.

## Phase 4 — Catalog and customers

Implement:

- products
- barcodes
- categories
- customers
- suppliers
- CRUD/search/import

Acceptance: full local CRUD and search with persistence.

## Phase 5 — Sales core

Implement:

- cart
- pricing
- discounts
- invoice sequence
- sale transaction
- payments
- stock decrement
- customer debt

Acceptance: complete sale workflow is atomic and restart-safe.

## Phase 6 — Stock and purchasing

Implement:

- stock intake
- supplier balance
- stock ledger
- adjustment
- valuation
- low-stock alerts

## Phase 7 — Returns and proformas

Implement and test all reversal paths.

## Phase 8 — Finance and reports

Implement:

- expenses
- dashboards
- daily closing
- reports
- customer statements
- supplier statements
- zakat calculations

## Phase 9 — Bread module

Implement bread workflows without tying them to remote sync.

## Phase 10 — Printing and hardware

Implement adapters:

- Windows printer
- thermal receipt
- A4 invoice
- barcode scanner
- cash drawer
- scale port

## Phase 11 — Backup and recovery

Implement safe backup, validation, restore, relocation, startup recovery.

## Phase 12 — UI polish

Audit every screen for:

- spacing
- layout
- overflow
- keyboard navigation
- loading/error/empty states
- French-only text
- consistent dialogs

## Phase 13 — Performance hardening

Benchmark realistic datasets and fix measured bottlenecks.

## Phase 14 — Release hardening

- native rebuild
- CI
- clean machine installation
- smoke tests
- artifact verification
- checksums
- release notes

## Migration strategy from V108

The from-scratch product should not import the V108 schema automatically unless a migration tool is explicitly commissioned.

If legacy data migration is needed later, build a dedicated one-time importer that:

1. reads legacy V108 data read-only
2. maps entities into the new schema
3. validates totals/balances
4. writes into a fresh new database
5. produces a reconciliation report
6. never mutates the original database
