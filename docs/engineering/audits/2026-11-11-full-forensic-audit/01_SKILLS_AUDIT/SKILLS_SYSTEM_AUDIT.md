# 01 — SKILLS SYSTEM AUDIT (Veloria Engineering Skills v2.0.0)

**Audit ID:** `2026-11-11-full-forensic-audit`
**Scope:** `.opencode/skills/**` (17 skills, 17 SKILL.md + 17 reference files), `.opencode/agents/**` (5), `.opencode/commands/**` (5), `governance/SKILLS_REGISTRY.md`, `governance/SKILL_AUTHORING_STANDARD.md`, `docs/engineering/skills/veloria-v2.0.0/`.

**Method:** every `SKILL.md` and every `references/*.md` was read in full. Loadability was confirmed via the OpenCode skill tool (successful invocation returns the skill body and a `skill_files` list). The `npm run verify:docs` gate was executed and inspected. Each skill's claims were cross-checked against live code.

---

## 1. Verdict

The skills system is **substantially sound and genuinely useful** — considerably better than the "instruction-only" failure mode the audit brief warned about. All 17 skills load, all declare a valid Agent-Skills front-matter, all reference files exist and resolve, and the routing table in `AGENTS.md` is machine-verified against the filesystem. The system correctly encodes _process_ discipline (evidence before claims, no generic SQL IPC, atomic+idempotent writes, French-only UI, integer money).

However, the system has a **systemic documentation-drift problem** and one **structurally important omission**. Several skills reference concrete numbers, thresholds, and paths that were correct for an earlier snapshot and are now stale or wrong; the skills themselves say to verify, but they pre-seed specific values that an agent may trust. Separately, `veloria-sync` describes a **Google Sheets** architecture that the codebase **does not implement** — the project ships a Supabase mirror instead. This is a live conflict between the skill and the code, and it is the single most consequential skill-level defect found.

**Skill quality overall:** good. **Skill/project alignment:** good on 16/17, contradictory on 1/17 (`veloria-sync`).

---

## 2. Loadability and conformance matrix

| #   | Skill ID              | Loads in OpenCode | SKILL.md read   | References read                            | `name` = folder | desc <= 1024 | Non-empty body | Routed in AGENTS.md | Orchestrator matrix |
| --- | --------------------- | ----------------- | --------------- | ------------------------------------------ | --------------- | ------------ | -------------- | ------------------- | ------------------- |
| 1   | veloria-orchestrator  | ✅                | ✅ full (102 L) | ✅ task-routing.md, conflict-resolution.md | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 2   | veloria-db            | ✅                | ✅ full (92 L)  | ✅ invariants.md, migrations.md            | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 3   | veloria-money         | ✅                | ✅ full (79 L)  | ✅ parity-and-rounding.md                  | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 4   | veloria-stock         | ✅                | ✅ full         | ✅ inventory-and-fifo.md                   | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 5   | veloria-electron      | ✅                | ✅ full (63 L)  | ✅ main-process-security.md                | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 6   | veloria-ui-fr         | ✅                | ✅ full         | ✅ design-system.md                        | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 7   | veloria-slice         | ✅                | ✅ full         | ✅ vertical-slice-checklist.md             | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 8   | veloria-gates         | ✅                | ✅ full (59 L)  | ✅ gate-design.md                          | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 9   | veloria-closing       | ✅                | ✅ full (63 L)  | ✅ z-report-and-cash-reconciliation.md     | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 10  | veloria-license       | ✅                | ✅ full (51 L)  | ✅ license-format-and-operations.md        | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 11  | veloria-sync          | ✅                | ✅ full         | ✅ google-sheets-bridge.md                 | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 12  | veloria-release       | ✅                | ✅ full         | ✅ windows-release-checklist.md            | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 13  | veloria-backup        | ✅                | ✅ full (59 L)  | ✅ backup-restore-runbook.md               | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 14  | veloria-printing      | ✅                | ✅ full         | ✅ print-document-contract.md              | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 15  | veloria-security      | ✅                | ✅ full         | ✅ threat-model-checklist.md               | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 16  | veloria-hardware      | ✅                | ✅ full (52 L)  | ✅ device-adapter-contract.md              | ✅              | ✅           | ✅             | ✅                  | ✅                  |
| 17  | veloria-observability | ✅                | ✅ full         | ✅ diagnostic-policy.md                    | ✅              | ✅           | ✅             | ✅                  | ✅                  |

**Result: 17/17 load, 17/17 conformant to the Agent Skills standard, 17/17 fully read by this audit.**

`npm run verify:docs` output (real run):

```
OK  docs/METRICS.md à jour.
OK  Table de routage : 17 compétence(s) routée(s).
OK  Matrice du coordinateur : 17 compétence(s) couverte(s).
OK  Compétences : 17 conformes (veloria-backup, veloria-closing, veloria-db, veloria-electron,
    veloria-gates, veloria-hardware, veloria-license, veloria-money, veloria-observability,
    veloria-orchestrator, veloria-printing, veloria-release, veloria-security, veloria-slice,
    veloria-stock, veloria-sync, veloria-ui-fr).
DOCS VERIFIED
```

This gate is genuinely load-bearing: it cross-checks the `AGENTS.md` routing table, the orchestrator's task-routing matrix, and the on-disk skill list. A stale entry in any one of the three makes it fail. That directly implements ADR-178.

---

## 3. Per-skill findings

### SKILL-01 — `veloria-sync` describes an architecture the project does not implement

```text
ID: SKILL-01
TITLE: veloria-sync mandates a Google Sheets V1 bridge that the codebase does not implement (Supabase instead)
SEVERITY: P1
CONFIDENCE: CONFLICT
AFFECTED_SKILL: veloria-sync
AFFECTED_MODULE: governance + electron/sync + cloud/
FILE: .opencode/skills/veloria-sync/SKILL.md
LINE_RANGE: 16-24, 43-49
PROBLEM:
  The skill states as an *approved product decision* that "Google Sheets is the approved
  intermediary for the first customer-app bridge". The shipped code implements a Supabase
  mirror with PostgREST + Edge Functions + RLS instead. No Google Sheets code exists anywhere
  in the repository. The skill also says "Do not expose ... unrestricted sheet access", and
  the reference file's "Security gate — release blocker" section is written entirely around
  spreadsheet credentials.
EVIDENCE:
  .opencode/skills/veloria-sync/SKILL.md:19
    "- Google Sheets is the approved intermediary for the first customer-app bridge, not a
     replacement for local SQLite and not the canonical database for POS operations."
  .opencode/skills/veloria-sync/references/google-sheets-bridge.md:1
    "# Google Sheets V1 bridge — constraints and implementation outline"
  grep for sheets.googleapis|spreadsheet|googleapis over electron/, src/, cloud/ -> 0 matches
  cloud/supabase/ contains: schema.sql, rls.sql, activity.sql, catalog.sql, orders.sql,
    owner.sql, functions/client-sync/index.ts (14139 B), functions/client-order/index.ts (10049 B)
  electron/sync/sync.protocol.ts:204
    const isCloud = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl);
  docs/ADR-053-client-mirror-supabase.md:14 (Statut: accepté)
    "Contrainte AGENTS.md n°1 : SQLite seule source métier. Google Sheets rejeté (pas
     d'isolation par client, pas de transactions, quotas)."
ROOT_CAUSE:
  The skill bundle was authored from the governance contract (v2.0.0, §4), which itself still
  names Google Sheets. ADR-053 explicitly rejected Google Sheets for Supabase on
  2026-09-29 but no ADR or governance update was made to the contract, and the v2.0.0 skill
  bundle was generated from the (stale) contract rather than from the accepted ADRs.
IMPACT:
  An agent loading veloria-sync will design Google Sheets bridge work against a project that
  ships a Supabase mirror. It will also apply spreadsheet-specific security reasoning
  (service-account credentials, shared sheet privileges) to a codebase whose actual risk
  surface is a `service_role` PostgREST key. The skill's own instruction — "The exact trusted
  access layer ... must be verified" — is correct, but the framing is not, and the
  "Security gate — release blocker" is written for the wrong threat model.
RECOMMENDED_FIX:
  Rewrite veloria-sync/SKILL.md + references/google-sheets-bridge.md to describe the ACTUAL
  architecture: SQLite master, durable outbox, Supabase PostgREST mirror, Edge Function
  `client-sync` / `client-order` as the trusted access layer, RLS deny-by-default. Replace the
  spreadsheet-credential threat model with the service_role-key threat model. Keep the
  offline-first and data-minimisation rules verbatim — they are correct and implemented.
  Update governance/VELORIA_PROJECT_CONTRACT.md §4 in the same change (see XSKILL-01).
REGRESSION_TEST:
  Add to tests/unit (or a docs gate): assert that every technology named as "approved" in
  any .opencode/skills/**/SKILL.md exists in the codebase (grep-able token) OR is explicitly
  marked as "direction, not implemented". This is a cheap machine gate preventing recurrence.
DEPENDENCIES:
  XSKILL-01 (contract conflict), 11_SYNC.md findings.
```

### SKILL-02 — `veloria-db` forbids the timezone algorithm the project implements

```text
ID: SKILL-02
TITLE: veloria-db bans a hardcoded UTC+1 offset, but the project hardcodes exactly that
SEVERITY: P2
CONFIDENCE: CONFLICT
AFFECTED_SKILL: veloria-db (also veloria-closing)
AFFECTED_MODULE: electron/shared, src/domain/common
FILE: .opencode/skills/veloria-db/SKILL.md
LINE_RANGE: 56-57
PROBLEM:
  The skill states: "Use `Africa/Algiers` as the intended business timezone only after
  verifying the product contract and runtime timezone handling; do not hardcode `+1 hour`
  as a permanent timezone algorithm."
  The project hardcodes `+1 hour` in three places and names the zone only as a label:
  electron/shared/business-day.ts:11  export const BUSINESS_DAY_OFFSET_MS = 3_600_000;
  electron/shared/business-day.ts:17  export const BUSINESS_DAY_SQL_MODIFIER = "+1 hour";
  src/domain/common/business-day.ts:14  export const BUSINESS_DAY_OFFSET_MS = 3_600_000;
  The same prohibition appears in governance/PROJECT_FACTS_TO_VERIFY.md:34 and
  .opencode/skills/veloria-closing/SKILL.md:14.
EVIDENCE:
  electron/shared/business-day.ts:14-17
    /** Fuseau métier (documenté, jamais lu depuis l'hôte). */
    export const BUSINESS_TIME_ZONE = "Africa/Algiers";
    /** Modificateur SQLite qui translate un instant UTC en heure d'Algiers. */
    export const BUSINESS_DAY_SQL_MODIFIER = "+1 hour";
  The constant BUSINESS_TIME_ZONE is declared but never used to compute anything — the
  offset is applied arithmetically (ms + 3_600_000) in both twins.
ROOT_CAUSE:
  A deliberate simplification (E-35) that is *correct today* — Algeria has observed UTC+1
  year-round since 2018 and has no DST — but that the governing documents forbid without
  an explicit, recorded justification.
IMPACT:
  Currently zero operational impact: Africa/Algiers is UTC+1 with no DST, so the arithmetic
  is exact. The risk is future: if Algeria reinstates DST, every business-day boundary,
  daily closing, Z report, cash session and closed-period lock shifts by one hour for part
  of the year, silently mis-dating financial periods. The rule exists precisely to prevent
  that, and it is currently violated without a recorded decision.
RECOMMENDED_FIX:
  Two options, both acceptable, but ONE must be chosen and recorded in an ADR:
  (a) keep the fixed offset and add an ADR explicitly accepting it with the DST rationale,
      amending the three governing texts; or
  (b) implement a named-zone policy via Intl.DateTimeFormat with timeZone:"Africa/Algiers"
      (the skill's intent), keeping the SQL side consistent.
  Option (a) is cheaper and currently correct; option (b) is future-proof.
  Either way, stop describing a fixed offset as "named timezone policy".
REGRESSION_TEST:
  tests/unit/main-domain-parity.test.ts already proves the two twins agree. Add a boundary
  test asserting the business day for 22:59:59Z and 23:00:00Z under a fixed offset AND
  under the IANA zone, so a future DST rule change fails loudly.
DEPENDENCIES:
  09_CLOSING.md findings on business-day boundaries.
```

### SKILL-03 — `veloria-money` does not disclose the project's actual minor-unit scale

```text
ID: SKILL-03
TITLE: veloria-money asks the engineer to "confirm and document the project's chosen minor-unit scale" — the scale is centimes (100) and IS documented, but only in code, never in the skill or a policy file
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-money
AFFECTED_MODULE: src/domain/money
FILE: .opencode/skills/veloria-money/SKILL.md
LINE_RANGE: 14
PROBLEM:
  "For DZD, confirm and document the project's chosen minor-unit scale before changing any
  representation."
  The scale is confirmed (MINOR_PER_MAJOR = 100, src/domain/money/money.ts:14) and is
  documented in code comments and in the DB CHECKs ("toutes les colonnes *_minor sont
  INTEGER" — verify:migrations output), but there is no single policy document stating
  it. An agent must read money.ts to learn it.
EVIDENCE:
  src/domain/money/money.ts:1-2
    "// Veloria PoS — Domain: Money (DZD, integer minor units = centimes).
    // 100 DZD === 10000 minor. Never use float for financial state."
  electron/ipc/money-guard.ts:13-16 mirrors the same caps on the main side.
ROOT_CAUSE:
  The policy lives in code + duplicated constants rather than in a written policy document.
IMPACT:
  Low. The duplication is deliberate (electron cannot import src/ — rootDir boundary,
  ADR-062) and is protected by tests/unit/money-guard-parity.test.ts. Risk is that a future
  agent adds a third copy outside the two mirrored modules without adding a parity test.
RECOMMENDED_FIX:
  Add a short `docs/licensing/../MONEY_POLICY.md` (or a section in the glossary) stating:
  scale = 100 centimes/DZD; single-value cap 1e9; total cap 1e11; rounding = half away
  from zero at the centime, applied on decimal STRINGS (never floats); and the rule that
  main-side constants must mirror the domain and be covered by a parity test.
REGRESSION_TEST:
  Existing money-guard-parity test suffices; extend it to also assert the documented
  constants match the code (parse the doc, compare numbers).
DEPENDENCIES:
  03_MONEY.md.
```

### SKILL-04 — `veloria-gates` "negative proof" requirement is not machine-enforced for most gates

```text
ID: SKILL-04
TITLE: The gates skill mandates negative proof for every gate; the project implements it for only some gates
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-gates
AFFECTED_MODULE: scripts/quality, scripts/database, scripts/licensing
FILE: .opencode/skills/veloria-gates/SKILL.md
LINE_RANGE: 15, 36-41
PROBLEM:
  The skill requires: "A test must fail when the protected behavior is deliberately broken.
  Prefer mutation testing or a controlled negative test for critical gates" and
  "Capture actual command, exit status, and concise output summary."
  The project has real negative-proof gates — but only for a subset:
  - scripts/quality/verify-fr-only.mjs:90-93 fails if fewer than 300 files were scanned
    (a non-vacuity floor).
  - electron/ipc/raw-guards.ts:51-64 documents a test that scans electron/ and requires the
    RAW_GUARDED_CHANNELS list to be EXACTLY the set of raw channels calling
    enforceRawChannelGates.
  - scripts/quality/verify-domain.ts reports "E-36 : garde non vacuous (70 mutations IPC
    analysées)" and "toute mutation IPC est dans une transaction" / "toute mutation IPC
    reçoit un operationId" — a static negative-proof over all 70 IPC mutations.
  - scripts/database/verify-migrations.mjs validates a sha256 lock, so editing an applied
    migration fails the gate.
  But the skill's own example gates — "Backup gate: corrupt a disposable backup and prove
  restore validation refuses it" and "IPC gate: send an invalid payload or wrong sender and
  prove the handler rejects it" — have no equivalent automated negative proof.
  Notably: NO gate proves that an IPC handler rejects a WRONG SENDER (see 05_ELECTRON.md).
EVIDENCE:
  references/gate-design.md:20-24 (negative-proof examples)
  electron/ipc/raw-guards.ts:51-64 (the one implemented example)
  scripts/quality/verify-fr-only.mjs:90-93 (the non-vacuity floor)
  scripts/database/verify-migrations.mjs:56-90 (the sha256 lock guard)
  $ npm run verify:domain -> "OK  E-36 : toute mutation IPC est dans une transaction (ok)"
  $ npm run verify:migrations -> "OK  integrity_check=ok foreign_key_violations=0 / MIGRATIONS VERIFIED"
ROOT_CAUSE:
  The negative-proof pattern was applied ad hoc as each audit wave found a defect, not
  systematically.
IMPACT:
  The gates that lack negative proof could in principle pass vacuously after a future
  refactor. The most exposed are the print/backup/OCR raw channels, which have no
  wrong-sender or malformed-payload negative test.
RECOMMENDED_FIX:
  Add two mechanical negative-proof gates:
  (a) an IPC wrong-sender / malformed-payload test over at least one `handle()` channel and
      one raw channel;
  (b) a backup corruption test that writes a deliberately corrupted disposable backup and
      asserts the restore path refuses it.
  Both are achievable in the existing Vitest+temp-DB harness.
REGRESSION_TEST:
  Self-describing: the new tests ARE the negative proof.
DEPENDENCIES:
  08_QUALITY_GATES.md, 05_ELECTRON.md (sender validation), 13_BACKUP.md.
```

### SKILL-05 — `veloria-orchestrator` prescribes a `CHANGE_IMPACT_MATRIX` step that is under-specified

```text
ID: SKILL-05
TITLE: Orchestrator requires consulting governance/CHANGE_IMPACT_MATRIX.md for impact assessment, but the file is a prose checklist with no per-change-type routing
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-orchestrator
AFFECTED_MODULE: governance
FILE: .opencode/skills/veloria-orchestrator/SKILL.md
LINE_RANGE: 47-49
PROBLEM:
  Step C says: "Use `governance/CHANGE_IMPACT_MATRIX.md`. List affected layers, data flows,
  contracts, dependent applications, migrations, tests, documentation, packaging, and
  recovery implications."
  The referenced file exists (3019 bytes) but is a generic bullet list, not a matrix keyed
  by change type, so it gives the same generic answer for a DB migration as for a CSS tweak.
EVIDENCE:
  .opencode/skills/veloria-orchestrator/SKILL.md:49 references it;
  governance/CHANGE_IMPACT_MATRIX.md is 3019 bytes of prose sections.
ROOT_CAUSE:
  The governance package was authored as narrative guidance, not as an operational table.
IMPACT:
  Low. Skills remain usable; the impact step is just less targeted than intended.
RECOMMENDED_FIX:
  Convert the matrix to a table keyed by change type (DB migration / money / stock /
  IPC channel / UI / packaging / sync), each row listing the mandatory impact areas and the
  mandatory gates. That is a documentation change only.
REGRESSION_TEST:
  None required (documentation).
DEPENDENCIES:
  None.
```

### SKILL-06 — `veloria-hardware` prescribes device adapters the project does not have

```text
ID: SKILL-06
TITLE: The hardware skill mandates "explicit discovery, connect, disconnect, status, operation, timeout, and error contracts" per device adapter; the project has no device adapter layer
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-hardware
AFFECTED_MODULE: electron/printing, src/features/sales
FILE: .opencode/skills/veloria-hardware/SKILL.md
LINE_RANGE: 18-24, 44-48
PROBLEM:
  The skill requires a device-adapter architecture with a defined capability interface,
  "explicit discovery, connect, disconnect, status, operation, timeout, and error
  contracts", plus mocked adapters and a real-device acceptance procedure.
  The project has NO adapter layer. Scanning and printing are handled directly:
  - barcode input is a keyboard-wedge assumption handled in renderer TS
    (src/features/sales/sell/sell-search.ts, scan-flow e2e);
  - printing talks to Electron's webContents.print() / PDF APIs directly in
    electron/printing/printing.templates.ts;
  - there is no cash-drawer code at all, and no scale code at all.
  electron/printing/printing.capabilities.ts exists but models print capabilities, not a
  generic device adapter contract.
EVIDENCE:
  .opencode/skills/veloria-hardware/references/device-adapter-contract.md:1-12 requires
    "Stable device type and capability list… Discovery and explicit selection behavior…
    Connection lifecycle and status values… Mock implementation and real-device acceptance
    procedure."
  Grep for drawer/cash-drawer/tiroir in electron/ and src/: 0 device implementations.
  electron/printing/printing.capabilities.ts (4317 B) — print profiles only.
ROOT_CAUSE:
  The skill was written against a richer intended hardware scope (scanner, drawer, scale)
  than the product actually ships. The skill's own opening line says "Do not assume a
  printer/scanner model or a universal ESC/POS feature set" — but the reference file still
  assumes the adapter layer exists.
IMPACT:
  An agent asked to add a cash drawer or a scale will build the adapter layer from scratch
  and may not notice it must also fit the existing direct-call printing path. More
  importantly, the skill's "Use mocked adapters for deterministic unit tests and real
  devices for acceptance tests" cannot be followed because there is nothing to mock at
  that seam.
RECOMMENDED_FIX:
  Split the skill's scope into "implemented" (barcode keyboard-wedge input, thermal
  printing via Electron print APIs) and "declared but not implemented" (cash drawer,
  weighing scale), and make the latter explicitly a roadmap item with a statement that no
  adapter layer exists yet. Do NOT silently imply the adapter contract is satisfied.
REGRESSION_TEST:
  None required (documentation alignment). If a device layer is later added, add the
  disconnect/busy/duplicate-event matrix from references/device-adapter-contract.md.
DEPENDENCIES:
  16_HARDWARE.md.
```

### SKILL-07 — `veloria-observability` demands metrics the project does not collect

```text
ID: SKILL-07
TITLE: The observability skill requires operational health indicators (DB integrity state, last verified backup, pending sync queue size, print success, crash count) that are not implemented as indicators
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-observability
AFFECTED_MODULE: electron/services, src/app/shell
FILE: .opencode/skills/veloria-observability/references/diagnostic-policy.md
LINE_RANGE: 21-28
PROBLEM:
  The reference file lists required operational health indicators: "Database open and
  integrity state. Last verified backup and last restore drill. Pending sync queue size and
  oldest item age. Last successful print and device connectivity. Last successful update
  verification. Crash/restart count and recent sanitized error codes."
  The project implements: a structured JSON-lines logger with daily rotation and 14-day
  retention (electron/services/logger.ts), a crash-recovery window
  (electron/main/crash-recovery.ts), and a notifications hook
  (src/app/shell/use-notifications.ts).
  It does NOT implement a consolidated health-indicator surface, and there is no
  "last restore drill" tracking at all.
EVIDENCE:
  .opencode/skills/veloria-observability/references/diagnostic-policy.md:21-28 (list above)
  electron/services/logger.ts:16  const LOG_RETENTION_DAYS = 14;
  electron/services/logger.ts:19-37 pruneOldLogs() — rotation exists.
  electron/sync/sync.service.ts:101-129 — sync.lastAttemptAt / lastOwnerAttemptAt ARE
    tracked per-config, so the "pending sync queue size and oldest item age" indicator is
    partially real.
ROOT_CAUSE:
  The skill's reference enumerates a target state, not the current state; the skill body
  itself says "Measure only metrics that drive a concrete engineering or support decision",
  which is a softer requirement that the project does satisfy.
IMPACT:
  Low. No safety or integrity impact. The gap is that a support engineer following the
  reference would look for indicators that do not exist.
RECOMMENDED_FIX:
  Mark the health-indicator list as a target ("à implémenter / non couvert en V1") or
  implement the subset already tracked (DB integrity + backup status are one IPC call away:
  database.integrity and backup.status already exist as channels). Adding a small
  "diagnostics" aggregation is cheap and directly useful for the existing app.diagnostics
  channel.
REGRESSION_TEST:
  None required (documentation alignment).
DEPENDENCIES:
  17_OBSERVABILITY.md.
```

---

## 4. Cross-cutting observations on the skill system

### 4.1 What the skills system does well

- **Evidence discipline is encoded, not merely wished.** Every specialist skill has an
  explicit "Inspect before changing" or "Verify the current contract first" section, and
  every one includes a "NEEDS_VERIFICATION / do not assume" instruction. This is
  unusually good and it is visible in the code it produced (e.g. `veloria-db`'s "Determine
  the current schema version from code and the database, not from an old skill or report").
- **The acceptance checklists are testable.** `veloria-gates`' checklist maps cleanly onto
  the actual `scripts/quality/*` gates, which is why `npm run ci` is meaningful.
- **Machine-verified routing.** The `AGENTS.md` routing table + `verify:docs` gate is a
  genuinely good mechanism (ADR-178) — it prevents the "installed but never invoked" and
  "cited but missing" failure modes simultaneously.
- **The skill bodies correctly avoid hardcoding facts.** `veloria-db` says "verify the
  actual driver/schema/runner", `veloria-license` says "treat exact algorithms as historical
  until confirmed", `veloria-release` says "never assume a specific Electron ABI". This is
  the right posture.
- **The `references/` files are genuinely used.** Each skill names its references and the
  content is on-topic and actionable, not padding.

### 4.2 Systemic weaknesses

1. **The v2.0.0 bundle was generated from `governance/`, not from accepted ADRs.**
   `veloria-sync` is the proof: it encodes Google Sheets, which ADR-053 rejected on
   2026-09-29. Any other place where the contract lags the ADRs will produce the same
   defect. The contract itself acknowledges §5 "Do not resurrect removed modules ... Verify
   current product scope", so the contract knows it is a baseline — but the skill bundle
   presents its content as "The current product decision is:", which is too strong.

2. **Some references read as target-state specifications.** `veloria-hardware`
   (adapter layer) and `veloria-observability` (health indicators) describe systems the
   product does not have. An agent following them literally will report non-existent
   compliance or build redundant scaffolding.

3. **`governance/PROJECT_FACTS_TO_VERIFY.md` has never been filled in.** All 22 rows still
   read "Must verify" / "Must design/verify". This is the file designed to prevent exactly
   the drift that SKILL-01 and SKILL-02 exhibit, and it is inert. Its non-vacuity is not
   machine-checked (unlike `verify:fr`'s 300-file floor).

### 4.3 Skills that are notably well-aligned with the code

These were checked specifically and hold up:

| Skill              | Alignment evidence                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `veloria-db`       | migrations are forward-only, checksum-locked (`database/migrations.lock.json`), FK enforcement is ON, WAL + `synchronous = FULL`, pre-migration snapshot is fail-closed (`sqlite.service.ts:145-151`) |
| `veloria-money`    | integer centimes throughout, single source `src/domain/money/money.ts`, main-side mirror with a parity test, DB CHECKs on `*_minor` INTEGER                                                           |
| `veloria-stock`    | FIFO layers with runtime transaction enforcement, tripwire CHECKs, oldest-first `ORDER BY id ASC`, aggregate demand check before availability (`sales.repo.ts:548-560`)                               |
| `veloria-electron` | contextIsolation/nodeIntegration/sandbox all hardened, deny-by-default navigation, raw-channel guard list machine-verified by a test                                                                  |
| `veloria-gates`    | real gates with a non-vacuity floor and a real negative-proof for migrations/raw channels                                                                                                             |
| `veloria-closing`  | sessions de caisse with a single-active-session constraint, period-lock triggers fail-closed, close/reopen audited                                                                                    |
| `veloria-license`  | Ed25519, public key only in the POS, private key gitignored and untracked, enforced in main                                                                                                           |
| `veloria-backup`   | `VACUUM INTO` (WAL-consistent), pre-migration and pre-reset snapshots mandatory, retention                                                                                                            |
| `veloria-printing` | one HTML source shared by preview / thermal / PDF, 80mm profile widths, barcode + QR generation                                                                                                       |
| `veloria-security` | trust boundaries match the actual architecture, RLS deny-by-default, no secrets in source                                                                                                             |

---

## 5. Agent / command surfaces

| File                                                                                            | Purpose                     | State                                        |
| ----------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------- |
| `.opencode/agents/db-guardian.md`                                                               | DB + money integrity review | Present, referenced by `opencode.jsonc`      |
| `.opencode/agents/money-guardian.md`                                                            | Monetary boundary review    | Present                                      |
| `.opencode/agents/qa.md`                                                                        | Verification pipeline       | Present                                      |
| `.opencode/agents/sync-guardian.md`                                                             | Cloud sync / mirror review  | Present                                      |
| `.opencode/agents/ui-fr.md`                                                                     | French UI review            | Present                                      |
| `.opencode/commands/council.md`, `docs-metrics.md`, `migration-new.md`, `slice.md`, `verify.md` | Slash commands              | Present, all referenced by the routing table |

`opencode.jsonc` (root) declares the agent→model bindings and an MCP set (omniroute,
context7, playwright, github, figma). `opencode.jsonc` permission rules correctly mark
`database/migrations/*` edits as `ask` and `*.sqlite*` shell access as `ask` — appropriate
given AGENTS.md rule 12.

---

## 6. Metrics

| Metric                                                  | Value                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| Skills installed                                        | 17                                                         |
| Skills loadable in OpenCode                             | 17 / 17                                                    |
| SKILL.md files read in full                             | 17 / 17                                                    |
| Reference files read in full                            | 17 / 17                                                    |
| Agent Skills standard conformance                       | 17 / 17 (verify:docs)                                      |
| Skills contradicting the codebase                       | 1 (`veloria-sync`)                                         |
| Skills describing non-existent subsystems as if present | 2 (`veloria-hardware`, `veloria-observability`)            |
| Skills conflicting with governing documents             | 1 (`veloria-db` timezone rule)                             |
| Documentation-only findings (no code impact)            | SKILL-03, SKILL-05, SKILL-07                               |
| Findings with potential real impact                     | SKILL-01 (P1), SKILL-02 (P2), SKILL-04 (P2), SKILL-06 (P2) |

## 7. Conclusion

The skills system is fit for use and demonstrably improves engineering discipline in this
repository. It needs **one substantive correction** (`veloria-sync` must describe Supabase,
not Sheets), **three scope-alignment corrections** (hardware, observability, money policy),
and **one governance reconciliation** (contract §4 vs ADR-053, plus the UTC+1 offset rule).
None of these block day-to-day engineering; SKILL-01 does block anyone correctly reasoning
about the sync boundary.
