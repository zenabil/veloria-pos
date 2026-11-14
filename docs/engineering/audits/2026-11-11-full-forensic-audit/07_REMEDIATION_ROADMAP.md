# 07 — REMEDIATION ROADMAP

**Audit ID:** `2026-11-11-full-forensic-audit`
**Based on:** 72 findings (1 P0, 12 P1, 40 P2, 19 P3), plus the cross-skill root causes.
**No fix was implemented by this audit.** This document is the plan.

## How to read this

Each fix states the finding ID, the files expected to change, why it is prioritised, the risks, the dependencies, the owning skill, the implementation approach, the pre-fix tests, the post-fix tests and the acceptance criteria.

**Execution order is mandatory within each wave.** The waves are ordered by dependency, not by severity alone: a P0 that unblocks the release pipeline must land before a P1 that cannot be verified without a release build.

---

## Wave 0 — Unblock the release pipeline (must land before anything can ship)

| #   | Fix                                                                             | Finding                  | Priority reason                                                                                                       |
| --- | ------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 0.1 | Allow-list documentation trees for the bypass-pattern family in the secret scan | **GATE-01** (P0)         | **Every packaging command is blocked.** Nothing can be released until this is fixed, so it precedes all release work. |
| 0.2 | Add a packaging gate that refuses to publish an unsigned artefact               | **SEC-05 / REL-01** (P1) | Must exist BEFORE the first signed build, so it is designed now and enforced once a certificate is available.         |
| 0.3 | Set `verifyUpdateCodeSignature: true`                                           | **REL-02** (P2)          | A one-line change that removes a latent trap; no dependency.                                                          |

### 0.1 — Fix the secret scan without weakening it

- **Files:** `scripts/licensing/secret-scan.mjs`
- **Priority:** The only P0. It blocks `package`, `package:win`, `package:pos`, `package:manager` and `ci`.
- **Risk:** Fixing it by weakening the pattern set re-opens the blind spot the scan was built to close. **The secret-material patterns must stay active over the documentation trees.**
- **Dependencies:** none.
- **Owner skill:** veloria-gates (with veloria-security).
- **Implementation:** add an ALLOW-LIST of documentation paths for the _bypass-pattern family only_, mirroring the precedent at `scripts/quality/verify-fr-only.mjs:23`. Narrow the bypass pattern to code contexts (an assignment or a call) rather than prose. Keep the private-key/API-token patterns scanning everything.
- **Pre-fix tests:** the failing run itself is the evidence (`SECRET-SCAN ÉCHEC`).
- **Post-fix tests:** (a) `npm run license:scan` exits 0 on the pristine tree; (b) a synthetic `.ts` file containing a real bypass pattern IS still reported; (c) a synthetic file containing a private-key block in a documentation path IS still reported.
- **Acceptance:** `npm run license:scan` → 0; `npm run package:portable` produces an artefact; the negative tests both still fail correctly.

### 0.2 — Signing gate

- **Files:** `scripts/release/*`, `config/electron-builder/pos.yml`
- **Implementation:** a release script assertion that the produced installer's `Get-AuthenticodeSignature` status is `Valid` and its signer subject matches the expected publisher; the packaging command refuses to publish otherwise.
- **Acceptance:** an unsigned build cannot be published; a signed build passes the gate and the artefact's signature verifies independently.

---

## Wave 1 — Licence and credential integrity (highest security value)

| #   | Fix                                                                  | Finding                   | Priority reason                                                                                                              |
| --- | -------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Establish, record and (if needed) rotate the production keypair      | **LIC-02 / SEC-02** (P1)  | The private key matching the shipped public key is on a dev machine. Until this is resolved, the licence control is nominal. |
| 1.2 | Separate the dev and production key lifecycles in `keygen.mjs`       | **LIC-02**                | Prevents recurrence.                                                                                                         |
| 1.3 | Add a build-time guard against packaging with a matching private key | **LIC-02**                | Makes the condition impossible to miss.                                                                                      |
| 1.4 | Add a key identifier and a key-set to the licence format             | **LIC-04** (P2)           | Required to make 1.1's rotation safe.                                                                                        |
| 1.5 | Scope and protect the Supabase `service_role` credential             | **SYNC-04 / SEC-03** (P2) | A total-privilege bearer credential readable by any same-user process.                                                       |

### 1.1 — Key custody

- **Files:** `private/vendor-keys/`, `resources/license/public.key`, `scripts/licensing/keygen.mjs`, `docs/licensing/KEY_MANAGEMENT.md`
- **Risk:** Rotating wrongly invalidates every licence already issued to a customer. **The rotation must ship the new public key BEFORE any licence is signed with it, and the old key must be retained for the supported validity period** — which requires 1.4 to be in place first.
- **Dependencies:** 1.4 before the rotation executes.
- **Owner skill:** veloria-license (with veloria-security).
- **Pre-fix tests:** the audit's fingerprint comparison (both public fingerprints identical) — this becomes a permanent gate.
- **Post-fix tests:** (a) no private key matching the shipped public key exists in the tree; (b) a licence signed by a retired-but-retained key still verifies; (c) a licence signed by an unknown key is rejected with `INVALID_SIGNATURE`.
- **Acceptance:** a licence issued on the new keypair activates on a POS shipping the new public key; licences issued on the old keypair continue to work during the overlap period.

### 1.2 / 1.3 — Lifecycle separation and the packaging guard

- **Implementation:** `keygen.mjs` requires an explicit `--production` flag to write `resources/license/public.key`; a dev key goes to a separate path. A packaging step computes the public fingerprint of any `private/vendor-keys/private.key` and refuses to build if it matches the shipped public key.
- **Acceptance:** regenerating a dev key can no longer change the shipped trust anchor; packaging with a matching private key present fails.

### 1.5 — Credential scoping

- **Files:** `electron/sync/sync.protocol.ts`, `electron/sync/sync-secrets.ts`, `cloud/supabase/`
- **Implementation:** replace the full `service_role` key with a scoped Supabase API key limited to the mirror tables; move storage to the Windows Credential Manager / DPAPI, keeping only a reference in the config; rotate on a documented schedule.
- **Risk:** switching to a scoped key can break the mirror push if the scope is too narrow — verify against the actual writes first.
- **Dependencies:** BACK-04 (the backup exclusion contract must be documented alongside).
- **Post-fix tests:** the credential accessor does not return the raw key from a plain file; the backup export excludes the config; the mirror push still works.
- **Acceptance:** the raw key never appears in a plain document; a same-user process cannot read a usable credential from the app data directory.

---

## Wave 2 — The IPC trust boundary

| #   | Fix                                                  | Finding                   | Priority reason                                                |
| --- | ---------------------------------------------------- | ------------------------- | -------------------------------------------------------------- |
| 2.1 | Validate the sending frame on every handler          | **SEC-01 / ELEC-04** (P1) | The single most consequential security gap. Cheap, high value. |
| 2.2 | Add the wrong-sender negative-proof gate             | **GATE-04 / SEC-04** (P2) | Makes 2.1 permanent.                                           |
| 2.3 | Extend the capability gating to the raw channel path | **ELEC-05** (P2)          | Removes the two-places-to-update problem.                      |

### 2.1 — Sender validation

- **Files:** `electron/ipc/handle.ts`, `electron/ipc/raw-guards.ts`, `electron/main/window-manager.ts`
- **Priority:** A renderer compromise currently inherits every privileged operation. The CSP and the session gates reduce but do not eliminate this.
- **Risk:** A too-strict check could break legitimate calls — e.g. the recovery and licence windows use the same preload but different windows. **The check must accept the main, recovery and licence windows**, or be scoped to the main window with the others explicitly allowed.
- **Dependencies:** 2.2.
- **Owner skill:** veloria-electron (with veloria-security).
- **Implementation:** in `handle()`, compare `event.sender.id` with the expected window's `webContents.id`; return `{ok:false, code:"FORBIDDEN", message:"Action non autorisée."}` and log the attempt. Mirror the check inside `enforceRawChannelGates` so the 38 raw channels inherit it.
- **Pre-fix tests:** none exist (that IS the finding).
- **Post-fix tests:** a forged sender on one guarded channel and one raw channel → `{ok:false, code:"FORBIDDEN"}` AND the handler body did not execute (assert no row was written).
- **Acceptance:** the E2E suite still passes in full (proving no legitimate call is broken); the two negative tests exist and fail without the fix.

### 2.3 — Capability gating for raw channels

- **Files:** `electron/ipc/raw-guards.ts`, `electron/ipc/license-gates.ts`
- **Implementation:** extend `enforceRawChannelGates` to consult `PAGE_GATED_CHANNELS` and `FEATURE_GATED_CHANNELS`, making `guardPrint`/`guardBackup` belt-and-braces rather than the only source.
- **Risk:** the raw path currently applies DIFFERENT capability rules; aligning them could change which editions can print or back up. Verify against the capability catalogue first.
- **Acceptance:** every channel's capability requirement is derivable from the single central table.

---

## Wave 3 — Data integrity (the money and stock core)

| #   | Fix                                                          | Finding                   | Priority reason                                                    |
| --- | ------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------ |
| 3.1 | Add quantity precision CHECK constraints                     | **DB-01 / STK-02** (P1)   | Makes the FIFO conservation invariant enforceable by the database. |
| 3.2 | Record the FIFO fallback cost provenance                     | **STK-03** (P2)           | Makes historical margin analysis trustworthy.                      |
| 3.3 | Add a stock reconciliation diagnostic                        | **STK-01** (P2)           | Makes stock drift detectable at all.                               |
| 3.4 | Add a DB CHECK tying a sale line's total to price × quantity | **MONEY-04 / DB-03** (P2) | Puts the last line-level invariant under the database.             |
| 3.5 | Make the migration lock additions-only                       | **DB-02** (P2)            | Prevents a drifted migration being laundered into a new fleet.     |

### 3.1 — Quantity precision

- **Files:** new migration `0064_quantity_precision_guards.sql`
- **Risk:** a CHECK that is too strict would REJECT legitimate existing data on a live retail database. **Validate the CHECK against a copy of a real database before applying**, and consider a grace path for pre-existing rows.
- **Dependencies:** none; must precede 3.3 so the diagnostic can rely on the invariant.
- **Owner skill:** veloria-db (with veloria-stock).
- **Pre-fix tests:** a temp DB seeded with fractional quantities (0.5, 1.25 kg) — the current schema accepts them, and the new CHECKs must not.
- **Post-fix tests:** inserting 0.0001 is rejected; inserting 0.25 is accepted; setting a layer remainder above its original is rejected.
- **Acceptance:** the migration applies cleanly on a temp DB and on a copy of a production-shaped DB; `verify:migrations` is green.

### 3.3 — Reconciliation diagnostic

- **Files:** `electron/ipc/handlers/inventory.repo.ts`, `electron/ipc/channels.ts`, `electron/ipc/registry.stock.ts`, `src/features/stock/**`
- **Implementation:** a read-only `stock.reconcile` channel returning, per divergent product: the aggregate quantity, the movement-derived quantity, and the FIFO-layer quantity; plus global counters for negative/over-consumed layers, consumptions without a source document and reversals without an original movement. Gate it behind the `settings` page and the staff `settings` permission — it exposes internal cost data.
- **Risk:** exposes cost information — the permission gating is not optional.
- **Acceptance:** a deliberately corrupted layer (in a temp DB) is reported for exactly that product.

### 3.5 — Additions-only migration lock

- **Files:** `scripts/database/verify-migrations.mjs`
- **Implementation:** the writer refuses to change or remove an already-locked file's checksum unless an explicit `--force-amend` is passed with a printed justification.
- **Acceptance:** mutating a locked migration and re-running the writer exits non-zero.

---

## Wave 4 — Governance reconciliation (the highest-leverage documentation fix)

| #   | Fix                                                                               | Finding                               | Priority reason                                                                             |
| --- | --------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| 4.1 | Reconcile the contract, the facts file and the sync skill with the implementation | **ORCH-01 / SYNC-01** (P1)            | One change fixes 3 findings and prevents a second, parallel customer-data path being built. |
| 4.2 | Decide and record the timezone policy                                             | **CLOS-01 / ORCH-02 / SKILL-02** (P2) | Currently a rule violated in three places with no recorded decision.                        |
| 4.3 | Generate the facts-to-verify file                                                 | **ORCH-03** (P2)                      | The file designed to prevent exactly these findings is inert.                               |
| 4.4 | Correct the hardware and observability skills                                     | **HW-01 / SKILL-06 / SKILL-07** (P2)  | They describe subsystems that do not exist in the form they describe.                       |
| 4.5 | Enforce the src↔electron mirror inventory mechanically                            | **ORCH-04** (P2)                      | Prevents a third silent copy.                                                               |

### 4.1 — Reconcile the governance layer

- **Files:** `governance/VELORIA_PROJECT_CONTRACT.md`, `governance/PROJECT_FACTS_TO_VERIFY.md`, `.opencode/skills/veloria-sync/SKILL.md`, `.opencode/skills/veloria-sync/references/google-sheets-bridge.md`, plus a new `docs/ADR-183-governance-reconciliation.md`
- **Priority:** The implementation is CORRECT (it follows an accepted ADR); only the instructions are wrong. This is the cheapest P1 in the register.
- **Risk:** low — no code changes. The risk is under-reach: the contract's INVARIANTS (offline-first, SQLite authority, no credentials in the renderer/APK, data minimisation) must be preserved verbatim; only the named technology and the threat model change.
- **Dependencies:** none. Can land immediately and in parallel with everything else.
- **Owner skill:** veloria-orchestrator (with veloria-sync).
- **Implementation:** in ONE change — update the contract §4, update the facts file row, rewrite the sync skill and rename its reference file, record the reconciliation in a new ADR. Do NOT change the implementation.
- **Acceptance:** `npm run verify:docs` is green; a new gate asserts every technology named as an approved architecture exists in the codebase or is marked as a direction.

### 4.2 — Timezone decision

- **Implementation:** choose (a) accept the fixed offset with an ADR + amend the three governing texts, or (b) implement the named-zone policy via `Intl.DateTimeFormat`. Option (a) is cheaper and currently correct; option (b) is future-proof. Either way, stop calling a fixed offset a "named timezone policy".
- **Risk (option b):** the SQL side uses a literal `'+1 hour'` modifier in ~6 helpers; a named-zone implementation would require computing the boundary in JS and passing it as a parameter, touching every report query. **Option (b) is a substantially larger change than it appears.**
- **Acceptance:** the business day for 22:59:59Z and 23:00:00Z is asserted by a test, computed both by the fixed offset and by the IANA zone.

### 4.3 — Generate the facts file

- **Implementation:** a script that derives each of the 22 rows from the code (money scale from `MINOR_PER_MAJOR`, FK/WAL state from `applyPragmas`, the channel count from `channels.ts`, the migration count from the migrations directory, the licence algorithm from `protocol.ts`), with a `verify:docs` gate that fails when the generated file is stale — the pattern already proven by `docs/METRICS.md`.

---

## Wave 5 — Backup, release and hardware

| #   | Fix                                                | Finding                   | Priority reason                                                  |
| --- | -------------------------------------------------- | ------------------------- | ---------------------------------------------------------------- |
| 5.1 | Verify-then-promote the automatic backup           | **BACK-01** (P2)          | A corrupt backup currently occupies a retention slot undetected. |
| 5.2 | Add a per-backup checksum manifest                 | **BACK-02** (P2)          | Makes corruption detectable before it is needed.                 |
| 5.3 | Free-space check before a backup                   | **BACK-03** (P2)          | A full disk currently yields a generic error.                    |
| 5.4 | Document the backup inclusion/exclusion contract   | **BACK-04** (P2)          | Prevents a future extension capturing a credential.              |
| 5.5 | Add a packaging CI job                             | **REL-03** (P2)           | The packaged runtime is currently unverified.                    |
| 5.6 | Stamp the source revision into the artefact        | **REL-04** (P3)           | Support traceability.                                            |
| 5.7 | Run and record a physical hardware acceptance pass | **HW-02 / PRINT-02** (P2) | The only findings the software cannot detect.                    |

### 5.1 / 5.2 — Backup integrity

- **Files:** `electron/backup/backup.service.ts`
- **Implementation:** write to `.pending-<stamp>.vposdb`, run the EXISTING `verifyDbFileCopy()` on it, then atomically rename to the final name; write a sidecar manifest with `{createdAt, appVersion, schemaVersion, sizeBytes, sha256}`; verify on listing and refuse to restore a mismatched backup.
- **Risk:** low — `verifyDbFileCopy` already exists and is proven by the restore path. The atomic rename must be on the same volume (it is).
- **Post-fix tests:** the negative proof the skill demands — corrupt a disposable backup and assert the listing marks it and the restore refuses it.
- **Acceptance:** a truncated backup never occupies a retention slot; a corrupt backup is visibly marked and cannot be restored.

### 5.7 — Physical acceptance

- **This requires hardware and cannot be automated.** It is scheduled work, not code.
- **Deliverable:** `docs/reports/HARDWARE_ACCEPTANCE.md` recording, per supported printer model: model, driver, connection, paper width, the test documents used, expected vs observed output, the scan result, and any calibration. Attach photographs.
- **Also:** state the SUPPORTED device list explicitly. The hardware skill currently implies four device classes; only two exist.

---

## Wave 6 — Testing, observability and UX

| #    | Fix                                                    | Finding                               | Priority reason                                          |
| ---- | ------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------- |
| 6.1  | Add contract-level tests for money and closing         | **MONEY-02 / GATE-03 / CLOS-03** (P2) | Parity proves agreement, not correctness.                |
| 6.2  | Complete the client-orders domain tests                | **SLICE-01 / GATE-02** (P1)           | Unblocks `npm run ci`.                                   |
| 6.3  | Add a log redaction layer and its test                 | **OBS-01 / SEC-06** (P2)              | The privacy rule is convention-only.                     |
| 6.4  | Add a support-bundle export with a preview             | **OBS-02** (P2)                       | Makes the redaction review natural.                      |
| 6.5  | Add an accessibility gate                              | **UI-03** (P2)                        | 265 manual aria attributes deserve protection.           |
| 6.6  | Add the sync backoff and failure taxonomy              | **SYNC-02** (P2)                      | A transient outage can become sustained.                 |
| 6.7  | Prove the per-customer isolation with an executed test | **SYNC-03** (P2)                      | A release-blocker-class property asserted only in prose. |
| 6.8  | Make the E2E command self-sufficient locally           | **GATE-05** (P3)                      | Restores trust in the E2E gate.                          |
| 6.9  | Extract a shared async-panel component                 | **UI-01** (P2)                        | Consolidates the state matrix.                           |
| 6.10 | Compare printed amounts to persisted totals            | **PRINT-01** (P2)                     | A ticket is a financial document.                        |

### 6.1 — Contract tests

- **Files:** new `tests/unit/money-contract.test.ts`, new `tests/integration/closing-scenarios.test.ts`
- **Implementation:** assert the DOCUMENTED behaviour directly — the three documented rounding examples (`10.005 → 1001`, `10.0049999 → 1000`, `2.675 → 268`), the rejected-input list (`1e3`, `0x10`, `+7`, `1,2,3`), the boundary values at and just outside `MAX_MINOR_SINGLE`, the conservation property, and the nine closing scenarios from the skill reference.
- **Rationale:** these assert the CONTRACT, not the mirror, so a coordinated change to both implementations still fails.
- **Acceptance:** a deliberate change to `Math.round` → `Math.floor` in the money module fails the contract test even if the mirror is changed to match.

### 6.2 — Client-orders tests

- **Implementation:** as SLICE-01 states. The **mirror test against the SQL trigger** is the valuable one.
- **Acceptance:** `npm run test:coverage` exits 0 with no threshold change.

---

## Dependency graph (execution order)

```
Wave 0  GATE-01 ──────────────────────────────► (release pipeline unblocked)
            │
            ├─ 0.2/0.3 REL-01, REL-02 ────────► (signed release possible)

Wave 1  LIC-04 ──► LIC-02 (rotation safe) ────► (licence control restored)
        SYNC-04 + BACK-04 ────────────────────► (credential protected)

Wave 2  SEC-01 ──► GATE-04 ───────────────────► (boundary enforced + permanent)
        ELEC-05 (independent)

Wave 3  DB-01 ──► STK-01 ────────────────────► (invariant enforceable, then observable)
        STK-03, MONEY-04, DB-02 (independent)

Wave 4  ORCH-01 ───────────────────────────────► (instructions correct)
        CLOS-01, ORCH-03, HW-01, ORCH-04 (independent)

Wave 5  BACK-01 ──► BACK-02 ───────────────────► (image verified, then manifest)
        REL-03, REL-04, HW-02 (independent)

Wave 6  MONEY-02 ──► CLOS-03 ──────────────────► (contract then mirror proof)
        SLICE-01, OBS-01 ──► OBS-02 ─────────► (redaction then bundle)
        SYNC-02, SYNC-03, UI-03, PRINT-01 (independent)
```

---

## Consolidation by category (for the release owner)

| Category                | Findings                                                                                                                              | Fixes | First action                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------- |
| **Security**            | SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, ELEC-04, ELEC-05, SYNC-03, SYNC-04, OBS-01, PRINT-04                                  | 12    | Wave 1 (credentials) + Wave 2 (IPC)      |
| **Data Integrity**      | DB-01, DB-02, DB-03, STK-01, STK-02, STK-03, STK-05, MONEY-04                                                                         | 8     | Wave 3                                   |
| **Financial Integrity** | MONEY-01, MONEY-02, MONEY-03, MONEY-05, CLOS-01, CLOS-02, CLOS-03, CLOS-04, CLOS-05, PRINT-01                                         | 10    | Wave 3 + Wave 6                          |
| **Architecture**        | ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05, SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05, SKILL-06, SKILL-07, SLICE-02, SLICE-03 | 14    | Wave 4                                   |
| **Licensing**           | LIC-02, LIC-03, LIC-04, LIC-05                                                                                                        | 4     | Wave 1                                   |
| **Synchronization**     | SYNC-01, SYNC-02, SYNC-03, SYNC-04                                                                                                    | 4     | Wave 1 + Wave 6                          |
| **Backup**              | BACK-01, BACK-02, BACK-03, BACK-04                                                                                                    | 4     | Wave 5                                   |
| **Printing**            | PRINT-01, PRINT-02, PRINT-03, PRINT-04                                                                                                | 4     | Wave 5 + Wave 6                          |
| **Release**             | REL-01, REL-02, REL-03, REL-04, GATE-01                                                                                               | 5     | Wave 0                                   |
| **UI/UX**               | UI-01, UI-02, UI-03, UI-04                                                                                                            | 4     | Wave 6                                   |
| **Tests**               | GATE-02, GATE-03, GATE-04, GATE-05, SLICE-01                                                                                          | 5     | Wave 6                                   |
| **Performance**         | —                                                                                                                                     | 0     | `verify:perf` is green on every hot path |
| **Maintenance**         | STK-04, ELEC-06, ELEC-07, MONEY-03, MONEY-05                                                                                          | 5     | opportunistic                            |

---

## Global acceptance criteria for the remediation programme

1. `npm run license:scan` → exit 0, with both negative proofs still failing correctly.
2. `npm run test:coverage` → exit 0, with no threshold lowered and no file excluded.
3. `npm run test:e2e` → exit 0 on a clean machine with no manual setup.
4. `npm run ci` → exit 0 end to end.
5. `npm run package:win` → produces an installer whose Authenticode status is `Valid`, whose SHA-256 matches the published manifest, and which installs on a clean Windows profile with the user's data preserved.
6. A licence issued on the rotated keypair activates; a licence signed by an unknown key does not.
7. No private key matching the shipped public key exists in any developer tree or in the repository.
8. A forged IPC sender is rejected, proven by a test that fails without the fix.
9. A corrupted backup is detected before it is needed and refused at restore.
10. The contract, the facts file and the skills agree with the implementation, and a machine gate keeps them agreeing.
11. A physical acceptance record exists for every supported printer and scanner.
12. The financial core is unchanged: 1497 tests still pass, the money allocation still conserves exactly, and no money or stock invariant was weakened in the process.
