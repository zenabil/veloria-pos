# 10 — ARCHITECTURE GAPS

**Audit ID:** `2026-11-11-full-forensic-audit`
**What the implementation does NOT achieve, relative to its own contract and to the Veloria skills.**

## 1. Gaps against the project contract

| Contract clause                                                                                     | Required | Actual                                                                                                                                 | Gap                                                                                                      |
| --------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| §3 "Money must use exact integer minor units"                                                       | ✔        | 99/99 money columns INTEGER; strict string parser                                                                                      | **NONE**                                                                                                 |
| §3 "Business mutations spanning multiple records must be atomic and safely retryable"               | ✔        | 70/70 IPC mutations transactional; operationId enforced                                                                                | **NONE**                                                                                                 |
| §3 "Backup and recovery are product-critical"                                                       | ✔        | VACUUM INTO, fail-closed snapshots, restore validation                                                                                 | **PARTIAL** — the produced image is not verified at creation (BACK-01) and carries no checksum (BACK-02) |
| §4 "Google Sheets was approved as the intermediary for the first customer-app bridge"               | Sheets   | **Supabase** (ADR-053, accepted)                                                                                                       | **CONFLICT** — the contract is stale; the implementation is correct (ORCH-01)                            |
| §4 "Never expose Google service-account credentials … in the customer app or renderer"              | ✔        | the APK uses anon + RLS (denied everything); the service_role key is main-process only                                                 | **PARTIAL** — the key persists in a local document readable by any same-user process (SYNC-04)           |
| §4 "A trusted access layer must prove customer-level authorization before customer data is exposed" | ✔        | Edge Function + PBKDF2 + RLS deny-by-default + REVOKE                                                                                  | **NONE structurally** — but not proven by an executed test (SYNC-03)                                     |
| §4 "License Manager and POS licensing are separate trust domains"                                   | ✔        | separate app; the POS holds only the public key                                                                                        | **PARTIAL** — the matching private key is on this machine (LIC-02)                                       |
| §5 "Do not reintroduce POS login/tenant IDs/role systems that were removed"                         | ✔        | `staff_users` is a staff-role system, explicitly approved by ADR-085..087; `bread_orders` is a removed module still present as a table | **NONE** (the staff system is an approved addition, not the removed POS login)                           |
| §6 "Use forward-only migrations for shipped databases"                                              | ✔        | 63 forward-only migrations; sha256 lock                                                                                                | **NONE** — though the lock writer could launder a drift (DB-02)                                          |
| §6 "Validate all untrusted input at trusted boundaries"                                             | ✔        | 161 Zod-validated channels; raw channels parse individually                                                                            | **PARTIAL** — 4 channels have no schema (ELEC-06); the receipt payload is unvalidated (ELEC-06)          |
| §7 "A change that affects … security posture … requires an ADR"                                     | ✔        | 182 ADRs                                                                                                                               | **NONE**                                                                                                 |

## 2. Gaps against the Veloria skills

| Skill                 | Its key requirement                                                                            | Actual                                                                     | Gap                       |
| --------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------- |
| veloria-db            | "Do not hardcode `+1 hour` as a permanent timezone algorithm"                                  | hardcoded in both twins                                                    | **CLOS-01 / ORCH-02**     |
| veloria-db            | "Quantities use a documented base unit and fixed precision"                                    | NUMERIC columns                                                            | **DB-01 / STK-02**        |
| veloria-db            | "Allow dynamic SQL structure only through strict allowlists"                                   | ✔                                                                          | **NONE**                  |
| veloria-db            | "Never purge records required for accounting traceability"                                     | ✔                                                                          | **NONE**                  |
| veloria-money         | "One documented minor-unit scale and rounding policy"                                          | correct but undocumented outside the code                                  | **MONEY-05** (P3)         |
| veloria-money         | "Rounding policy decision record"                                                              | absent for the percentage path                                             | **MONEY-03** (P3)         |
| veloria-money         | "The database provides final constraints where practical"                                      | absent for the line-level arithmetic                                       | **MONEY-04** (P2)         |
| veloria-stock         | "Reconcile aggregate layer quantity to product quantity and report any unexplained difference" | no diagnostic                                                              | **STK-01** (P2)           |
| veloria-stock         | "do not accumulate binary floating-point quantities"                                           | NUMERIC columns                                                            | **STK-02** (P1)           |
| veloria-stock         | "mark the provenance" of the legacy fallback                                                   | not recorded on the consumption row                                        | **STK-03** (P2)           |
| veloria-electron      | "Verify the sender frame belongs to the expected application origin/window"                    | absent on all 199 handlers                                                 | **SEC-01** (P1)           |
| veloria-electron      | "Never expose raw ipcRenderer, fs, SQLite handles … or a generic SQL runner"                   | ✔                                                                          | **NONE**                  |
| veloria-electron      | "Ensure native modules are built for the exact Electron runtime ABI"                           | N-API prebuild — genuinely compatible                                      | **NONE**                  |
| veloria-ui-fr         | "Provide clear loading, success, empty, offline, permission, and error states"                 | present on major screens, inconsistent on drawers                          | **UI-01** (P2)            |
| veloria-ui-fr         | "Do not rely on color alone to communicate status"                                             | not machine-verified                                                       | **UI-04** (P3)            |
| veloria-ui-fr         | "Avoid arbitrary inline styling and duplicated design primitives"                              | 78 raw hex colours                                                         | **UI-02** (P3)            |
| veloria-gates         | "A test must fail when the protected behavior is deliberately broken"                          | true for 5 gate classes; absent for the IPC boundary and backup corruption | **GATE-04** (P2)          |
| veloria-gates         | "Do not inflate coverage numbers"                                                              | scoped and documented                                                      | **NONE**                  |
| veloria-closing       | "Prefer a named timezone"                                                                      | hardcoded offset                                                           | **CLOS-01** (P2)          |
| veloria-closing       | "A report must expose its source movements and formula"                                        | in-app ✔; the owner snapshot is a separate path                            | **CLOS-04** (P2)          |
| veloria-closing       | "Reuse existing read repositories/use cases"                                                   | the owner snapshot maintains its own queries                               | **CLOS-04** (P2)          |
| veloria-license       | "Support public-key rotation with … explicit key identifiers"                                  | no key ID                                                                  | **LIC-04** (P2)           |
| veloria-license       | "Reject ambiguous JSON encodings and duplicate keys"                                           | the decoder does not                                                       | **LIC-03** (P2)           |
| veloria-license       | "The signing private key MUST stay offline"                                                    | it is on a dev machine                                                     | **LIC-02** (P1)           |
| veloria-sync          | "POS remains Offline-First"                                                                    | ✔                                                                          | **NONE**                  |
| veloria-sync          | "Apply bounded retries with exponential backoff and jitter"                                    | no per-row backoff                                                         | **SYNC-02** (P2)          |
| veloria-sync          | "Test customer A cannot read customer B's data"                                                | structural, not executed                                                   | **SYNC-03** (P2)          |
| veloria-sync          | "Do not place service credentials … in the mobile app"                                         | ✔                                                                          | **NONE**                  |
| veloria-release       | "Sign Windows executables/installers"                                                          | unsigned                                                                   | **SEC-05** (P1)           |
| veloria-release       | "Never disable signature or integrity verification"                                            | `verifyUpdateCodeSignature: false`                                         | **REL-02** (P2)           |
| veloria-release       | "Packaged application launches on a clean Windows test environment"                            | never exercised                                                            | **REL-03** (P2)           |
| veloria-backup        | "Store … checksum in a manifest"                                                               | no manifest                                                                | **BACK-02** (P2)          |
| veloria-backup        | "Write to a temporary file, verify integrity, then atomically promote"                         | writes directly to the final name                                          | **BACK-01** (P2)          |
| veloria-backup        | "Validate … free space"                                                                        | no space check                                                             | **BACK-03** (P2)          |
| veloria-printing      | "Verify exact printed amounts against persisted document totals"                               | no assertion                                                               | **PRINT-01** (P2)         |
| veloria-printing      | "Physical acceptance" record                                                                   | none                                                                       | **PRINT-02 / HW-02** (P2) |
| veloria-security      | "Validate at every trust boundary"                                                             | the sender frame is unvalidated                                            | **SEC-01** (P1)           |
| veloria-security      | "Keep secrets server-side or in protected OS storage"                                          | the service_role key is in a plain document                                | **SEC-03** (P2)           |
| veloria-hardware      | "Define a device capability interface … with explicit discovery/connect/disconnect contracts"  | no adapter layer                                                           | **HW-01** (P2)            |
| veloria-observability | "Never log passwords, PINs, … or unnecessary customer financial data"                          | no sanitiser                                                               | **OBS-01** (P2)           |
| veloria-observability | "A sanitized support bundle should be exportable … and explain exactly what it contains"       | no bundle                                                                  | **OBS-02** (P2)           |
| veloria-slice         | "Acceptance criteria are mapped to tests"                                                      | the client-orders module is untested below threshold                       | **SLICE-01** (P1)         |
| veloria-orchestrator  | "Use governance/CHANGE_IMPACT_MATRIX.md"                                                       | prose, not a matrix                                                        | **SKILL-05** (P3)         |
| veloria-orchestrator  | "When current implementation conflicts with an approved decision … record the resolution"      | the Sheets/Supabase conflict was never reconciled                          | **ORCH-01** (P1)          |

## 3. Gaps against the archived specifications

The archived specs in `docs/specs-archive/` describe a **four-layer** structure (UI → use case → domain → repository). The shipped code has **three** meaningful layers (renderer → main → data), with `src/application/` holding 4 files.

| Archived expectation                | Actual                                                       | Assessment                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| A dedicated use-case layer          | Effectively empty; the main process IS the application layer | **Not a defect** — a legitimate consolidation for an Electron app. The gap is documentary (ORCH-05).                                |
| A separate `features/` per module   | ✔ 17 feature areas                                           | Aligned                                                                                                                             |
| A router                            | No router — `useState` in `App.tsx`                          | **Intentional** (the security module notes the SPA has no internal navigation). Documented in `electron/security/security.ts:6-13`. |
| Doctrine/repositories split         | `src/domain` (pure) + `electron/ipc/handlers` (repositories) | Aligned in substance, different in naming                                                                                           |
| A plugin/adapter layer for hardware | Does not exist                                               | **Gap** (HW-01)                                                                                                                     |

## 4. Gaps in the QUALITY OF THE CONTRACT ITSELF

A distinct category, and arguably the most consequential: the contract does not describe the product.

| Contract element                           | State                                                                         | Consequence                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| §4 names the wrong customer-data bridge    | Stale since 2026-09-29                                                        | Any reader reasons about the wrong architecture |
| `PROJECT_FACTS_TO_VERIFY.md`               | 22 rows, all "Must verify" — never filled in                                  | The file designed to prevent drift is inert     |
| The skills bundle (v2.0.0)                 | Generated from the contract, so it inherits its errors                        | 7 skill-level findings                          |
| No capability/counts contract              | The contract avoids numbers (correct) but also avoids naming the architecture | The drift had nowhere to be corrected           |
| No statement of the supported hardware     | The skill implies 4 device classes; 2 exist                                   | HW-01                                           |
| No statement of the release signing policy | The checklist says "where required"; no policy states whether it IS required  | SEC-05                                          |

**The single highest-leverage remediation in this register is therefore not a code change** — it is to make the contract agree with the code, and to make that agreement machine-checkable. `docs/METRICS.md` already proves the project can do exactly this: it is generated and verified by `npm run verify:docs`.

## 5. Gap summary by category

| Category                  | Open gaps                                                              | Of which P1/P0 |
| ------------------------- | ---------------------------------------------------------------------- | -------------- |
| Security                  | 7                                                                      | 3              |
| Data integrity            | 6                                                                      | 1              |
| Financial integrity       | 6                                                                      | 0              |
| Architecture / governance | 8                                                                      | 1              |
| Licensing                 | 4                                                                      | 1              |
| Synchronisation           | 3                                                                      | 0              |
| Backup                    | 4                                                                      | 0              |
| Printing                  | 4                                                                      | 0              |
| Release                   | 4                                                                      | 1              |
| UI/UX                     | 4                                                                      | 0              |
| Tests                     | 4                                                                      | 1              |
| Observability             | 4                                                                      | 0              |
| Hardware                  | 3                                                                      | 0              |
| Maintenance               | 5                                                                      | 0              |
| **TOTAL**                 | **66 distinct gaps** (some findings map to more than one skill clause) | **8**          |
