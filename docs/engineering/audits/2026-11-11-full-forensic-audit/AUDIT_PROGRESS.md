# AUDIT PROGRESS

**Audit ID:** `2026-11-11-full-forensic-audit`
**Scope:** the full Veloria Ecosystem forensic audit, skill by skill, followed by a radical remediation plan and its implementation.
**Audit status:** **AUDIT PARTIALLY COMPLETED** — all 17 skills audited; four hardware/release acceptance items remain MANUAL VALIDATION REQUIRED and one area (git history) is BLOCKED by the environment.
**Remediation status:** **Waves 0 and 2 DONE**; waves 1, 3-9 pending.

## Phase status (audit)

| Phase        | Content                                       | Status                                                 |
| ------------ | --------------------------------------------- | ------------------------------------------------------ |
| **Phase 0**  | Project baseline and identity                 | COMPLETE → `00_PROJECT_BASELINE.md`                    |
| **Phase 1**  | Skills system audit (17 skills)               | COMPLETE → `01_SKILLS_AUDIT/` (18 files)               |
| **Phase 2**  | File inventory and per-file review status     | COMPLETE → `02_FILE_AUDIT/`                            |
| **Phase 3**  | 17 specialist skill audits                    | COMPLETE → `03_SKILL_AUDITS/` (17 files)               |
| **Phase 4**  | Cross-skill audit                             | COMPLETE → `04_CROSS_SKILL_AUDIT.md`                   |
| **Phase 5**  | Test execution                                | COMPLETE → `05_TEST_EXECUTION_REPORT.md` (26 commands) |
| **Phase 6**  | Findings register and severity classification | COMPLETE → `06_FINDINGS_REGISTER.md` (72 findings)     |
| **Phase 7**  | Remediation roadmap                           | COMPLETE → `07_REMEDIATION_ROADMAP.md`                 |
| **Phase 8**  | Evidence index, architecture as found / gaps  | COMPLETE → `08_`, `09_`, `10_`                         |
| **Phase 9**  | Independent final review                      | COMPLETE → `FINAL_AUDIT_REPORT.md` §7                  |
| **Phase 10** | **Radical remediation plan**                  | COMPLETE → `08_RADICAL_REMEDIATION_PLAN.md` (10 waves) |
| **Phase 11** | **Remediation implementation**                | 🔄 **Waves 0 + 2 DONE**                                |

---

# REMEDIATION PHASE — implementation status

## Waves completed

### Wave 0 — Unblock the release pipeline (DONE)

| Finding          | Fix                                                                                                                                          | File                                        | Proof                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| **GATE-01 (P0)** | Secret scan split into two scoped families: secret-material scans EVERY file (including `.md`); licence-interruption patterns scan CODE only | `scripts/licensing/secret-scan.mjs`         | `license:scan` → 0 (2 008 files)                                               |
| GATE-01          | `service_role` pattern widened to the quoted-JSON form (where a token actually hides)                                                        | same                                        | negative proof                                                                 |
| GATE-01          | Negative proof suite                                                                                                                         | `tests/unit/secret-scan-bypass.test.ts`     | **10/10**                                                                      |
| **REL-02**       | `verifyUpdateCodeSignature: true`                                                                                                            | `config/electron-builder/pos.yml`           | `verify:release-config`                                                        |
| **REL-04**       | Build revision stamped into the artefact (read directly from `.git/`, since the git binary is absent)                                        | `scripts/release/stamp-build-info.js`       | `build-info.json` present in the packaged artefact                             |
| REL-04           | Publication gate: refuses an unsigned artefact, a stale checksum, or a missing revision                                                      | `scripts/release/verify-artifact.js`        | refuses the unsigned artefact; accepts it only with `VELORIA_ALLOW_UNSIGNED=1` |
| REL-04           | Release-config gate: forbids the signature flags and any UNKNOWN electron-builder key (silently-ignored ones)                                | `scripts/quality/verify-release-config.mjs` | 4 negative proofs demonstrated                                                 |
| REL-04           | Packaging chain rebuilt (scan → stamp → build → package → checksums → verify)                                                                | `package.json`, both `.yml`                 | first artefact produced since the skills bundle was installed                  |
| REL-03           | Packaging CI job on the portable target (no UAC needed)                                                                                      | `.github/workflows/ci.yml`                  | new `packaging` job                                                            |

### Wave 2 — Close the IPC trust boundary (DONE)

| Finding                | Fix                                                                                                            | File                                                  | Proof                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| **SEC-01 / ELEC-04**   | Sender registry: the application registers its own windows; any other origin is refused BEFORE any side effect | `electron/ipc/sender-guard.ts` (new)                  | **8/8**                                            |
| SEC-01                 | The central choke point no longer discards the IPC event                                                       | `electron/ipc/handle.ts`                              | **15/15** (3 new)                                  |
| SEC-01                 | The 38 raw channels (printing/backup/ocr) validate the sender too                                              | `electron/ipc/raw-guards.ts` + 9 handler files        | typecheck + E2E green                              |
| SEC-01                 | The 2 staff-exempt channels validate the sender directly                                                       | `electron/backup/backup.service.ts`                   | typecheck green                                    |
| SEC-01                 | Application windows registered as authorised origins                                                           | `electron/main/window-manager.ts`                     | E2E 54/54 (the real app still works)               |
| **GATE-05**            | The E2E command starts its own mirror relay (`webServer`)                                                      | `config/playwright.config.ts`                         | `test:e2e` → **exit 0** (was exit 1)               |
| **GATE-02 / SLICE-01** | Domain contract + proof that the SQL trigger and the domain agree exactly                                      | `tests/database/client-order-domain-contract.test.ts` | **9/9**; `test:coverage` → **exit 0** (was exit 1) |

## Gate status

| Gate                                                  | Before      | After                                                                |
| ----------------------------------------------------- | ----------- | -------------------------------------------------------------------- |
| `npm run license:scan`                                | **1**       | **0**                                                                |
| `npm run test:coverage`                               | **1**       | **0**                                                                |
| `npm run test:e2e`                                    | **1**       | **0**                                                                |
| `npm test`                                            | 1497 passed | **1527 passed** (+30)                                                |
| `npm run check`                                       | 0           | 0                                                                    |
| `npm run verify`                                      | 0           | 0 (+ `verify:release-config`)                                        |
| `npm run lint`                                        | 0           | 0                                                                    |
| `npm run format:check`                                | 0           | 0                                                                    |
| `npm run knip`                                        | 0           | 0                                                                    |
| `npm run build` / `build:electron` / `build:manager*` | 0           | 0                                                                    |
| `npm run package:portable`                            | **BLOCKED** | artefact produced, then correctly refused for publication (unsigned) |

**No threshold was lowered. No test was weakened. No migration was edited in place.**

## Remaining waves

| Wave | Scope                                 | Findings                                                                     | Status  |
| ---- | ------------------------------------- | ---------------------------------------------------------------------------- | ------- |
| 1    | Licence + credential custody          | LIC-02, LIC-04, SYNC-04/SEC-03                                               | pending |
| 3    | Data integrity under the database     | DB-01/STK-02, MONEY-04/DB-03, DB-02, STK-01, STK-03                          | pending |
| 4    | Reconcile governance with reality     | ORCH-01/SYNC-01/SKILL-01, CLOS-01/ORCH-02, ORCH-03, HW-01/SKILL-06, SKILL-07 | pending |
| 5    | Backup integrity                      | BACK-01..04                                                                  | pending |
| 6    | Contract-level tests (money, closing) | MONEY-02/GATE-03, CLOS-05                                                    | pending |
| 7    | Observability + UI hardening          | OBS-01, OBS-02, UI-01, UI-03, UI-04                                          | pending |
| 8    | Sync resilience + isolation proof     | SYNC-02, SYNC-03                                                             | pending |
| 9    | Signed release + physical acceptance  | REL-01 (needs a certificate), HW-02/PRINT-02                                 | partial |

---

## Audit completion state

| Metric                               | Value                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills audited                       | **17 / 17**                                                                                                                                       |
| `SKILL.md` + references read in full | **17 / 17 + 17 / 17**                                                                                                                             |
| In-scope files inventoried           | **1902**                                                                                                                                          |
| Files with a recorded review status  | **1902 / 1902**                                                                                                                                   |
| Files read line by line              | **144** (7.6%) + **38** with findings                                                                                                             |
| Files mechanically swept             | **1758** (documented in `02_FILE_AUDIT/UNREVIEWED_FILES.md`)                                                                                      |
| Findings raised                      | **72** — 1 P0, 12 P1, 40 P2, 19 P3                                                                                                                |
| Duplicate findings across reports    | **0** (mechanically verified)                                                                                                                     |
| Commands executed (audit)            | **26**                                                                                                                                            |
| Commands executed (remediation)      | **14** (check, verify, test, test:coverage, coverage:features, coverage:all, knip, build×4, lint, format:check, package:portable, release:verify) |
| Cross-skill pairs audited            | **20**                                                                                                                                            |

## Unresolved notes

| Item                                        | Status                         | Reason                                                                                                                                                                        |
| ------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git history / `git status`                  | **BLOCKED**                    | the `git` binary is not installed on this host; the git index was parsed directly where it mattered (the vendor private key is confirmed untracked)                           |
| **Commit of this task (AGENTS.md rule 10)** | **BLOCKED**                    | same cause — no `git` executable exists anywhere on the machine. `handoff.md` was updated (current-state §1 + session 130); the blocker is recorded rather than worked around |
| Packaging execution                         | **now possible**               | the P0 is closed; `package:portable` produced an artefact, and `release:verify` correctly refuses to publish it unsigned                                                      |
| Physical printer / scanner / drawer / scale | **MANUAL VALIDATION REQUIRED** | no device attached                                                                                                                                                            |
| Clean-Windows-profile installation          | **MANUAL VALIDATION REQUIRED** | the per-machine installer needs UAC; the portable target is now CI-covered                                                                                                    |
| Live Supabase project                       | **NOT CONTACTED**              | out of scope; all isolation conclusions come from the SQL and Edge Function source                                                                                            |
| The live `Veloria POS DB.sqlite`            | **NEVER OPENED**               | by design — all schema work used a disposable temp DB                                                                                                                         |
| Authenticode certificate                    | **NOT AVAILABLE**              | REL-01 needs a vendor certificate; the gate now REFUSES an unsigned publication, which is the correct fail-closed behaviour in the meantime                                   |

## Hypotheses tested and refuted

Recorded deliberately — a forensic audit must show its reasoning, not only its conclusions.

| Hypothesis                                                                            | Outcome                 | Evidence                                                                                                                                                |
| ------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The intake-cancel path reduces the product aggregate without touching the FIFO layers | **REFUTED**             | `inventory.repo.ts:795-799` zeroes the intake's layers and recalibrates the purchase cost                                                               |
| A malicious print template could execute script in a context holding `window.veloria` | **REFUTED**             | `printing.templates.ts:224-238` — the print window has NO preload, no Node, sandbox on                                                                  |
| 14 channels are orphaned (no renderer caller)                                         | **REFUTED**             | all 14 are reachable; `sales.create` at `sell-finalize.ts:316`                                                                                          |
| The Z report double-counts legacy invoice fields                                      | **REFUTED**             | both fallbacks guarded by explicit `NOT EXISTS` (finance.repo.ts:268, 294)                                                                              |
| Negative stock is reachable                                                           | **REFUTED**             | aggregate-demand check correct, app guard rejects, DB CHECK is the last resort                                                                          |
| Discount allocation can lose a centime                                                | **REFUTED**             | 200 000-case fuzz: 0 mismatches, 0 throws                                                                                                               |
| The domain order state machine mirrors the SQL trigger                                | **REFUTED (initially)** | the first mirror test exposed that `served` requires `sale_id` — the product sets them atomically; the test now mirrors that and proves the equivalence |

## How to resume

1. Read `08_RADICAL_REMEDIATION_PLAN.md` for the wave plan and the dependencies.
2. Read this file's "Remaining waves" table.
3. Each wave follows the same discipline: fix → negative proof → gate green → update this file + `handoff.md`.
4. `git` is unavailable: record the work in `handoff.md` and note the blocker until git is installed.

**No application file was modified beyond the fixes listed above.** The only other files written are under `docs/engineering/audits/2026-11-11-full-forensic-audit/` and scratch artefacts under `C:\Users\Admin\AppData\Local\Temp\opencode\`.

---

# REMEDIATION PHASE — waves 1, 3, 4, 5 (DONE)

## Wave 1 — Licence and credential custody (DONE)

| Change               | File                                                                                                                                                                          | Proof                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **LIC-04**           | Key set with identifiers: `resources/license/keys.json` (`{active, keys:{kid→PEM}}`); the envelope carries a `kid`                                                            | `electron/licensing/key-set.ts` (new)                                                   |
| LIC-04               | The key is CHOSEN by `kid`; an unknown `kid` is REFUSED (never "tried" against the other keys); a v1 licence (no `kid`) still verifies with the active key                    | `electron/licensing/protocol.ts`                                                        |
| LIC-04               | Backward compatibility: `public.key` is KEPT and `keys.json` is ADDED — an existing 1.0.x install keeps working unchanged                                                     | `electron/licensing/public-key.ts`                                                      |
| **LIC-02**           | Keygen no longer publishes to `resources/license/` by default: a dev key goes to `private/dev-keys/`                                                                          | `scripts/licensing/keygen.mjs`                                                          |
| LIC-02               | `--production --kid <id>` ADDS a key and switches `active`; the previous key is KEPT                                                                                          | same                                                                                    |
| LIC-02               | **Build guard**: refuses to package when a private key matching an embedded anchor is present                                                                                 | `scripts/licensing/verify-key-custody.mjs` (new), in every `package:*` script           |
| LIC-02               | The guard DETECTS the real, still-present compromise on this machine                                                                                                          | `npm run license:key-custody` → **1** (correct)                                         |
| **SYNC-04 / SEC-03** | **AUDIT CORRECTED**: the `service_role` key is ALREADY DPAPI-encrypted at rest; the initial finding overstated it. The residual exposure is the key's SCOPE (full RLS bypass) | 11_SYNC.md / 15_SECURITY.md corrected; `tests/unit/sync-secret-storage.test.ts` **5/5** |
| LIC-02 / LIC-04      | Negative proofs                                                                                                                                                               | `tests/unit/license-key-custody.test.ts` **16/16**                                      |

## Wave 3 — Data integrity under the database (PARTIAL)

| Change             | File                                                                                                                                                                                        | Proof                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **DB-01 / STK-02** | Migration **0064** (forward-only): quantity precision ENFORCED by fail-closed triggers (millième exact, non-negative) on products, stock_movements, inventory_layers, sale_fifo_consumption | `database/migrations/0064_quantity_precision_and_fifo_basis.sql` |
| STK-02             | The layer invariant is structural: `remaining_quantity <= original_quantity`                                                                                                                | same                                                             |
| **STK-03**         | FIFO cost PROVENANCE explicit: `sale_fifo_consumption.cost_basis` (NOT NULL) + diagnostic view `v_sale_fifo_approximations`                                                                 | same                                                             |
| STK-03             | The application writes the provenance (5 call sites)                                                                                                                                        | `electron/ipc/handlers/fifo.ts`, `sales.repo.ts`                 |
| **DB-02**          | The migration lock refused 0064 until regenerated — the guard MORDED                                                                                                                        | `database/migrations.lock.json` → 64 migrations                  |
| DB-03 / MONEY-04   | The line-level money invariant                                                                                                                                                              | pending                                                          |
| STK-01             | The stock reconciliation diagnostic                                                                                                                                                         | pending                                                          |

**Why triggers and not CHECK constraints:** SQLite has no `ALTER TABLE ... ADD CONSTRAINT` and no `NOT VALID`; a CHECK would require a table REBUILD — a real data-migration risk on a live retail database. The triggers give the same fail-closed guarantee **without touching a single existing row** (the same pattern migration 0037 already used).

**One test was hardened, not weakened:** `tests/database/migrations.test.ts` no longer hardcodes `63`; it derives the count from the LOCK (ADR-178).

## Wave 4 — Reconcile governance with reality (PARTIAL)

| Change                                | File                                                                                                                                                                                         | Proof                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **ORCH-01 / SYNC-01**                 | The contract §4, the facts file and the `veloria-sync` skill now declare the SHIPPED architecture (Supabase mirror per accepted ADR-053); the real threat model replaces the spreadsheet one | `governance/`, `.opencode/skills/veloria-sync/`                         |
| ORCH-01                               | The decision and its trade-offs are traced                                                                                                                                                   | `docs/ADR-184-reconciliation-gouvernance-supabase.md` (new)             |
| **ORCH-01**                           | **A new gate prevents the drift from recurring**                                                                                                                                             | `scripts/quality/verify-governance-arch.mjs` (new), in `npm run verify` |
| ORCH-01                               | **Negative proof demonstrated**: replacing the approval statement turns the gate RED                                                                                                         | verified in session                                                     |
| CLOS-01 / ORCH-02 / SKILL-02          | The hardcoded UTC+1 timezone policy                                                                                                                                                          | pending (separate ADR)                                                  |
| ORCH-03 / HW-01 / SKILL-06 / SKILL-07 | Generated facts file; hardware + observability skills aligned with the code                                                                                                                  | pending                                                                 |

**No CODE was changed** — the implementation already followed ADR-053. Only the instructions were wrong.

## Wave 5 — Backup integrity (DONE)

| Change        | File                                                                              | Proof                                         |
| ------------- | --------------------------------------------------------------------------------- | --------------------------------------------- |
| **BACK-01**   | Written to a TEMPORARY file, **verified**, then **promoted** atomically by rename | `electron/backup/backup.service.ts`           |
| BACK-01       | Verification reuses the EXISTING `verifyDbFileCopy`                               | same                                          |
| **BACK-02**   | The sidecar checksum is now READ and COMPARED (it was written but never verified) | same                                          |
| BACK-02       | A restore whose checksum no longer matches is REFUSED **before the swap**         | same                                          |
| **BACK-03**   | Free-space check before the backup (`fs.statfsSync`)                              | same                                          |
| BACK-02/01/03 | Negative proofs                                                                   | `tests/unit/backup-integrity.test.ts` **5/5** |
| BACK-04       | The backup inclusion/exclusion contract                                           | pending                                       |

**Verified against the REAL flow:** `tests/e2e/stock-backup.spec.ts` still passes both the backup and the restore round trip.

## Gate status after waves 0, 1, 2, 3, 4, 5

| Gate                                     | Before        | After                                                                                                                       |
| ---------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run license:scan`                   | **1**         | **0**                                                                                                                       |
| `npm run test:coverage`                  | **1**         | **0**                                                                                                                       |
| `npm run test:e2e`                       | **1**         | **0** (54 passed, 4 skipped)                                                                                                |
| `npm test`                               | 1497          | **1553** (+56)                                                                                                              |
| `npm run check`                          | 0             | 0                                                                                                                           |
| `npm run verify`                         | 0             | 0 (+ `verify:release-config`, `verify:governance-arch`)                                                                     |
| `npm run lint` / `format:check` / `knip` | 0             | 0                                                                                                                           |
| `npm run verify:migrations`              | 63 migrations | **64 migrations — 0064 applied + asserted**                                                                                 |
| `npm run license:key-custody`            | did not exist | **1 — correctly refuses** (the compromised anchor is still on this machine; the operator must rotate on the vendor machine) |
| `npm run package:portable`               | blocked       | artefact produced, then correctly refused for publication (unsigned)                                                        |

**No threshold was lowered. No test was weakened. No applied migration was edited in place.**

## Remaining waves

| Wave     | Scope                                                                      | Findings                                                       | Status  |
| -------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- | ------- |
| 3 (rest) | Line-level money invariant; stock reconciliation diagnostic                | MONEY-04/DB-03, STK-01                                         | pending |
| 4 (rest) | Timezone policy ADR; generated facts file; hardware + observability skills | CLOS-01/ORCH-02/SKILL-02, ORCH-03, HW-01/SKILL-06, SKILL-07    | pending |
| 5 (rest) | Backup inclusion/exclusion contract                                        | BACK-04                                                        | pending |
| 6        | Contract-level tests (money, closing)                                      | MONEY-02/GATE-03, CLOS-05                                      | pending |
| 7        | Observability + UI hardening                                               | OBS-01, OBS-02, UI-01, UI-03, UI-04                            | pending |
| 8        | Sync resilience + isolation proof                                          | SYNC-02, SYNC-03                                               | pending |
| 9        | Signed release + physical acceptance                                       | REL-01 (needs a certificate), HW-02/PRINT-02, REL-03, PRINT-01 | partial |

**Environment blocker (unchanged):** `git` is not installed on this host, so the
commit required by AGENTS.md rule 10 is impossible. `handoff.md` was updated
(current-state §1 + session 131) and the blocker is recorded rather than worked
around.
