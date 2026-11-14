---
name: veloria-gates
description: "Design and run trustworthy Veloria quality gates, tests, static checks, security checks, regression suites, and release acceptance evidence; reject empty, mocked, or misleading success signals."
---

# Veloria Gates — evidence-based quality assurance

## Mission

Prevent defects from being declared fixed without evidence. A quality gate must inspect the actual artifact or behavior it claims to protect.

## Gate design principles

- Every gate has a clear invariant, scope, input, command, expected result, failure mode, and owner.
- A test must fail when the protected behavior is deliberately broken. Prefer mutation testing or a controlled negative test for critical gates.
- Avoid vacuous success: zero discovered tests, skipped assertions, empty file sets, swallowed errors, or mocked-out core behavior must not count as a pass.
- Report test count, skipped/pending tests, coverage scope, and important untested boundaries.
- Separate static validation, unit tests, integration tests, database tests, E2E tests, build verification, and manual hardware checks.
- Do not inflate coverage numbers by testing implementation details that do not prove user-visible or business-critical behavior.

## Required quality layers

1. Formatting and lint.
2. Type checking across every shipped target.
3. Domain unit tests, including boundaries and property tests where appropriate.
4. Repository/database integration tests, including rollback and duplicate retries.
5. IPC security/contract tests.
6. Renderer component and accessibility checks.
7. Electron E2E using the packaged/built runtime for changed critical paths.
8. Migration/backup/restore verification when data changes.
9. Packaging integrity and native-module ABI verification when shipping changes.
10. Security/dependency/secrets checks appropriate to the release risk.

## Evidence rules

- Capture actual command, exit status, and concise output summary.
- Do not turn timeouts into passes. Retry only when the cause is understood and the retry is meaningful.
- A failed test may not be deleted, weakened, skipped, or made conditional merely to obtain green status.
- If a test is flaky, isolate and document the flake, then repair it without reducing coverage of the intended invariant.
- A test that mocks the database, IPC, printer, or updater cannot be cited as proof of the real integration boundary.
- Do not claim 100% security or absence of vulnerabilities based only on automated tests.

## Risk-based acceptance

Classify findings as Blocker, Critical, High, Medium, Low, or Informational, using the repository's established scheme if one exists. Tie each severity to exploitability, impact, exposure, and evidence. Do not invent numeric scores when the scoring model is undefined.

## Completion status

Use only:

- `PASS`: command ran and succeeded against the intended target.
- `FAIL`: command ran and found a failure.
- `NOT RUN`: command was not run.
- `BLOCKED`: command could not run for a documented environmental reason.
- `MANUAL VALIDATION REQUIRED`: real hardware or external behavior still needs verification.

## Reference

- `references/gate-design.md`
