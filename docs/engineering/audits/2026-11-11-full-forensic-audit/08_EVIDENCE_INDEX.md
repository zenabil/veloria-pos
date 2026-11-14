# 08 — EVIDENCE INDEX

**Audit ID:** `2026-11-11-full-forensic-audit`
Every artefact produced by this audit, and where the primary evidence for each finding lives.

## 1. Audit artefacts

| Artefact              | Path                                                         | Contents                                                                                                                                                |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executive summary     | `00_EXECUTIVE_SUMMARY.md`                                    | The Arabic-language verdict and readiness assessment                                                                                                    |
| Project baseline      | `00_PROJECT_BASELINE.md`                                     | The state of the project before the audit, with every fact sourced                                                                                      |
| Audit brief           | `AUDIT_BRIEF.md`                                             | The rules, finding format and report structure given to the auditors                                                                                    |
| Progress log          | `AUDIT_PROGRESS.md`                                          | Phase-by-phase completion state and resumption points                                                                                                   |
| Skills system audit   | `01_SKILLS_AUDIT/SKILLS_SYSTEM_AUDIT.md`                     | The 17-skill system analysed as a whole (7 findings)                                                                                                    |
| Per-skill audits      | `01_SKILLS_AUDIT/veloria-*.md` (17 files)                    | One file per skill: loadability, checklist, findings, limits                                                                                            |
| File inventory        | `02_FILE_AUDIT/FILE_INVENTORY.csv`                           | All 1902 in-scope files with type, module, size, related skills                                                                                         |
| File audit ledger     | `02_FILE_AUDIT/FILE_AUDIT_LEDGER.csv`                        | The same 1902 files with a review status and the findings against each                                                                                  |
| Unreviewed files      | `02_FILE_AUDIT/UNREVIEWED_FILES.md`                          | The honest accounting of what was NOT read line by line                                                                                                 |
| IPC channel matrix    | `02_FILE_AUDIT/IPC_CHANNEL_MATRIX.csv`                       | All 201 channels: handler location, wrapper, Zod schema, validator file, licence/staff/debt gates, raw guard, renderer call count and sample call sites |
| IPC matrix summary    | `02_FILE_AUDIT/ipc-matrix-summary.json`                      | The same data as JSON, plus the no-handler / no-validator / no-caller lists                                                                             |
| DB schema extract     | `02_FILE_AUDIT/db-schema-extract.json`                       | 57 tables, 217 CHECKs, 77 triggers, 166 indexes, 7 views, 90 FKs, all money and quantity columns with types and line numbers                            |
| Licence gate map      | `02_FILE_AUDIT/license-gates-map.json`                       | The licence-protected, page-gated, feature-gated and debt-gated channel sets                                                                            |
| Zod schema map        | `02_FILE_AUDIT/zod-schema-map.json`                          | All 167 validator schemas with their declaring file and whether they are Zod                                                                            |
| Skill audits (17)     | `03_SKILL_AUDITS/01_ORCHESTRATOR.md` … `17_OBSERVABILITY.md` | The specialist audits — one per skill                                                                                                                   |
| Cross-skill audit     | `04_CROSS_SKILL_AUDIT.md`                                    | The 20-pair cross-audit, 4 shared root causes, unsafe data flows, missing inter-module tests                                                            |
| Test execution report | `05_TEST_EXECUTION_REPORT.md`                                | All 26 commands with real exit codes, durations and output                                                                                              |
| Findings register     | `06_FINDINGS_REGISTER.md`                                    | All 72 findings, consolidated, with duplicate handling                                                                                                  |
| Remediation roadmap   | `07_REMEDIATION_ROADMAP.md`                                  | 6 waves, dependency-ordered, with acceptance criteria                                                                                                   |
| Evidence index        | `08_EVIDENCE_INDEX.md`                                       | This file                                                                                                                                               |
| Architecture as found | `09_ARCHITECTURE_AS_FOUND.md`                                | The architecture reconstructed from the code                                                                                                            |
| Architecture gaps     | `10_ARCHITECTURE_GAPS.md`                                    | Where the implementation falls short of its own contract                                                                                                |
| Final report          | `FINAL_AUDIT_REPORT.md`                                      | The consolidated audit report                                                                                                                           |

## 2. Primary evidence by finding

| Finding                | Primary evidence location                                                                                     | Key artefact                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **GATE-01**            | `scripts/licensing/secret-scan.mjs:36-60`; `package.json:39,56`                                               | `05_TEST_EXECUTION_REPORT.md` §3.1 (the literal failing output)                              |
| **ORCH-01 / SYNC-01**  | `governance/VELORIA_PROJECT_CONTRACT.md:32`; `docs/ADR-053-client-mirror-supabase.md:4,14`; `cloud/supabase/` | `11_SYNC.md`, `01_ORCHESTRATOR.md`                                                           |
| **LIC-02 / SEC-02**    | `private/vendor-keys/private.key`; `resources/license/public.key`                                             | `10_LICENSE.md` (the fingerprint comparison)                                                 |
| **SEC-01 / ELEC-04**   | `electron/ipc/handle.ts:44-49`                                                                                | `02_FILE_AUDIT/IPC_CHANNEL_MATRIX.csv` (the "no sender validation" column), `05_ELECTRON.md` |
| **SEC-05 / REL-01**    | `config/electron-builder/pos.yml`; `release/*.exe`                                                            | `12_RELEASE.md` (the `Get-AuthenticodeSignature` output)                                     |
| **DB-01 / STK-02**     | `database/migrations/0001_initial_schema.sql:88`                                                              | `02_FILE_AUDIT/db-schema-extract.json` (the quantity-column list)                            |
| **SLICE-01 / GATE-02** | `src/domain/order/client-order.ts:14-66`                                                                      | `05_TEST_EXECUTION_REPORT.md` §3.2 (the literal threshold errors)                            |
| **GATE-03 / MONEY-02** | `src/domain/money/money.ts:180`                                                                               | `03_MONEY.md`                                                                                |
| **ELEC-05**            | `electron/ipc/raw-guards.ts:65-115`                                                                           | `02_FILE_AUDIT/IPC_CHANNEL_MATRIX.csv` (the wrapper column)                                  |
| **CLOS-01 / ORCH-02**  | `electron/shared/business-day.ts:11,17`                                                                       | `09_CLOSING.md`, `01_ORCHESTRATOR.md`                                                        |
| **SYNC-02**            | `database/migrations/0032_client_access_sync.sql:26-37`                                                       | `11_SYNC.md`                                                                                 |
| **BACK-01 / BACK-02**  | `electron/backup/backup.service.ts:97-157,246-290`                                                            | `13_BACKUP.md`                                                                               |
| **SYNC-04 / SEC-03**   | `electron/sync/sync-secrets.ts`; `electron/sync/sync.protocol.ts:234`                                         | `11_SYNC.md`, `15_SECURITY.md`                                                               |
| **PRINT-02 / HW-02**   | `electron/printing/printing.page-size.ts:1-12`                                                                | `14_PRINTING.md`, `16_HARDWARE.md`                                                           |
| **OBS-01**             | `electron/services/logger.ts:56-79`                                                                           | `17_OBSERVABILITY.md`                                                                        |
| **UI-01 / UI-03**      | `src/features/**` (the sweeps)                                                                                | `06_UI_FR.md` (the sweep tables)                                                             |
| **HW-01**              | `.opencode/skills/veloria-hardware/SKILL.md:18-24`                                                            | `16_HARDWARE.md`                                                                             |

## 3. External evidence (outside the repository)

| Artefact               | Location                                                 | Contents                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command execution logs | `C:\Users\Admin\AppData\Local\Temp\opencode\audit-logs\` | Raw stdout/stderr for every command run: `typecheck-*.log`, `format-check.log`, `coverage.log`, `coverage-features.log`, `coverage-all.log`, `knip.log`, `license-integrity.log`, `e2e.log`, `build.log`, `build-electron.log` |
| Extraction scripts     | `C:\Users\Admin\AppData\Local\Temp\opencode\`            | `ipc5.cjs` (the IPC matrix builder), `dbschema.cjs` (the schema extractor), `zodmap.cjs`, `gates.cjs`, `alloc-test.cjs` (the 200 000-case allocation fuzz), `gen-ledger.cjs`, `count-findings.cjs`                             |
| Allocation fuzz output | `alloc-test.cjs` stdout                                  | 200 000 randomized cases: **0 conservation mismatches, 0 spurious throws**                                                                                                                                                     |

These live outside the repository by design, per the audit brief's rule that only `docs/engineering/audits/` may be written inside the project.

## 4. Commands that produced the evidence

```
npm run typecheck              -> 0
npm run typecheck:electron    -> 0
npm run typecheck:manager     -> 0
npm run typecheck:mobile      -> 0
npm run typecheck:owner       -> 0
npm run lint                  -> 0
npm run format:check          -> 0
npm test                      -> 0   202 files / 1497 tests passed
npm run test:db               -> 0
npm run test:coverage         -> 1   FAIL (client-order.ts thresholds)
npm run test:coverage:features-> 0
npm run test:coverage:all     -> 0
npm run test:e2e               -> 1   FAIL (53 passed / 4 skipped / 1 failed)
npm run verify:migrations      -> 0   MIGRATIONS VERIFIED
npm run verify:domain         -> 0   DOMAIN VERIFIED
npm run verify:docs           -> 0   DOCS VERIFIED
npm run verify:fr             -> 0   351 files, 0 literals
npm run verify:encoding       -> 0   1124 files, 0 U+FFFD
npm run verify:perf           -> 0   PERF VERIFIED
npm run verify:site           -> 0   SITE VERIFIED
npm run license:scan          -> 1   FAIL (blocks packaging)
npm run version:check         -> 0
npm run license:integrity     -> 0
npm run build                 -> 0
npm run build:electron        -> 0
npm run knip                  -> 0
npm run package               -> BLOCKED (prepackage scan fails)
npm run ci                    -> NOT RUN (2 constituent gates red; each run individually)
Get-AuthenticodeSignature     -> NotSigned (both POS binaries)
Get-FileHash (SHA-256)        -> matches release/SHA256SUMS.txt for both POS binaries
```

## 5. Evidence that a finding does NOT exist

Recorded explicitly, because a forensic audit must state what it checked and found clean:

| Checked and found clean                           | Method                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Renderer → native import path                     | grep over `src/**` for `electron`, `node:`, `fs`, `better-sqlite3` → **0**              |
| Business data in browser storage                  | grep for `localStorage` / `sessionStorage` / `indexedDB` in `src/` → **0**              |
| `: any` / `as any` / `@ts-ignore` in the renderer | grep → **0**                                                                            |
| Generic SQL / shell / filesystem IPC escape hatch | sweep of all 201 channels → **0**                                                       |
| Dead UI handlers (empty `onClick`, `console.log`) | regex sweep of `src/features/**` → **0**                                                |
| `.only` / `.todo` / `xit` in the suite            | sweep of `tests/**` → **0**                                                             |
| Discount-allocation conservation                  | 200 000-case fuzz → **0 mismatches**                                                    |
| Foreign-key enforcement at runtime                | `sqlite.service.ts:38` + `verify:migrations` (`foreign_key_violations=0`) → **ENABLED** |
| Money column type purity                          | `verify:migrations` → all 99 `*_minor` columns INTEGER → **CLEAN**                      |
| Migration immutability                            | sha256 lock + `verify:migrations` → **ENFORCED**                                        |
| Private key in version control                    | `.git/index` parsed directly → **NOT TRACKED**                                          |
| Per-customer data isolation                       | RLS deny-by-default + REVOKE + Edge Function verification → **STRUCTURALLY ENFORCED**   |
| Release artefact integrity                        | SHA-256 recomputed vs `SHA256SUMS.txt` → **ALL MATCH**                                  |
| Negative stock                                    | aggregate-demand check + app guard + DB CHECK → **NO PATH FOUND**                       |
| Double counting in the Z report                   | both legacy fallbacks guarded by `NOT EXISTS` → **NONE FOUND**                          |
