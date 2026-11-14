# Veloria threat-model checklist

## Assets
- Customer and supplier identity/contact data.
- Invoices, payments, debts, inventory, and accounting records.
- License state and capability catalog.
- Signing keys, API credentials, and update verification keys.
- Backups, exports, logs, and support bundles.

## Trust boundaries
- Renderer ↔ preload ↔ main process.
- Main process ↔ SQLite/filesystem/native devices.
- POS ↔ bridge service ↔ Google Sheets.
- Customer app ↔ trusted API/identity service.
- Vendor License Manager ↔ signed license artifact ↔ customer POS.
- Build system ↔ signing environment ↔ release artifact ↔ updater.

## Abuse-case prompts
- Can an untrusted renderer call a privileged channel with forged data?
- Can an imported file escape its allowed directory or exhaust memory/disk?
- Can the same payment/return/stock adjustment be replayed?
- Can one customer request another customer's records?
- Can a modified or unsigned update be installed?
- Can logs or a support archive expose secrets or financial data?
- Can deleting one local state file bypass license checks or destroy data?
- Can a database restore/migration leave records inconsistent?

## Evidence
- Negative tests for authorization and validation.
- Secret scans over repository and release artifacts.
- Dependency and build provenance report.
- Artifact signature/hash verification.
- Data isolation tests for customer endpoints.
- Restore and integrity tests for protected data.
