---
name: veloria-slice
description: "Implement Veloria features end-to-end across UI, domain/use cases, repositories, IPC, database migrations, documentation, and tests with controlled scope and traceable acceptance criteria."
---

# Veloria Slice — complete vertical feature implementation

## Mission

A feature is complete only when its user workflow, business rules, persistence, trust boundaries, error behavior, and tests work together. Do not create a visual-only mock or a backend-only partial implementation unless the user explicitly requests a prototype.

## Discover before designing

Inspect the existing architecture, naming patterns, feature boundaries, dependency directions, domain logic, IPC contracts, database repositories, shared components, tests, and documentation. Reuse existing patterns when sound. Do not force a preselected folder structure onto the repository.

## Slice workflow

### 1. Define the contract

Write the user outcome, actors, permissions, states, validation rules, edge cases, non-goals, and acceptance criteria. Identify whether the feature affects existing records or only new records.

### 2. Trace data and trust boundaries

Map: UI input → typed bridge/API → trusted main/application use case → domain policy → repository/transaction → SQLite → result mapping → UI feedback. Identify every untrusted value and every authoritative source.

### 3. Domain first

Implement pure business rules where practical. Define monetary/quantity/time rules explicitly. Keep framework, Electron, filesystem, and database dependencies out of pure domain logic.

### 4. Persistence and transaction

Use the existing repository pattern. Re-read mutable facts inside the transaction. Add a new migration only when required. Make multi-row mutations atomic and retry-safe.

### 5. IPC/application contract

Add the narrowest explicit channel/API with runtime request and response schemas. Check sender, authorization, and license/capability gates where applicable. Never expose arbitrary SQL or generic privileged calls.

### 6. UI

Create the complete user journey, including loading, empty, success, validation, conflict, offline, and failure states. Preserve French-only POS language and DZD rules. Reuse the approved design system.

### 7. Tests

Add tests at the lowest useful level and at the integration boundary. Cover success, invalid input, failure rollback, retries, concurrency, permission denial, and regressions. Add E2E only where it proves a real user workflow that unit/integration tests cannot.

### 8. Documentation and impact

Update contract docs, ADRs, metrics, help text, release notes, or migration notes when affected. Use `governance/CHANGE_IMPACT_MATRIX.md` to identify dependent modules.

### 9. Review and handoff

Inspect the full diff, remove dead code introduced by the change, run targeted and full required gates, and provide evidence. Do not expand scope into unrelated cleanup.

## Definition of done

- [ ] Acceptance criteria are mapped to tests or explicit manual verification.
- [ ] UI, domain, persistence, and IPC are integrated where applicable.
- [ ] Trusted layer revalidates all business-critical values.
- [ ] Data mutation is atomic and idempotent where needed.
- [ ] Errors are safe, actionable, and traceable.
- [ ] Regression tests prove the prior defect cannot recur.
- [ ] Documentation/ADR is updated where behavior or architecture changed.
- [ ] Build/test results and any gaps are reported honestly.

## Reference

- `references/vertical-slice-checklist.md`
