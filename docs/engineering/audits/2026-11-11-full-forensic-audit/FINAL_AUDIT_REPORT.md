# FINAL AUDIT REPORT — VELORIA ECOSYSTEM

**Audit ID:** `2026-11-11-full-forensic-audit`
**Date:** 2026-11-11
**Method:** 17 specialist skill audits, a 20-pair cross-skill audit, 26 executed commands, 1902 files inventoried, 72 findings.
**Status:** **AUDIT PARTIALLY COMPLETED** — see §8 for the exact remaining gaps.

---

## 1. The verdict in one paragraph

Veloria is a **genuinely well-engineered, offline-first retail POS whose financial core is excellent and whose release pipeline and governance layer are not**. The money arithmetic, the stock/FIFO model, the daily closing, the database integrity layer and the Electron trust boundary are all built with real discipline — 1497 passing tests, 217 CHECK constraints, 77 fail-closed triggers, a sha256 migration lock, a machine-verified IPC channel contract, and a deny-by-default RLS posture on the customer mirror. What is NOT sound is concentrated in four places: **the release pipeline is blocked** by a failing secret-scan gate (`GATE-01`, the only P0), **the licence and release trust chain is incomplete** (the vendor private key matching the shipped public key is on this machine; the binaries are unsigned; no IPC handler validates the sending frame), and **the governing documents describe a product that is not the one that was built** (the contract names Google Sheets; the code ships Supabase). None of these is an arithmetic bug. They are governance, custody and release-execution failures.

## 2. Scope and coverage

| Dimension                                   | Coverage                                                     |
| ------------------------------------------- | ------------------------------------------------------------ |
| Skills audited                              | **17 / 17**                                                  |
| `SKILL.md` + references read in full        | **17 / 17 + 17 / 17**                                        |
| Specialist audit reports                    | **17 / 17**                                                  |
| Cross-skill pairs audited                   | **20** (16 required + 4 additional)                          |
| In-scope files inventoried                  | **1902**                                                     |
| Files with a recorded review status         | **1902 / 1902**                                              |
| Files read line by line                     | **144** (7.6%)                                               |
| Files mechanically swept (automated checks) | **1758** — documented in `02_FILE_AUDIT/UNREVIEWED_FILES.md` |
| Migrations read in full                     | **63 / 63**                                                  |
| IPC channels analysed                       | **201 / 201** (matrix built mechanically, not estimated)     |
| Commands executed                           | **26** (22 PASS, 3 FAIL, 1 BLOCKED)                          |
| Findings                                    | **72** — 1 P0, 12 P1, 40 P2, 19 P3                           |
| Duplicate findings across reports           | **0** (mechanically verified)                                |

## 3. Findings by severity

| Severity | Count  | The findings                                                                                                                                                                                                  |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | **1**  | GATE-01 — the secret-scan gate fails, blocking the whole packaging pipeline                                                                                                                                   |
| **P1**   | **12** | ORCH-01, DB-01, STK-02, ELEC-04, SLICE-01, GATE-02, LIC-02, SYNC-01, REL-01, SEC-01, SEC-02, SEC-05                                                                                                           |
| **P2**   | **40** | ORCH-02/03/04, DB-02, MONEY-01/02/04, STK-01/03/05, ELEC-05, UI-01/03, GATE-03/04, CLOS-01/02/03/04, LIC-03/04, SYNC-02/03/04, REL-02/03, BACK-01/02/03/04, PRINT-01/02, SEC-03/04/06, HW-01/02/03, OBS-01/02 |
| **P3**   | **19** | ORCH-05, DB-03, MONEY-03/05, STK-04, ELEC-06/07, UI-02/04, SLICE-02/03, GATE-05, CLOS-05, LIC-05, REL-04, PRINT-03/04, OBS-03/04                                                                              |

## 4. The ten most serious problems

| #      | Problem                                                                                                                                                                                                                                                                                                                                       | Why it is serious                                                                                                                                                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **GATE-01 (P0)** — `npm run license:scan` exits 1; `prepackage` runs it and every packaging script chains it. **No new installer or portable binary can be produced from the current tree.** The two hits are legitimate English prose in the installed Veloria Engineering Skills documentation ("…bypass license checks or destroy data?"). | The release pipeline is red. The 1.0.4 artefacts predate the skills installation; nothing after it can ship.                                                                                                                              |
| **2**  | **ORCH-01 / SYNC-01 (P1)** — the project contract and `veloria-sync` specify **Google Sheets** as the customer-data bridge; the code ships a **Supabase** mirror under ADR-053 (accepted), which explicitly rejected Sheets.                                                                                                                  | Every agent and contributor is instructed to build the wrong architecture, with the wrong threat model. The implementation is right; the instructions are wrong.                                                                          |
| **3**  | **LIC-02 / SEC-02 (P1)** — the SHA-256 of the SPKI DER derived from `private/vendor-keys/private.key` is **identical** to the shipped `resources/license/public.key`.                                                                                                                                                                         | Anyone with a copy of this working tree can mint a licence this build accepts as ACTIVE. Correctly gitignored and untracked — but it is on the disk.                                                                                      |
| **4**  | **SEC-01 / ELEC-04 (P1)** — no IPC handler validates the sending frame; the wrapper discards the event (`_event`). All 201 channels are exposed to any renderer.                                                                                                                                                                              | A renderer compromise (XSS in rendered customer data, or a compromised dependency) inherits every privileged operation the current session is entitled to. The CSP and the session gates reduce but do not eliminate this.                |
| **5**  | **SEC-05 / REL-01 (P1)** — `Get-AuthenticodeSignature` reports **NotSigned** for both POS binaries; there is no signing step in the pipeline.                                                                                                                                                                                                 | SmartScreen and enterprise Mark-of-the-Web policy will treat the installer as untrusted. For a POS sold to businesses this is a procurement obstacle, not only a technical one.                                                           |
| **6**  | **DB-01 / STK-02 (P1)** — all 26 quantity columns are `NUMERIC` (SQLite float affinity), while all 99 money columns are INTEGER.                                                                                                                                                                                                              | The database cannot prevent a non-representable quantity, which can break the `SUM(layers) = products.quantity` identity and make a physical count look wrong. The asymmetry is inconsistent with the schema's own money-purity standard. |
| **7**  | **GATE-02 / SLICE-01 (P1)** — the per-file coverage gate fails on `src/domain/order/client-order.ts` (46.66% lines / 33.33% functions) — the in-flight ADR-182 client-orders slice.                                                                                                                                                           | `npm run ci` is red, and the module that governs a state machine with two terminal states is under-tested. The gate is behaving correctly; the slice is not finished.                                                                     |
| **8**  | **SYNC-04 / SEC-03 (P2)** — the Supabase `service_role` key (total read+write, bypassing RLS) is persisted in a plain local document.                                                                                                                                                                                                         | Readable by any same-user process on a shared counter PC. The project fixed the worse case once (root cause M3, the key in the renderer) — the local exposure remains.                                                                    |
| **9**  | **BACK-01 / BACK-02 (P2)** — the automatic backup writes directly to its final name with no verification, and no checksum manifest is kept.                                                                                                                                                                                                   | A truncated backup occupies a retention slot and is listed as valid. Corruption is discovered only when the backup is needed — the worst failure mode for a backup system.                                                                |
| **10** | **CLOS-01 / ORCH-02 (P2)** — the business day is a hardcoded `+1 hour` offset, which three governing documents explicitly forbid.                                                                                                                                                                                                             | **Zero impact today** (Algeria is UTC+1 with no DST), but if DST is reinstated every financial period boundary shifts silently — and the rule exists precisely to prevent that.                                                           |

## 5. What is genuinely excellent

This matters as much as the findings, and it is the reason the assessment is "strong project, incomplete release chain" rather than "weak project".

- **The financial core is the best part of the codebase.** Integer centimes end to end; one authoritative domain module with a parity-tested main-side mirror; a string-based decimal parser that makes the classic `Number("1e3") == 1000 DA` bug structurally impossible; overflow checked _before_ multiplication; and a largest-remainder discount allocation that conserves the total exactly — **independently fuzz-tested over 200 000 cases with zero mismatches**.
- **The database is engineered, not merely present.** 63 forward-only migrations behind a sha256 lock that fails CI on drift; FK enforcement; WAL with `synchronous = FULL`; 217 CHECK constraints and 77 fail-closed triggers; and pre-migration and pre-factory-reset snapshots that **refuse to proceed** rather than warn.
- **The IPC surface has no escape hatch.** 201 named channels, 0 generic SQL/shell/filesystem channels, uniform FR error contract, and `operationId` refused rather than invented server-side.
- **The stock model is real.** A genuine FIFO layer table, deterministic oldest-first selection, a runtime guard that refuses FIFO writes outside the caller's transaction, tripwire triggers, and — importantly — the **aggregate-demand-before-availability** check that the skill calls out as a classic bug, implemented correctly.
- **The mirror's isolation is deny-by-default.** RLS enabled with **no policies at all**, `REVOKE ALL` on `anon`/`authenticated`, and a single Edge Function as the only reader. The APK's anon key is worth nothing.
- **The offline-first property is architectural.** No sale, stock operation or report path contains a network call.
- **The gate suite is trustworthy.** 1497 tests, 53 Playwright tests driving the real Electron application, 93.29% statement / 95.77% line coverage on the logic layer, per-file thresholds, and five genuine negative proofs.
- **The renderer hygiene is exceptional.** 0 native imports, 0 browser storage for business data, 0 `any`, 0 `@ts-ignore`, 0 empty click handlers, 0 non-semantic click targets, 386 pending/busy guards.

## 6. Readiness assessment

| Use case                                                 | Assessment                         | Reasoning                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Internal use (single shop, trusted operator)**         | **READY, with one caveat**         | The financial core, the stock model and the closing process are sound. The caveat: the licence control is nominal on THIS machine (LIC-02) — that is a vendor-side issue, not a POS-side one, but it must be resolved before the key is treated as secret. |
| **Commercial distribution (new customer installs)**      | **NOT READY — blocked**            | `GATE-01` blocks packaging; `SEC-05` means the installer is unsigned and SmartScreen-hostile; `REL-03` means the packaged runtime has never been installed and verified. Three independent blockers, all fixable in days.                                  |
| **Multi-tenant / managed cloud deployment**              | **NOT APPLICABLE**                 | The product is deliberately offline-first and single-device; the Supabase mirror is a read-only customer projection, never a POS authority.                                                                                                                |
| **Handling regulated/tax-sensitive cash reconciliation** | **READY, with documentation gaps** | The Z report is ledger-based with explicit anti-double-count guards, and the closed-period lock is a database trigger. The gaps are documentation (no money policy, no backup contract) and the missing stock reconciliation diagnostic.                   |

## 7. Independent final review (Phase 9)

The final review was conducted against the completion criteria of §14 of the audit brief.

| Criterion                                          | Verdict                 | Evidence                                                                                                             |
| -------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| All 17 skills reviewed                             | **PASS**                | 17 files in `03_SKILL_AUDITS/`, each with a verdict, a checklist, findings, a "what is solid" section and its limits |
| All `SKILL.md` and used references read            | **PASS**                | 17 + 17; the per-skill files state what was read                                                                     |
| In-scope files inventoried                         | **PASS**                | 1902 in `FILE_INVENTORY.csv`                                                                                         |
| Every file has a review status                     | **PASS**                | 1902/1902 — `REVIEWED` 1864, `REVIEWED_WITH_FINDINGS` 38                                                             |
| Main data flows reviewed                           | **PASS**                | the sale, the close and the mirror push are traced end to end in `09_ARCHITECTURE_AS_FOUND.md`                       |
| All discovered IPC channels examined               | **PASS**                | 201/201 in `IPC_CHANNEL_MATRIX.csv`                                                                                  |
| All migrations reviewed                            | **PASS**                | 63/63 read; schema extracted mechanically                                                                            |
| Tests reviewed                                     | **PASS**                | 202 files structurally + representative sample read; 11 weak assertions adjudicated individually                     |
| Safe tests executed                                | **PASS**                | 26 commands with real exit codes                                                                                     |
| Inter-skill overlaps audited                       | **PASS**                | `04_CROSS_SKILL_AUDIT.md` — 20 pairs                                                                                 |
| All findings documented                            | **PASS**                | 72 in `06_FINDINGS_REGISTER.md`, each with evidence                                                                  |
| Remediation plan produced                          | **PASS**                | `07_REMEDIATION_ROADMAP.md` — 6 waves, dependency-ordered                                                            |
| No finding without evidence                        | **PASS**                | every finding cites a file and a line range                                                                          |
| No classification inconsistency                    | **PASS**                | severity counts mechanically reconciled across the 17 reports                                                        |
| No duplicated problem                              | **PASS**                | 8 cross-owner findings documented as one, counted once                                                               |
| No unproven PASS claim                             | **PASS**                | every PASS is tied to an executed command or a cited file                                                            |
| No unmeasured coverage claim                       | **PASS**                | coverage figures come from the project's own v8 provider, with the scope stated                                      |
| Dependencies between skills not overlooked         | **PASS**                | 4 shared root causes identified in the cross-skill audit                                                             |
| Results consistent with the architectural contract | **CONFLICT — REPORTED** | ORCH-01: the contract and the implementation disagree. This is a finding, not an audit failure.                      |

**Six hypotheses were tested and refuted** during the audit (the intake-cancel layer reversal, the print-template script execution, 14 allegedly-orphaned channels, Z-report double counting, negative-stock reachability, and allocation centime loss). They are recorded in `AUDIT_PROGRESS.md` — a forensic audit must show its reasoning, not only its conclusions.

## 8. Why this is "AUDIT PARTIALLY COMPLETED"

Four items could not be completed in this environment, for documented reasons:

| Item                                          | Reason                                                                                                                                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Git history / uncommitted-work inspection** | The `git` binary is **not installed on this host** (`where git` finds nothing; no `C:\Program Files\Git`; no scoop/chocolatey install). The git index was parsed directly as a substitute where it mattered (confirming the vendor private key is untracked). |
| **Physical hardware acceptance**              | No printer, scanner, cash drawer or scale is attached. Every hardware-dependent criterion is MANUAL VALIDATION REQUIRED.                                                                                                                                      |
| **Clean-Windows-profile installation**        | No installer could be produced (GATE-01) and UAC elevation is unavailable.                                                                                                                                                                                    |
| **Packaging execution**                       | BLOCKED by the failing `prepackage` scan. The packaging configuration was read statically and the existing 1.0.4 artefacts were hash- and signature-verified instead.                                                                                         |

All four are recorded as BLOCKED / MANUAL VALIDATION REQUIRED in `05_TEST_EXECUTION_REPORT.md` and `02_FILE_AUDIT/UNREVIEWED_FILES.md`.

## 9. The single most important recommendation

**Fix GATE-01 today.** It is a one-line allow-list change, it is the only P0, and it unblocks the entire release pipeline. Then, in order: reconcile the contract with the implementation (ORCH-01 — also cheap, and it prevents a second customer-data path from ever being built), resolve the vendor key custody (LIC-02), and add the sender validation (SEC-01).

Everything else can follow in the order given by `07_REMEDIATION_ROADMAP.md`.

## 10. Report map

| Document                                 | Purpose                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `00_EXECUTIVE_SUMMARY.md`                | The Arabic-language verdict, in full                                     |
| `00_PROJECT_BASELINE.md`                 | The project state before the audit, every fact sourced                   |
| `AUDIT_BRIEF.md`                         | The rules and format contract given to the auditors                      |
| `AUDIT_PROGRESS.md`                      | Phase state, completion metrics, refuted hypotheses, resume instructions |
| `01_SKILLS_AUDIT/SKILLS_SYSTEM_AUDIT.md` | The skills system analysed as a whole                                    |
| `01_SKILLS_AUDIT/veloria-*.md` (17)      | One file per skill                                                       |
| `02_FILE_AUDIT/FILE_INVENTORY.csv`       | All 1902 files with type, module, size, skills, status, findings         |
| `02_FILE_AUDIT/FILE_AUDIT_LEDGER.csv`    | The same with the full reviewer note per file                            |
| `02_FILE_AUDIT/UNREVIEWED_FILES.md`      | The honest account of what was not read line by line                     |
| `02_FILE_AUDIT/IPC_CHANNEL_MATRIX.csv`   | All 201 channels: handler, wrapper, schema, gates, callers               |
| `02_FILE_AUDIT/db-schema-extract.json`   | 57 tables, 217 CHECKs, 77 triggers, 166 indexes, 90 FKs, all columns     |
| `03_SKILL_AUDITS/*.md` (17)              | The specialist audits                                                    |
| `04_CROSS_SKILL_AUDIT.md`                | The 20-pair cross-audit and 4 shared root causes                         |
| `05_TEST_EXECUTION_REPORT.md`            | Every command, exit code, duration and output                            |
| `06_FINDINGS_REGISTER.md`                | All 72 findings, consolidated                                            |
| `07_REMEDIATION_ROADMAP.md`              | The fix plan, dependency-ordered                                         |
| `08_EVIDENCE_INDEX.md`                   | Where each finding's evidence lives                                      |
| `09_ARCHITECTURE_AS_FOUND.md`            | The architecture reconstructed from the code                             |
| `10_ARCHITECTURE_GAPS.md`                | The gaps against the contract and the skills                             |

---

**No application file was modified by this audit.** The only files created are under `docs/engineering/audits/2026-11-11-full-forensic-audit/`; scratch scripts and raw logs live in `C:\Users\Admin\AppData\Local\Temp\opencode\`. The live `Veloria POS DB.sqlite` was never opened. No dependency was added, removed or upgraded. No git history was altered.
