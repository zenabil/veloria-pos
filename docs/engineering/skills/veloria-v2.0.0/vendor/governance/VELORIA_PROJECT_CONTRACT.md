# Veloria Project Contract

**Contract version:** 2.0.0  
**Status:** Product-direction baseline compiled from the user's established decisions. It is not a substitute for inspecting the current repository.

## 1. Product identity and operating model

- Product: Veloria POS, a Windows desktop retail point-of-sale application.
- Core mode: Offline-First. Core local POS work must not require an internet connection.
- Current UI language direction: French-only.
- Currency direction: Algerian dinar (DZD).
- Local persistence: SQLite is the intended source of truth for core POS business records.
- The renderer must not directly access SQLite; privileged operations go through the desktop application's controlled main/preload bridge.
- The product is intended to be installable as a Windows desktop application with a native-style experience.

## 2. Technology direction

The established project direction is Electron + React + TypeScript + Tailwind CSS + a shared UI component system + SQLite + electron-builder. Treat this as a baseline to verify against the live manifests and source tree before making version-specific decisions. Do not replace technologies or add major dependencies without a reasoned impact analysis and an approved decision.

## 3. Data and financial invariants

- Local SQLite remains authoritative for POS sales, products, customers, stock, payments, debts, expenses, returns, and reporting.
- Money must use exact integer minor units (the exact DZD scale and numeric bounds must be verified in the project's money policy).
- Business mutations spanning multiple records must be atomic and safely retryable.
- Historical documents and financial movements must remain auditable.
- Backup and recovery are product-critical, not optional maintenance details.

## 4. Ecosystem boundaries

- POS core must remain useful while offline.
- Customer app is an extension, not the authority for POS transactions.
- Google Sheets was approved as the intermediary for the first customer-app bridge. It is a bridge/projection, not the canonical POS database.
- Never expose Google service-account credentials, shared spreadsheet privileges, or unrestricted sheet access in the customer app or renderer.
- A trusted access layer must prove customer-level authorization before customer data is exposed. If isolation cannot be proven, do not ship the customer-data feature.
- License Manager and POS licensing are separate trust domains: vendor signing secrets must never ship inside the customer POS.

## 5. Scope discipline

- Do not reintroduce POS login/account creation, tenant IDs, or role systems that were explicitly removed from the defined POS scope unless the user approves a new product decision.
- Do not resurrect removed modules or legacy page identifiers merely because they appear in old skill files or old license payload descriptions. Verify current product scope and compatibility requirements.
- Do not add the customer app, cloud sync, or remote telemetry to core POS dependencies.
- Do not change the existing logo/brand asset without explicit approval.

## 6. Engineering constraints

- Inspect the live repository before asserting file paths, table names, migration numbers, IPC channel counts, script names, package versions, or supported devices.
- Preserve existing user data and uncommitted changes.
- Use forward-only migrations for shipped databases unless the repository's documented release process explicitly proves a migration has not shipped.
- Validate all untrusted input at trusted boundaries.
- Do not claim tests, security, build, packaging, or hardware verification that did not run.

## 7. Decision management

A change that affects data ownership, offline behavior, synchronization, money representation, stock valuation, licensing, identity/access, security posture, or release/update compatibility requires an ADR using `templates/ADR_TEMPLATE.md`.

## 8. Conflict rule

The user's latest explicit instruction wins. Approved project decisions are next. Existing code and tests describe current behavior and must be inspected, but they do not automatically override approved product direction. Skills are subordinate to this contract.
