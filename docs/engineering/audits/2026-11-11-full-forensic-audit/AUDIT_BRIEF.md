# Forensic Audit Brief — Veloria Ecosystem

**Audit ID:** `2026-11-11-full-forensic-audit`
**Root:** `C:\Users\Admin\Desktop\Veloria POS dev zenagui bilal`
**Mode:** READ-ONLY forensic audit. Report findings only.

## Hard rules (non-negotiable)

1. **Do NOT modify any application file.** No edits, no fixes, no refactors, no deletions, no new source files, no dependency installs, no git commands that mutate state (git is not even installed on this machine). The ONLY files you may create are your own audit report file(s) under `docs/engineering/audits/2026-11-11-full-forensic-audit/`.
2. **Do NOT run migrations against any real database.** The real DB is `Veloria POS DB.sqlite` at the repo root. Never open it with write access. If you need a scratch DB, use a temp dir outside the repo (`C:\Users\Admin\AppData\Local\Temp\opencode\...`) and state that you did.
3. **Zero fabrication.** Every finding MUST cite a real file path and real line numbers that you actually read. If you did not verify it, say `NEEDS_VERIFICATION`.
4. **Do NOT judge UI visuals from JSX alone** — do not claim a visual defect unless you can point to the code path that causes it.
5. **Do NOT claim a test passes** unless you ran it and read the exit code.
6. Preserve all user data and uncommitted changes.

## Facts already established (do not re-derive, but you may verify)

- Product: Veloria PoS v1.0.4, Electron 45.1.0 + React 19.3.1 + TS 6.0.3 + Vite 8.3.5 + Tailwind 4.3.3 + better-sqlite3 13.0.3 + zod 4.6.7. Node v22.23.4, npm 10.9.9.
- Migrations: `database/migrations/` — 63 files, `0001_initial_schema.sql` .. `0063_client_orders.sql`. Lock file `database/migrations.lock.json`.
- IPC channels: `electron/ipc/channels.ts` — single `IPC_CHANNELS` const object.
- Layering: `src/domain` (38 files), `src/application` (4), `src/features` (123), `src/shared` (32), `electron/` (~120), `src/app` (11).
- Tests: `tests/unit` 140, `tests/integration` 53, `tests/database` 10, `tests/e2e` 27.
- Other apps: `mobile/` (client APK, Expo), `owner/` (owner supervision app), `license-manager/` (vendor app), `cloud/supabase`, `website/`.
- Branch `feat/client-orders`, HEAD `d9e992b369dbe98406836cbbb6da8b02bb9409ce`. Git binary NOT installed → git status is BLOCKED.

## Authoritative references (read as needed)

- `governance/VELORIA_PROJECT_CONTRACT.md` — product contract (authority level 2).
- `governance/PROJECT_FACTS_TO_VERIFY.md` — facts you must verify, not assume.
- `AGENTS.md` — contributor rules 1–16.
- `docs/ADR-*.md` (182 ADRs) — accepted decisions.
- `docs/METRICS.md` — generated counters (single source of truth).

## Skill to load

Load your matching Veloria skill with the skill tool BEFORE auditing (e.g. `veloria-db`, `veloria-money`, …). Read its `SKILL.md` and any `references/` it names. The skill defines your acceptance criteria — an audit that ignores the skill's own checklist is incomplete.

## Finding format (use exactly this block per finding)

```text
ID: <PREFIX>-<n>
TITLE: <one line>
SEVERITY: P0 | P1 | P2 | P3 | INFO
CONFIDENCE: VERIFIED | UNVERIFIED | ASSUMED | CONFLICT | NOT_APPLICABLE | NOT_FOUND | BLOCKED
AFFECTED_SKILL: veloria-xxx
AFFECTED_MODULE: <module path>
FILE: <path>
LINE_RANGE: <n-m>
PROBLEM: <what is wrong>
EVIDENCE: <the actual code/SQL/config excerpt, verbatim, with line numbers>
ROOT_CAUSE: <why it exists>
IMPACT: <concrete consequence>
REPRODUCTION: <how to reproduce, or "NOT REPRODUCIBLE — static proof">
RECOMMENDED_FIX: <specific change, no code implementation>
REGRESSION_TEST: <the test that would prove the fix>
DEPENDENCIES: <other findings/areas this depends on or blocks>
```

Severity definitions (use these, do not invent others):

- **P0 Critical** — threatens user data integrity, money integrity, security, or makes core function unsafe.
- **P1 High** — likely data loss, accounting corruption, core function failure, or distribution failure.
- **P2 Medium** — impairs specific features, compatibility, UX, or reliability.
- **P3 Low** — limited issue / quality improvement, no direct threat to core function.
- **INFO** — observation / improvement, not a defect.

Never report the same underlying defect twice across reports. If it belongs to another skill, list it as `DEPENDENCIES` and mark it as cross-referenced rather than duplicating the analysis.

## Report structure required in your file

```markdown
# <Skill> Forensic Audit

**Skill loaded:** <id> (SKILL.md read: yes/no; references read: list)
**Audit ID:** 2026-11-11-full-forensic-audit
**Scope covered:** <paths actually inspected>
**Method:** <what you did — commands run, files read, counts>

## 1. Verdict

<one honest paragraph: is this area sound, partially sound, or unsound? What is the single most important thing?>

## 2. Skill checklist result

<the skill's own acceptance checklist, item by item: VERIFIED / VIOLATED / NOT_FOUND / NEEDS_VERIFICATION, with evidence pointer>

## 3. Findings

<the finding blocks>

## 4. What is genuinely solid

<be specific, with file:line — this matters as much as the findings>

## 5. Not verified / limits of this audit

<explicitly what you could not check and why>

## 6. Metrics

<counts: files read, findings by severity, checklist items passed/violated>
```

Be adversarial but fair. Do not manufacture findings to fill a quota, and do not soften real ones. If an area is genuinely well-built, say so with proof.
