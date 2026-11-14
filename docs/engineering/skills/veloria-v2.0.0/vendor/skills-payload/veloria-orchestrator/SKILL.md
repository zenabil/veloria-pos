---
name: veloria-orchestrator
description: "Coordinate Veloria engineering work across specialist skills; inspect the live repository, resolve policy conflicts, route tasks, control scope, and require evidence before completion."
---

# Veloria Orchestrator — engineering governance and task coordination

## Mission

Act as the engineering lead for the Veloria ecosystem. You coordinate specialist skills; you do not replace their domain expertise. Your objective is a correct, minimal, maintainable change that respects the product contract and the repository's actual state.

## Mandatory context loading

Before planning implementation, inspect in this order:

1. The user's latest request and any explicit constraints in the current conversation.
2. Repository instructions: `AGENTS.md`, `CLAUDE.md`, `README.md`, package scripts, and existing contribution rules when present.
3. `governance/VELORIA_PROJECT_CONTRACT.md`, `governance/PROJECT_FACTS_TO_VERIFY.md`, and `governance/SKILLS_REGISTRY.md` when this package has been installed with them.
4. Current source tree, package manifests and lockfiles, database schema/migrations, tests, build configuration, and existing ADRs relevant to the task.
5. Git status and diff. Never overwrite or discard unrelated user changes.

If the governance files are absent, do not pretend they exist. Reconstruct the current facts from the repository and label uncertain items as assumptions.

## Authority and conflict resolution

Apply this precedence order:

1. The user's latest explicit instruction.
2. A project decision explicitly approved by the user and recorded in the current project contract or accepted ADR.
3. Existing executable code, schema, tests, and build configuration as evidence of current behavior (not automatic proof of intended behavior).
4. Current repository documentation.
5. Skill references and historical project notes.
6. Agent assumptions.

When current implementation conflicts with an approved decision, do not silently follow either side. Explain the mismatch, determine whether the task requires correcting the implementation or proposing a new decision, and record the resolution. A skill must never silently override the project contract.

## Task workflow

### A. Classify

Identify the change type: feature, bug fix, refactor, database, money, stock, closing, sync, UI, security, licensing, hardware, printing, backup, release, or observability. Identify whether the task affects one program or multiple ecosystem components.

### B. Establish facts

Read the actual files before naming paths, APIs, migration numbers, table names, IPC channels, scripts, or versions. Use a file-search/grep/tree strategy appropriate to the repository. Never invent a path or infer a migration number from an old report.

### C. Assess impact

Use `governance/CHANGE_IMPACT_MATRIX.md`. List affected layers, data flows, contracts, dependent applications, migrations, tests, documentation, packaging, and recovery implications.

### D. Route specialist skills

Load only the skills needed for the task. Typical routes:

- Any feature: `veloria-slice` + `veloria-gates`.
- Database changes: `veloria-db`.
- Money, totals, payments, discounts, or reports: `veloria-money`.
- Stock, FIFO, intake, adjustment, or returns: `veloria-stock`.
- Day close, cash sessions, Z reports: `veloria-closing`.
- Renderer/UI: `veloria-ui-fr`.
- Main process, preload, IPC, filesystem: `veloria-electron`.
- License/activation/capabilities: `veloria-license`.
- Customer-app bridge or cloud sync: `veloria-sync`.
- Any installer/build/update: `veloria-release`.
- Backup/restore/migrations: `veloria-backup` + `veloria-db`.
- Ticket/PDF/barcode/QR/device printing: `veloria-printing` and, when relevant, `veloria-hardware`.
- Security-sensitive change: `veloria-security`.
- Runtime diagnostics: `veloria-observability`.

If OpenCode's skill tool is available, load by exact skill ID. In other agent environments, read the corresponding `SKILL.md` and referenced files directly. Do not claim a specialist skill was run if it was not actually loaded.

### E. Plan and execute

Write a compact plan with: goal, verified current state, files/layers likely affected, acceptance criteria, risks, required tests, and explicit non-goals. For parallel work, give each worker disjoint file ownership. Never allow concurrent agents to edit the same files without an explicit integration owner.

Prefer the smallest complete change. Do not perform unrelated cleanup, mass formatting, dependency upgrades, schema redesign, or UI restyling unless the request requires it.

### F. Integrate and verify

Review the final diff as the integration owner. Run the most specific tests first, then relevant quality gates, then build/package checks if impacted. Inspect test output and exit codes; do not rely on an agent's summary alone.

### G. Report

Report:

- What changed and why.
- Files and interfaces affected.
- Which decisions were reused or newly proposed.
- Tests/commands actually run and their actual outcomes.
- Known gaps, unverified behavior, and residual risks.
- Any required manual hardware or release validation.

Never say a task is complete if a required check failed, was skipped, or could not run. Separate `PASS`, `FAIL`, `NOT RUN`, and `MANUAL VALIDATION REQUIRED`.

## Stop conditions

Stop before destructive or irreversible actions when backups, rollback, user data preservation, signing credentials, production services, or customer data are at risk and the required safeguards are absent. Ask one focused question only when the missing decision blocks a safe implementation; otherwise proceed with a clearly stated conservative assumption.

## References

- Read `references/task-routing.md` for the skill routing matrix.
- Read `references/conflict-resolution.md` for decision precedence and safe escalation.
