# AGENTS.md — Veloria PoS Contributor Rules

1. SQLite (`Veloria POS DB.sqlite`) is the ONLY business source of truth. No Dexie/IndexedDB/Firebase/Sheets/LocalStorage for business data.
2. Renderer never imports Electron/Node/SQLite. Only `window.veloria` typed bridge.
3. No generic `run-sql` IPC. Add explicit `domain.action` channels + Zod validators.
4. Money = integer centimes (DZD). All sale/payment/stock/customer mutations are atomic (one transaction) with idempotency `operationId`.
5. Domain is framework-free. Use cases are explicit + testable. Repositories use prepared statements.
6. French-only UI. No raw exceptions to users; map to FR messages + log technical details.
7. Vertical slices: UI → use case → domain → repo → migration → test.
8. After structural changes: format → typecheck → tests → build.
9. Native modules: document Electron target; verify packaged runtime loads better-sqlite3.
10. Record significant decisions in `docs/ADR-*.md`; phase progress in `PHASE_X_REPORT.md`.
11. Migrations are IMMUTABLE once applied to any database: never edit `database/migrations/*.sql` in place (checksum guard refuses to open drifted databases). Every schema change is a NEW numbered migration + `verify-migrations` green.
