# Changelog

## 2.0.0 — 2026-11-11

### Added
- `veloria-orchestrator` for repository discovery, specialist routing, conflict handling, scope control, and evidence-based handoff.
- Six specialist skills: `veloria-release`, `veloria-backup`, `veloria-printing`, `veloria-security`, `veloria-hardware`, and `veloria-observability`.
- Central project contract, skill registry, project-facts verification register, change-impact matrix, and skill authoring standard.
- ADR, task brief, and release-notes templates.
- Package validator and automated structure/governance tests.

### Changed
- Reworked all ten original skill instructions to be repository-first and avoid unverified paths, migration numbers, table names, capability counts, and commands.
- Reframed synchronization around the approved Google Sheets V1 intermediary while preserving SQLite as the POS source of truth and requiring a trusted customer-level authorization boundary.
- Replaced fixed UTC offset guidance with a named, tested business-timezone policy.
- Strengthened transactional integrity, idempotency, negative tests, backup/restore verification, packaged-runtime checks, and truthful evidence reporting.

### Preserved
- The original uploaded `skills.zip` is included unchanged at `archive/original-skills-v1.zip` for traceability.

### Limitations
- This release validates the skill package itself. It does not claim to have audited, modified, built, or tested the live Veloria application repository.
