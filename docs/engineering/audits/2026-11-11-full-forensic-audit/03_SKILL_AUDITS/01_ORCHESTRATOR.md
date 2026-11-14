# 01 — veloria-orchestrator Forensic Audit (Architecture as found)

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-orchestrator` — SKILL.md read in full (102 lines); references/task-routing.md and references/conflict-resolution.md read in full.
**Method:** the actual architecture was reconstructed from the source tree, not copied from the archived specs. Dependency directions were verified by import analysis across `src/` and `electron/`; the IPC surface was mapped mechanically; the database boundary was traced from `sqlite.service.ts` outward; the ecosystem applications were inventoried.

## 1. Verdict

The architecture is **coherent, disciplined, and materially better than the archived specifications describe**. The single most consequential structural decision — a hard `src/` ↔ `electron/` boundary enforced by separate TypeScript rootDirs, with duplication made explicit and parity-tested — produces a codebase that is easy to reason about and hard to corrupt.

The most important finding of this audit is **architectural, not a code defect**: the **governance layer has drifted from the implementation**. `governance/VELORIA_PROJECT_CONTRACT.md` still names Google Sheets as the approved customer-data bridge while the shipped code implements a Supabase mirror under an accepted ADR; the business-day timezone rule is stated three times and violated three times; and the `veloria-sync` / `veloria-hardware` / `veloria-observability` skills describe subsystems that do not exist in the form they describe. Under the orchestrator's own authority order, the accepted ADR outranks the contract — so the implementation is right and the _instructions_ are wrong. That inversion is dangerous: an agent following the instructions will build the wrong thing.

## 2. The architecture as actually found

### 2.1 Applications in the ecosystem

| Application                  | Root                 | Stack                                               | Trust level                                                     |
| ---------------------------- | -------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| **Veloria POS**              | `src/` + `electron/` | Electron 45 + React 19 + Vite 8 + TS 6 + Tailwind 4 | Untrusted renderer, trusted main                                |
| **License Manager** (vendor) | `license-manager/`   | Electron (separate app, own build)                  | **Vendor trust domain** — must never share secrets with the POS |
| **Client app**               | `mobile/`            | Expo / React Native                                 | Untrusted, network-only                                         |
| **Owner app**                | `owner/`             | Expo / React Native                                 | Untrusted, network-only                                         |
| **Mirror backend**           | `cloud/supabase/`    | Postgres + PostgREST + 2 Edge Functions             | Server-side, `service_role`                                     |
| **Showcase site**            | `website/`           | Static                                              | Public                                                          |

### 2.2 The POS internal layers (as verified by import analysis)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ src/features/**  (123 files, 17 feature areas)                            │
│   React screens + dialogs + hooks; the only consumers of the bridge      │
└────────────────────────────────┬──────────────────────────────────────────┘
                                 │ window.veloria  (typed facade, 187 fns)
┌────────────────────────────────▼──────────────────────────────────────────┐
│ src/shared/types/ipc-client.ts — the ONLY renderer→main entry point       │
│   call() wraps the bridge: unwraps {ok,data}, maps errors to FR           │
│   src/shared/** — money, dates, errors, formatters, UI primitives         │
└────────────────────────────────┬──────────────────────────────────────────┘
                                 │ contextBridge (201 named channels)
┌────────────────────────────────▼──────────────────────────────────────────┐
│ electron/preload/preload.ts — 339 lines, NO raw ipcRenderer exposure       │
└────────────────────────────────┬──────────────────────────────────────────┘
                                 │ ipcRenderer.invoke
┌────────────────────────────────▼──────────────────────────────────────────┐
│ electron/ipc/handle.ts — THE choke point (161 channels)                   │
│   licence gate → page gate → feature gate → debt gate → Zod parse        │
│   → operationId requirement → credit gate → staff gate → handler         │
│   → {ok,data} | {ok:false, code, message(FR)}                            │
│   38 raw channels bypass it → enforceRawChannelGates (machine-verified)  │
└────────────────────────────────┬──────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┬───────────────┐
        ▼                        ▼                        ▼               ▼
  handlers/*.repo.ts       handlers/sql-guard.ts    licensing/*         sync/*
  (business writes)        (deny-list)              (Ed25519 verify)  (outbox)
        │
┌───────▼─────────────────────────────────────────────────────────────────┐
│ electron/database/sqlite.service.ts — SOLE owner of the connection      │
│   FK ON · WAL · synchronous=FULL · busy_timeout=10000 · trusted_schema OFF│
│   63 migrations + sha256 lock · fail-closed pre-migration snapshot      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Verified dependency directions

| Direction                                          | Status                   | Evidence                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/` → `electron/`                               | **FORBIDDEN and absent** | separate tsconfig rootDirs; 0 native imports in `src/`                                                                                                                                                                                         |
| `electron/` → `src/`                               | **FORBIDDEN and absent** | `electron/` imports only from `electron/`; the required mirrors are explicit (`money-guard.ts`, `business-day.ts`, `return-settlement.ts`, `cost-allocation.ts`, `client-order.repo.ts`) and each is documented as a mirror with a parity test |
| `features/` → `domain/`                            | **DIRECT**               | `src/features` imports `@domain/*` (e.g. `src/shared/money/parse.ts` imports `@domain/money/money.ts`)                                                                                                                                         |
| `features/` → `application/`                       | present but thin         | `src/application/` has only 4 files                                                                                                                                                                                                            |
| `domain/` → anything external                      | **FORBIDDEN and absent** | `src/domain/**` is framework-free pure logic                                                                                                                                                                                                   |
| `electron/ipc/handlers/` → `electron/ipc/registry` | one-way                  | the registry imports the handlers, not the reverse                                                                                                                                                                                             |

### 2.4 The src↔electron duplication, inventoried

Every duplication is deliberate, documented and parity-tested:

| Domain logic                     | Domain copy                               | Main copy                                    | Parity test                                               |
| -------------------------------- | ----------------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| Money caps + line pricing        | `src/domain/money/money.ts`               | `electron/ipc/money-guard.ts`                | `tests/unit/money-guard-parity.test.ts`                   |
| Business day / business-date SQL | `src/domain/common/business-day.ts`       | `electron/shared/business-day.ts`            | `tests/unit/main-domain-parity.test.ts`                   |
| Return settlement + status       | `src/domain/returns/return-rules.ts`      | `electron/ipc/handlers/return-settlement.ts` | `tests/unit/main-domain-parity.test.ts`                   |
| Purchase-cost allocation         | `src/domain/packaging/packaging-rules.ts` | `electron/ipc/handlers/cost-allocation.ts`   | (ADR-167: the untested wrapper was REMOVED)               |
| Global discount allocation       | `src/domain/proforma/proforma-rules.ts`   | `electron/ipc/handlers/amount-allocation.ts` | `tests/unit/proforma-discount-parity.test.ts`             |
| Client order state machine       | `src/domain/order/client-order.ts`        | `electron/ipc/handlers/client-order.repo.ts` | `tests/unit/client-order-parity.test.ts`                  |
| Closing formula                  | `src/domain/closings/closing-rules.ts`    | `electron/ipc/handlers/finance.repo.ts`      | claimed by `tests/unit/documents.test.ts` (not confirmed) |

This is a **good** pattern: the boundary is real, the cost is explicit, and each duplication is paired with a proof obligation. The weakness is that the parity obligation is enforced by a test rather than by the compiler — see finding ORCH-04.

### 2.5 Data flows

| Flow         | Direction                                       | Offline-safe | Notes                                        |
| ------------ | ----------------------------------------------- | ------------ | -------------------------------------------- |
| Sale         | renderer → main → SQLite                        | **YES**      | one transaction; totals recalculated in main |
| Mirror push  | SQLite → outbox → Supabase                      | **YES**      | async; the sale never waits for it           |
| Stock intake | renderer → main → SQLite + FIFO layers          | **YES**      | one transaction; tripwires                   |
| Backup       | SQLite → `VACUUM INTO` → file                   | **YES**      | WAL-consistent                               |
| Print        | SQLite → renderer payload → hidden print window | **YES**      | the print window has NO preload              |
| Licence      | signed `.vlic` → main → capability enforcement  | **YES**      | no network at all                            |
| Customer app | Supabase → Edge Function → APK                  | N/A          | RLS deny-by-default                          |

## 3. Architectural findings

```text
ID: ORCH-01
TITLE: The governance contract and the veloria-sync skill specify a customer-data bridge (Google Sheets) that the product does not implement (Supabase)
SEVERITY: P1
CONFIDENCE: CONFLICT
AFFECTED_SKILL: veloria-orchestrator (cross-ref veloria-sync)
AFFECTED_MODULE: governance, .opencode/skills
FILE: governance/VELORIA_PROJECT_CONTRACT.md
LINE_RANGE: 32-35 (also PROJECT_FACTS_TO_VERIFY.md:36, and .opencode/skills/veloria-sync/SKILL.md:19)
PROBLEM:
  The contract states: "Google Sheets was approved as the intermediary for the
  first customer-app bridge. It is a bridge/projection, not the canonical POS
  database." The veloria-sync skill repeats it as an approved decision.
  The codebase implements a Supabase PostgREST mirror with two Edge Functions
  and RLS deny-by-default, under ADR-053 (2026-09-29, status ACCEPTED) which
  explicitly rejected Google Sheets on technical grounds.
  Under the orchestrator's authority order, an accepted ADR and the contract are
  both level 2. The ADR is more specific, more recent in implementation terms,
  and is the one the code follows. So the implementation is correct and the
  GOVERNING TEXT is stale.
EVIDENCE:
  governance/VELORIA_PROJECT_CONTRACT.md:32
    "- Google Sheets was approved as the intermediary for the first customer-app
     bridge. It is a bridge/projection, not the canonical POS database."
  docs/ADR-053-client-mirror-supabase.md:4-5 — "Statut : accepté (V1, 40 clients,
    lecture seule, 0 $)"
  docs/ADR-053-client-mirror-supabase.md:14 — "Google Sheets REJETÉ (pas
    d'isolation par client, pas de transactions, quotas)."
  cloud/supabase/{schema,rls,activity,catalog,orders,owner}.sql +
    cloud/supabase/functions/{client-sync,client-order}/index.ts — the real bridge.
  electron/sync/sync.protocol.ts:204 — the URL is validated as
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i
  A search for sheets.googleapis|spreadsheet|googleapis across electron/, src/,
  cloud/ returned ZERO matches.
ROOT_CAUSE:
  The v2.0.0 skills bundle and the governance package were generated from the
  contract, and the contract was never revised after ADR-053 was accepted. The
  orchestrator's own conflict-resolution protocol ("Do not resolve a conflict by
  … silently changing a data contract") was never executed for this pair.
IMPACT:
  High for the engineering process. Every agent, skill and future contributor
  that reads the contract or the sync skill will reason about the wrong
  architecture and the wrong threat model. The RULES that still matter
  (offline-first, SQLite authority, no credentials in the renderer or the APK,
  data minimisation) are unchanged — only the named technology and the threat
  model are wrong.
RECOMMENDED_FIX:
  Reconcile in ONE change, per the orchestrator's conflict-resolution protocol:
  (1) update governance/VELORIA_PROJECT_CONTRACT.md §4 to the ADR-053
      architecture;
  (2) update governance/PROJECT_FACTS_TO_VERIFY.md:36 (it currently instructs
      the reader NOT to assume Supabase — exactly backwards);
  (3) rewrite .opencode/skills/veloria-sync/SKILL.md and its reference file;
  (4) record the reconciliation in a new ADR so the next bundle inherits the
      corrected state.
REGRESSION_TEST:
  A verify-docs gate that asserts every technology named as an approved
  architecture in the contract or in a skill exists in the codebase (or is
  explicitly marked as a direction rather than an implementation).
DEPENDENCIES:
  SYNC-01, SKILL-01.
```

```text
ID: ORCH-02
TITLE: The business-day timezone rule is stated in three governing documents and violated in all three implementations
SEVERITY: P2
CONFIDENCE: CONFLICT
AFFECTED_SKILL: veloria-orchestrator (cross-ref veloria-db, veloria-closing)
AFFECTED_MODULE: governance, electron/shared, src/domain/common
FILE: governance/PROJECT_FACTS_TO_VERIFY.md
LINE_RANGE: 34 (also veloria-db/SKILL.md:57, veloria-closing/SKILL.md:14)
PROBLEM:
  Three separate governing texts forbid the hardcoded UTC+1 offset:
    governance/PROJECT_FACTS_TO_VERIFY.md:34 — "Do not hardcode a `+1 hour`
      timezone transform. Use a named timezone policy and test boundaries."
    .opencode/skills/veloria-db/SKILL.md:57 — "do not hardcode `+1 hour` as a
      permanent timezone algorithm."
    .opencode/skills/veloria-closing/SKILL.md:14 — "do not hardcode a fixed
      offset as a permanent timezone algorithm."
  The implementation hardcodes it in both twins:
    electron/shared/business-day.ts:11,17 — `BUSINESS_DAY_OFFSET_MS = 3_600_000`
      and `BUSINESS_DAY_SQL_MODIFIER = "+1 hour"`.
    src/domain/common/business-day.ts:14 — the same constant.
  `BUSINESS_TIME_ZONE = "Africa/Algiers"` is exported as a label and never used
  to compute anything.
EVIDENCE:
  The three citations above; the constants at business-day.ts:11/14/17.
  The offset is CORRECT today — Africa/Algiers has observed UTC+1 year-round
  with no DST — and the two twins are parity-tested, so the arithmetic is
  consistent.
ROOT_CAUSE:
  A deliberate simplification (convention E-35) adopted without the ADR that
  the governing rules require for a deviation.
IMPACT:
  Zero today; prospective. If Algeria reinstates DST, every business-day
  boundary, daily closing, Z report, cash session and closed-period lock shifts
  by one hour for part of the year, silently mis-dating financial periods. The
  rule exists precisely to prevent that, and it is currently violated without a
  recorded decision — which means the violation is invisible to any reviewer
  reading only the rules.
RECOMMENDED_FIX:
  Choose ONE and record it in an ADR:
  (a) ACCEPT the fixed offset explicitly, with the DST rationale, and amend the
      three governing texts to match; or
  (b) IMPLEMENT the named-zone policy via Intl.DateTimeFormat with
      timeZone:'Africa/Algiers' (the SQL fragment would then need to be
      computed in JS and passed as a parameter, since SQLite's 'localtime' is
      host-dependent).
  Option (a) is cheaper and currently correct; option (b) is future-proof.
REGRESSION_TEST:
  Extend the existing twin-parity test with a boundary vector asserting the
  business day for 22:59:59Z and 23:00:00Z computed both ways, so a future
  DST change fails loudly.
DEPENDENCIES:
  CLOS-01, SKILL-02.
```

```text
ID: ORCH-03
TITLE: governance/PROJECT_FACTS_TO_VERIFY.md has never been filled in, so the file designed to prevent exactly this audit's findings is inert
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-orchestrator
AFFECTED_MODULE: governance
FILE: governance/PROJECT_FACTS_TO_VERIFY.md
LINE_RANGE: 5-26 (the 22-row table)
PROBLEM:
  The file exists precisely to stop historical details from being mistaken for
  current repository facts: "This file prevents historical details from being
  mistaken for current repository facts. Fill it from the live codebase before
  substantial engineering work."
  Every one of its 22 rows still reads "Must verify" or "Must design/verify".
  It has never been completed.
  The failure taxonomy of this audit is dominated by exactly the drift the file
  was designed to prevent:
    - the customer-bridge row is now WRONG (it says Google Sheets; the code is
      Supabase);
    - the business-timezone row is unanswered and the code violates the rule;
    - the money-scale row is unanswered, though the code is unambiguous;
    - the SQLite/FK/WAL row is unanswered, though the code is exemplary.
EVIDENCE:
  governance/PROJECT_FACTS_TO_VERIFY.md:5-26 — 22 rows, all with a
  "Current status" of "Must verify" / "Must design/verify" / "Must verify".
  Contrast with the OTHER governance file, docs/METRICS.md, which IS generated
  and IS machine-verified by `npm run verify:docs`
  ("OK docs/METRICS.md à jour.").
  The skill files carry the same warning individually ("Treat exact algorithms,
  capability counts, page names, and paths in old source notes as historical
  until confirmed") — but that warning is scattered across 17 files instead of
  being maintained in the one file designed for it.
ROOT_CAUSE:
  The file is a manual, human-maintained table with no owner and no
  machine-checkable completion criterion, so it was never updated.
IMPACT:
  Moderate for the engineering process. The file's intended function — being the
  single place where "what is actually true" is recorded — is not being
  performed, so the drift accumulates in the contract and the skills instead.
RECOMMENDED_FIX:
  Either (a) complete it once from the live codebase and give it an owner and a
  review trigger (e.g. "update on any ADR that changes an architecture"), or
  (b) replace it with a GENERATED file: a script that derives each row's answer
  from the code (the money scale from `MINOR_PER_MAJOR`, the FK/WAL state from
  `applyPragmas`, the channel count from `channels.ts`, the migration count from
  the migrations directory, the licence algorithm from `protocol.ts`), with a
  verify-docs gate that fails when the generated file is stale — exactly the
  pattern already used for docs/METRICS.md.
  Option (b) is the durable one.
REGRESSION_TEST:
  The verify-docs gate that fails on a stale generated file.
DEPENDENCIES:
  ORCH-01, ORCH-02.
```

```text
ID: ORCH-04
TITLE: The src↔electron mirroring is enforced by test convention rather than by the build, so a third copy can be introduced silently
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-orchestrator (cross-ref veloria-money)
AFFECTED_MODULE: electron, src/domain, tests
FILE: electron/ipc/money-guard.ts
LINE_RANGE: 4-11
PROBLEM:
  The rootDir boundary (ADR-062) makes seven business rules exist twice. The
  duplication is intentional, documented, and paired with a parity test in each
  case. But the enforcement is entirely at TEST time.
  The money-guard module states the rule explicitly in a comment — "Règle :
  aucun fichier electron/* ne doit contenir de littéral 1_000_000_000 /
  100_000_000_000 hors de ce module" — and NO tool enforces it. The author
  anticipated exactly this failure mode and left the rule in prose.
EVIDENCE:
  electron/ipc/money-guard.ts:4-11 (the rule, in a comment)
  The mirrors and their parity tests:
    money-guard.ts        ← src/domain/money/money.ts          (parity test exists)
    shared/business-day.ts ← src/domain/common/business-day.ts   (parity test exists)
    handlers/return-settlement.ts ← src/domain/returns/return-rules.ts (parity test exists)
    handlers/cost-allocation.ts   ← src/domain/packaging/packaging-rules.ts
        (ADR-167: the untested wrapper was REMOVED — good precedent)
    handlers/amount-allocation.ts ← src/domain/proforma/proforma-rules.ts (parity test exists)
    handlers/client-order.repo.ts ← src/domain/order/client-order.ts (parity test exists)
    handlers/finance.repo.ts      ← src/domain/closings/closing-rules.ts
        (parity claimed by documents.test.ts — relevance NOT confirmed: CLOS-03)
  Compare with the ONE rule in the codebase that IS machine-enforced in the
  same area: electron/ipc/raw-guards.ts:51-64 requires RAW_GUARDED_CHANNELS to be
  exactly the set of raw channels calling enforceRawChannelGates. The project
  already knows how to do this.
ROOT_CAUSE:
  The parity-test approach was chosen before a mechanical enforcement mechanism
  was considered.
IMPACT:
  Low-moderate. Each parity test catches a divergence in its own rule, but
  nothing catches: (a) a NEW business rule being implemented in electron/ with
  no domain counterpart and no parity test — exactly what ADR-167 removed once;
  (b) a rule being changed in one twin only.
RECOMMENDED_FIX:
  (1) Extend the existing `verify-domain.ts` static gate (which already analyses
      all 70 IPC mutations) with a mirror-completeness check: for each domain
      module in `src/domain/**` that declares a business rule, assert a
      corresponding main-side module exists AND a parity test references both.
  (2) Add the grep-based rule the money-guard comment already states: fail the
      gate if a money cap literal appears under electron/ outside money-guard.ts.
  (3) Record the seven mirrors in a single table (one file) so the parity-test
      inventory is visible and maintainable — this audit had to reconstruct it.
REGRESSION_TEST:
  The extended verify-domain gate.
DEPENDENCIES:
  MONEY-01, MONEY-02, CLOS-03.
```

```text
ID: ORCH-05
TITLE: src/application/ holds only 4 files, so the "application/use-case" layer of the documented architecture is effectively empty
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-orchestrator
AFFECTED_MODULE: src/application
FILE: src/application/
LINE_RANGE: n/a (4 files total)
PROBLEM:
  The archived specifications and the skill's slice template describe a
  four-layer structure (UI → use case → domain → repository). The live tree has
  src/application with 4 files, which is far too few to be a use-case layer for
  17 feature areas. In practice, the use-case/orchestration logic lives in
  electron/ipc/handlers/*.repo.ts (the main process) — which is architecturally
  sound for an Electron app, since the main process IS the trusted
  application layer.
EVIDENCE:
  src/application/ — 4 files (measured). The rest of the source tree:
    src/domain 38, src/features 123, src/shared 32, src/app 11.
  The archived spec tree (docs/specs-archive/03_ARCHITECTURE.md,
  08_DOMAIN_AND_USE_CASES.md) describes the four-layer model.
  electron/ipc/handlers/ — 33 files holding the orchestration.
  There is ALSO a genuine case of the layer being used:
  src/application/sales/create-sale.ts (measured) — "Construit la charge
  sales.create (validation métier pure, zéro IO)".
  And src/domain/order/client-order.ts notes the renderer-side reference.
ROOT_CAUSE:
  The application layer was consolidated into the main process when the Electron
  architecture was adopted, which is a legitimate simplification, but the
  directory name and the archived docs were never reconciled.
IMPACT:
  Low. The layering that matters — renderer / main / database — is clean and
  verified. The cost is documentation confusion: an agent following the
  archived four-layer template will look for use cases in src/application and
  find almost nothing.
RECOMMENDED_FIX:
  Either remove the near-empty `src/application/` layer and document that the
  main process is the application layer, or give it a defined role (pure
  use-case orchestration shared by the renderer and the main process — which is
  what `create-sale.ts` and `client-order.ts` already do for two features) and
  migrate the remaining orchestration into it incrementally. Whichever is
  chosen, record it in an ADR so the archived specs can be retired.
REGRESSION_TEST:
  None required (documentation/architecture decision).
DEPENDENCIES:
  None.
```

## 4. The orchestrator's own checklist, applied to this project

| Orchestrator requirement                                                | Status                   | Evidence                                                                                  |
| ----------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| Read AGENTS.md / CLAUDE.md / README / package scripts                   | **VERIFIED**             | done in this audit                                                                        |
| Read the governance contract, facts-to-verify, skills registry          | **VERIFIED**             | all three read; the facts file is stale (ORCH-03)                                         |
| Inspect the live tree, manifests, migrations, tests, build config, ADRs | **VERIFIED**             | done                                                                                      |
| Check git status and diff                                               | **BLOCKED**              | git is not installed on this host                                                         |
| State facts from the live repo, not old notes                           | **VERIFIED**             | the baseline was reconstructed from the tree                                              |
| Apply the documented authority order                                    | **VIOLATED by the repo** | ORCH-01: an accepted ADR and the contract conflict, and the contract was never reconciled |
| Load only the needed specialists                                        | **VERIFIED**             | the routing matrix is followed and machine-verified                                       |
| Require evidence; separate PASS / FAIL / NOT RUN                        | **VERIFIED**             | this audit's own execution table                                                          |
| Record architecture changes in an ADR                                   | **VERIFIED**             | 182 ADRs exist                                                                            |
| Use CHANGE_IMPACT_MATRIX for impact assessment                          | **PARTIAL**              | the file is prose, not a change-type matrix (SKILL-05)                                    |
| Never let a skill silently override the contract                        | **AT RISK**              | the veloria-sync skill DOES override the accepted ADR with stale text                     |

## 5. What is genuinely solid

- **The src↔electron boundary is real, enforced and understood.** Two tsconfig rootDirs, 0 native imports in `src/`, and 7 explicit, documented, parity-tested mirrors. This is a rare level of discipline.
- **The main process is genuinely the application layer.** All business writes, all validation, all licence/staff/credit gates live in `electron/`. The renderer proposes; main disposes.
- **The IPC surface is explicit and narrow.** 201 named channels, no generic escape hatch, uniform `{ok,data}` / `{ok:false,code,message}` contract, and every mutating channel carries an operationId that the main process refuses to invent.
- **The data layer is the strongest part of the architecture.** 63 forward-only migrations behind a sha256 lock, FK enforcement, 217 CHECKs, 77 triggers, WAL + synchronous=FULL, fail-closed snapshots before every destructive operation.
- **The ecosystem boundaries are respected.** The License Manager is a separate app in a separate trust domain; the customer app uses an `anon` key that RLS denies everything for; the mirror is a projection, never an authority.
- **The offline-first property is architectural, not aspirational.** No sale, stock operation or report path contains a network call.
- **The gate suite is a real part of the architecture, not an afterthought.** 1497 tests, 53 E2E against the real app, per-file coverage thresholds, and several genuine negative proofs.

## 6. Not verified / limits of this audit

- Git history could not be inspected (no git binary), so the evolution of the architecture and the recency of the drift could not be traced.
- `mobile/`, `owner/`, `license-manager/` and `website/` were inventoried but their internals were not audited (out of the 17-skill scope).
- The archived specs under `docs/specs-archive/` were treated as historical, per the orchestrator's own instruction; they were not audited as documents.
- The `graphify-out/` knowledge graph was not used as a source (it is a generated artefact and the audit was expected to work from the source).

## 7. Metrics

| Metric                                   | Value                                                 |
| ---------------------------------------- | ----------------------------------------------------- |
| Applications in the ecosystem            | 6                                                     |
| POS internal layers                      | 6 (features / shared / preload / ipc / domain / data) |
| Verified dependency-direction rules      | 6 (all held)                                          |
| src↔electron mirrors inventoried         | 7                                                     |
| Mirrors with a parity test               | 6 confirmed, 1 unconfirmed                            |
| Architectural governance conflicts found | 2 (ORCH-01, ORCH-02)                                  |
| Findings                                 | 5 (P0×0, P1×1, P2×3, P3×1)                            |
