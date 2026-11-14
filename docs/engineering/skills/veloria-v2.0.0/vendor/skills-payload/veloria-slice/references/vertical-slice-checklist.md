# Vertical-slice review checklist

## Product and scope
- [ ] User outcome and acceptance criteria are explicit.
- [ ] Existing workflow and data compatibility are understood.
- [ ] Non-goals and out-of-scope modules are explicit.

## Architecture
- [ ] Existing project boundaries are respected.
- [ ] No circular dependency or cross-feature shortcut was introduced.
- [ ] Domain rules are testable without UI where practical.

## Data and security
- [ ] Input validated at UI and trusted write boundary.
- [ ] Permissions/license checked in trusted code.
- [ ] Transaction and idempotency strategy defined.
- [ ] Migration is forward-safe and tested when needed.

## UX and failures
- [ ] Loading, empty, success, invalid, offline, conflict, and error states handled.
- [ ] Double submission and recoverable retries are safe.
- [ ] French wording and DZD formatting are consistent.

## Verification
- [ ] Tests cover behavior and failure paths.
- [ ] Tests can fail when the behavior is broken.
- [ ] Related module tests/builds pass.
- [ ] Diff contains no unrelated edits.
- [ ] Evidence and remaining gaps are documented.
