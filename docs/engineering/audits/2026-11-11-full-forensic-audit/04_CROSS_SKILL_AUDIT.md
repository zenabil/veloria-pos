# 04 — CROSS-SKILL AUDIT

**Audit ID:** `2026-11-11-full-forensic-audit`
**Method:** after all 17 skill audits were completed independently, the findings were cross-examined for: shared root causes, contradictory conclusions, missing inter-layer tests, divergent business logic between layers, and unsafe data flows that no single skill owns.

## 1. Verdict

The 17 skills are **mostly mutually consistent**, and where they overlap they agree. This is unusual and valuable — the skills do not contradict each other, and the implementation follows them.

**The single systemic pattern the cross-skill view reveals is a DOCUMENTATION-LAYER DRIFT that no single skill owns.** Three separate governing artefacts (the project contract, the facts-to-verify file, and the v2.0.0 skills bundle) have diverged from the implementation in the same direction: they describe an older or intended architecture rather than the shipped one. Because the drift is spread across three artefact families, no individual skill audit would catch it — it only becomes visible when the orchestrator, sync, db and closing audits are read together.

The second pattern is **defence-in-depth gaps**: several critical controls are individually present and correct, but the layer that should catch the failure of the layer below is missing (no negative-proof gate for IPC, no reconciliation diagnostic for stock, no redaction layer for logs).

## 2. The required cross-skill matrix

| Pair                          | Area audited                      | Result                                                                                                                                                                                                      | Shared finding                                                               |
| ----------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **DB ↔ Money**                | Amount integrity and transactions | **CONSISTENT** — money columns are INTEGER (99/99, machine-verified); the money domain and its main-side mirror agree under a parity test; DB CHECKs back the application guards                            | MONEY-02 (no contract-level test — parity proves agreement, not correctness) |
| **DB ↔ Stock**                | Stock/schema consistency          | **CONFLICT (minor)** — quantity columns are NUMERIC (float affinity) while money columns are INTEGER; the asymmetry is inconsistent with the schema's own "money purity" standard                           | DB-01, STK-02                                                                |
| **Money ↔ Stock**             | COGS and cost of goods            | **CONSISTENT** — COGS comes from the FIFO layers actually consumed (`sale_fifo_consumption`), never from the catalogue purchase price; the below-cost flag compares against the real line COGS              | STK-03 (fallback cost provenance not recorded)                               |
| **Electron ↔ Security**       | IPC and privileged operations     | **GAP** — the gates are all in trusted code (licence/staff/credit), but no handler validates the sender frame, so the IPC boundary is the only layer missing                                                | ELEC-04, SEC-01                                                              |
| **UI ↔ Slice**                | Feature completeness              | **CONSISTENT** — 26 of 27 feature areas are complete end to end; the single PARTIAL is the in-flight client-orders slice, and its gap is a test gap, not a missing layer                                    | SLICE-01                                                                     |
| **Slice ↔ Gates**             | Implementation safety and tests   | **CONSISTENT but RED** — the slice work is complete and the gates correctly detect its one shortfall; the gates themselves are green except for the two failures                                            | GATE-01, GATE-02                                                             |
| **Closing ↔ Money**           | Account reconciliation            | **CONSISTENT** — the Z formula uses integer centimes throughout, the domain and repository mirrors agree, and the double-counting guards are explicit NOT EXISTS clauses                                    | CLOS-03 (mirror not confirmed tested)                                        |
| **Closing ↔ Stock**           | Inventory valuation and profit    | **CONSISTENT** — `fifoValuation()` uses remaining layers only; the zakat base uses it; COGS in the profit path uses consumed layers                                                                         | STK-01 (no reconciliation diagnostic to prove the two agree in a live DB)    |
| **License ↔ Security**        | Activation protection             | **GAP** — the cryptographic design is correct, but the vendor private key matching the SHIPPED public key is on this machine, and the release artefacts are unsigned                                        | LIC-02, SEC-02, REL-01                                                       |
| **Sync ↔ DB**                 | Data integrity and duplication    | **CONSISTENT** — the outbox is a projection with operationId idempotency; the DB side uses RESTRICT (not CASCADE) on the access and outbox tables so a deletion cannot silently destroy queued transactions | SYNC-02 (no per-row backoff or attempt counter)                              |
| **Sync ↔ Security**           | Customer data isolation           | **STRONG** — RLS deny-by-default with explicit REVOKE; the Edge Function is the only reader; the APK's anon key is worthless; the ambiguity case fails closed                                               | SYNC-03 (not proven by an executed test), SEC-03                             |
| **Release ↔ Electron**        | Packaged application safety       | **GAP** — the packaged configuration is correct, but no artefact is ever produced or installed by the pipeline, so the packaged runtime is unverified                                                       | REL-03                                                                       |
| **Release ↔ Hardware**        | Device compatibility              | **GAP** — no physical acceptance record exists for any printer, and the installer acceptance tests self-skip                                                                                                | HW-02, PRINT-02                                                              |
| **Backup ↔ DB**               | Recoverability                    | **CONSISTENT but asymmetric** — the DB side demands a fail-closed pre-migration snapshot (excellent); the backup side does not verify the image it produces (BACK-01) and keeps no checksum (BACK-02)       | BACK-01, BACK-02                                                             |
| **Printing ↔ Money**          | Ticket/invoice reconciliation     | **GAP (structural, not numerical)** — the amounts ARE the persisted values, so divergence is very unlikely; but no automated assertion compares the rendered document to the DB row                         | PRINT-01                                                                     |
| **Observability ↔ Security**  | Data protection in logs           | **GAP** — the log writer is a pass-through with no sanitiser and no redaction test; there is no support-bundle export that would force a redaction review                                                   | OBS-01, OBS-02                                                               |
| **Gates ↔ Security**          | Negative proof                    | **GAP** — the gate suite has five real negative proofs, but not the two the skill's own reference names (wrong sender, corrupted backup) — which is precisely why the sender-validation defect survived     | GATE-04, SEC-04                                                              |
| **Orchestrator ↔ Sync**       | Governance vs implementation      | **CONFLICT** — the contract and the sync skill name Google Sheets; the code implements Supabase under an accepted ADR                                                                                       | ORCH-01, SYNC-01                                                             |
| **Orchestrator ↔ DB/Closing** | Timezone policy                   | **CONFLICT** — three governing texts forbid the hardcoded UTC+1; the code hardcodes it                                                                                                                      | ORCH-02, CLOS-01, SKILL-02                                                   |
| **Hardware ↔ Printing**       | Device contract                   | **GAP** — the hardware skill prescribes an adapter layer that does not exist; printing works but has no device abstraction                                                                                  | HW-01, SKILL-06                                                              |

## 3. Shared root causes

### 3.1 RC-1 — The governance layer was never updated after the architecture changed (drives 5 findings)

**Findings**: ORCH-01, ORCH-02, ORCH-03, SYNC-01, SKILL-01, SKILL-02, SKILL-06, SKILL-07.

One cause, eight symptoms. Three artefact families describe an intended state:

- `governance/VELORIA_PROJECT_CONTRACT.md` (v2.0.0) — says Google Sheets;
- `governance/PROJECT_FACTS_TO_VERIFY.md` — never filled in (all 22 rows "Must verify"), so it corrects nothing;
- `.opencode/skills/**` (v2.0.0) — generated from the contract, so it inherits the error.

Meanwhile the implementation moved on: ADR-053 (2026-09-29) replaced Sheets with Supabase; convention E-35 replaced the named timezone with a fixed offset; the print surface replaced a hypothetical adapter layer with direct Electron APIs; the observability target state (health indicators, support bundle) was never built.

**Why this is one cause and not four**: in each case the same mechanism produced the gap — an artefact was written at time T describing intent at time T, the implementation advanced, and nothing reconciles the two. `docs/METRICS.md` proves the project already knows how to prevent this: it is GENERATED and machine-verified by `verify:docs`. The three stale artefacts are hand-maintained and unverified.

**Single fix that addresses all**: introduce a generated, machine-verified "current architecture facts" file (the same pattern as METRICS.md), and make the contract and the skills reference it rather than restate it.

### 3.2 RC-2 — The absence of a negative-proof gate lets a control gap persist unnoticed (drives 4 findings)

**Findings**: ELEC-04 / SEC-01 (no sender validation), BACK-01 / BACK-02 (no backup verification at creation), GATE-04, SEC-04.

The project has five genuine negative proofs — the migration sha256 lock, the raw-channel coverage test, the FR non-vacuity floor, the domain transaction/operationId static analysis, and the DB CHECK/trigger invariants. They all protect against the failure mode they were built for. But the two the gates skill explicitly names — wrong sender, corrupted backup — are absent, and those are exactly the two areas where a gap exists (no sender validation; no verification of the produced backup).

The pattern is coherent: **a control that is not proven by a failing test will eventually be absent.** This is the gates skill's core thesis, and the project demonstrates both sides of it — the migration lock is protected by a negative proof, so nobody could quietly edit an applied migration; the sender check has no negative proof, so it can be absent indefinitely without any signal.

### 3.3 RC-3 — The physical world is outside every automated gate (drives 4 findings)

**Findings**: HW-02, PRINT-02, REL-03, PRINT-01.

Printing width, barcode scannability, cut/feed, the packaged installer's ability to find its native module and its resources, and whether a printed total equals the stored total — none of these can be asserted by the current test suite. The one defect the project knows about (Chromium defaulting to A4 on thermal drivers) was found via a customer report on 2026-10-22, not by a pre-release check.

This is not a code defect; it is a **process gap**, and it is the one place where the audit found a defect that the software itself cannot detect.

### 3.4 RC-4 — Business rules are protected by PARITY rather than by CONTRACT (drives 4 findings)

**Findings**: MONEY-02, GATE-03, CLOS-03, ORCH-04.

The src↔electron duplication is protected by parity tests — the two implementations must AGREE. Nothing asserts that either is CORRECT against a written contract. A coordinated change to both twins (a plausible maintenance action) passes every gate while violating the documented rule.

The project already has the missing artifact in one place: `src/domain/money/money.ts:180` documents "10.005 → 1001, pas 1000" — a precise, testable contract statement that no test asserts.

## 4. Divergent business logic between layers

| Logic                 | Layer A                                | Layer B                                           | Divergence                                                                                                                                        |
| --------------------- | -------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money caps            | `src/domain/money/money.ts`            | `electron/ipc/money-guard.ts`                     | **None found** — parity test green                                                                                                                |
| Business day          | `src/domain/common/business-day.ts`    | `electron/shared/business-day.ts`                 | **None found** — parity test green                                                                                                                |
| Return settlement     | `src/domain/returns/return-rules.ts`   | `electron/ipc/handlers/return-settlement.ts`      | **None found** — parity test green                                                                                                                |
| Order state machine   | `src/domain/order/client-order.ts`     | SQL trigger `trg_client_orders_status_transition` | **UNVERIFIED** — the module claims an "EXACT MIRROR"; no executed test proves the trigger and the twin agree (SLICE-01)                           |
| Closing formula       | `src/domain/closings/closing-rules.ts` | `electron/ipc/handlers/finance.repo.ts`           | **UNVERIFIED** — the parity claim rests on a test file whose relevance was not established (CLOS-03)                                              |
| Customer access / PIN | `src/domain/customer/client-access.ts` | `cloud/supabase/functions/client-sync/index.ts`   | **None found** — the Edge Function documents the mirroring requirement and uses the same PBKDF2 parameters (100 000 iterations, SHA-256, 256-bit) |

**Two divergences are unverified rather than proven.** Both are the same shape: a rule that exists in two places (or in code and in SQL) with a "mirror" claim and no executable proof of the mirror.

## 5. Unsafe or unverified data flows

| Flow                             | Risk                                                                           | Owner               | Status                                  |
| -------------------------------- | ------------------------------------------------------------------------------ | ------------------- | --------------------------------------- |
| Renderer → IPC                   | No sender validation; a compromised renderer inherits the full channel surface | Electron / Security | **OPEN** (SEC-01)                       |
| Renderer → DB                    | Zero native imports; the renderer cannot touch the DB                          | DB                  | **CLOSED**                              |
| DB → backup file                 | Image written to the final name without verification; no checksum              | Backup              | **OPEN** (BACK-01, BACK-02)             |
| DB → mirror                      | Per-customer projections only; RLS deny-by-default                             | Sync / Security     | **CLOSED** (SYNC-03 unverified by test) |
| Local disk → mirror credential   | `service_role` bearer key in a local document                                  | Sync / Security     | **OPEN** (SEC-03)                       |
| Vendor key → shipped public key  | The matching private key is on the build machine                               | License / Security  | **OPEN** (LIC-02)                       |
| Business data → log file         | No sanitiser; correctness by convention                                        | Observability       | **OPEN** (OBS-01)                       |
| Business data → printed document | Amounts are the persisted values; no equality assertion                        | Printing / Money    | **LOW RISK** (PRINT-01)                 |
| Business data → template         | Template HTML injected into an isolated, preload-free print window             | Printing / Security | **CLOSED** (PRINT-04 refuted)           |
| Physical printer → cashier       | No acceptance record                                                           | Hardware / Printing | **OPEN** (HW-02)                        |

## 6. Missing tests BETWEEN modules

| Missing inter-module test                       | Consequence                                             | Priority                    |
| ----------------------------------------------- | ------------------------------------------------------- | --------------------------- |
| Domain twin ↔ SQL trigger (order state machine) | A UI transition the DB rejects, or vice versa           | **High** (SLICE-01)         |
| Domain twin ↔ main mirror, closing formula      | A coordinated change to both passes every gate          | **High** (CLOS-03, GATE-03) |
| IPC wrong-sender rejection                      | The sender-validation gap persists                      | **High** (SEC-04, GATE-04)  |
| Backup image corruption → restore refusal       | Backup corruption is discovered only at restore time    | **High** (BACK-01)          |
| Printed amounts ↔ DB row                        | A ticket defect becomes a customer dispute              | **Medium** (PRINT-01)       |
| Stock aggregate ↔ movement ledger ↔ FIFO layers | A divergence is invisible without a diagnostic          | **Medium** (STK-01)         |
| Owner snapshot totals ↔ in-app Z report         | The owner sees two different numbers for one day        | **Medium** (CLOS-04)        |
| Customer A ↔ customer B isolation (executed)    | A future permissive RLS policy would leak data silently | **Medium** (SYNC-03)        |
| Log redaction fixtures                          | A careless call site persists sensitive data            | **Medium** (OBS-01)         |

## 7. Integration risks

| Risk                                                                                                                                                | Likelihood                                         | Impact                                             | Mitigation owner            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| A future contributor implements the Google Sheets bridge described by the contract and the sync skill, in parallel with the working Supabase mirror | **High** — the instructions explicitly describe it | **High** — a second data path over customer data   | Orchestrator (ORCH-01)      |
| The `license:scan` failure is "fixed" by weakening the scanner rather than by narrowing the scope                                                   | Medium — the gate is blocking a release            | **High** — the secret-detection blind spot returns | Gates (GATE-01)             |
| The vendor private key leaks from this machine                                                                                                      | Medium — it is on a dev workstation                | **High** — licence control becomes nominal         | License / Security (LIC-02) |
| A DST change in Algeria shifts every business-day boundary                                                                                          | Low today                                          | **High** — financial periods mis-dated             | DB / Closing (ORCH-02)      |
| The unsigned installer is blocked by a customer's endpoint policy                                                                                   | **High** — SmartScreen and WDAC are ubiquitous     | **High** — the product cannot be installed         | Release (REL-01)            |
| A future `src/application/` use case is added without a main-side counterpart                                                                       | Medium                                             | Low                                                | Orchestrator (ORCH-04)      |

## 8. What the cross-skill view confirms as genuinely strong

- **Layer discipline holds everywhere it was checked.** renderer→main→database, main→mirror, and vendor→POS are all clean.
- **The five P1 findings are not code-quality problems** — they are a governance contradiction, a key-custody exposure, a missing sender validation, and an unsigned binary. None is a defect in the money, stock or closing arithmetic, which is where a POS usually breaks.
- **The financial core is the strongest area of the codebase**: integer centimes, a single authoritative domain module, a parity-tested mirror, exact allocation conservation (proven by 200 000 fuzz cases), ledger-based Z reporting with explicit anti-double-count guards, and DB-level invariants behind both.
- **The offline-first property is architectural.** No core operation contains a network call, and the mirror is a projection with claim-before-send idempotency.
- **The gate suite is real.** 1497 tests, 53 E2E against the actual application, and five genuine negative proofs.

## 9. Cross-skill metrics

| Metric                                       | Value                           |
| -------------------------------------------- | ------------------------------- |
| Pairs audited                                | 20 (16 required + 4 additional) |
| Pairs CONSISTENT                             | 9                               |
| Pairs with a GAP                             | 8                               |
| Pairs in CONFLICT                            | 3                               |
| Shared root causes identified                | 4                               |
| Divergences between mirrored implementations | 0 confirmed, 2 unverified       |
| Unsafe data flows                            | 10 (3 CLOSED, 7 OPEN)           |
| Missing inter-module tests                   | 9                               |
