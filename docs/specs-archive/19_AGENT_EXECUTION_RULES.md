# 19 — Agent Execution Rules

This document is intended to control an AI coding agent or engineering agent implementing the project.

## Rule 1 — Understand before editing

Read the relevant documentation and inspect the current repository before changing code.

## Rule 2 — One source of truth

SQLite is the only authoritative business-data source.

Do not add:

- Dexie
- IndexedDB
- Firebase
- Google Sheets
- hidden JSON persistence
- LocalStorage for business records

## Rule 3 — No generic database broker in UI

Do not expose arbitrary table/query execution to the renderer.

Use explicit application commands and queries.

## Rule 4 — Preserve business intent

The new project must preserve the business capabilities found in the V108 source unless they are explicitly outside the defined scope.

## Rule 5 — Remove legacy complexity

Do not copy remote-sync tables or cloud conflict logic into the new local-only architecture.

## Rule 6 — Never delete without proof

Before removing code:

1. search references
2. check dynamic imports/configuration
3. check tests/scripts
4. confirm runtime behavior
5. document the removal

## Rule 7 — Prefer vertical slices

Implement complete slices:

```text
UI
→ application command
→ domain rules
→ repository
→ migration
→ test
```

## Rule 8 — Financial changes are critical

Any financial change must include:

- deterministic arithmetic
- transaction boundary
- tests for success/failure
- auditability

## Rule 9 — Build after structural changes

After significant changes run at least:

```text
format/lint
→ typecheck
→ unit tests
→ integration tests
→ production build
```

## Rule 10 — Native module discipline

Whenever Electron or `better-sqlite3` changes, verify:

- target Electron version
- native ABI compatibility
- packaged runtime load

## Rule 11 — UI quality is functional quality

A button that renders but does not work is a bug. A dialog without a title/focus/error state is incomplete.

## Rule 12 — No fake completion

Do not mark a feature complete because:

- the build passes
- the screen renders
- a mock returns data

The real persistence path and real workflow must work.

## Rule 13 — Record decisions

Significant architecture decisions belong in an ADR or architecture note.

## Rule 14 — Keep the codebase understandable

Prefer fewer concepts and clearer boundaries over clever abstractions.

## Rule 15 — Final audit

Before release, verify the project against every requirement in `18_ACCEPTANCE_CRITERIA.md` and produce an audit report.
