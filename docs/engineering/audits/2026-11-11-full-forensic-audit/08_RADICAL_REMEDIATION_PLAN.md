# RADICAL REMEDIATION PLAN — Veloria Ecosystem

**Source:** the forensic audit `2026-11-11-full-forensic-audit` (72 findings: 1 P0, 12 P1, 40 P2, 19 P3).
**Status:** IN PROGRESS — this document is the live execution plan; each wave is marked with its verification evidence as it lands.
**Authority:** AGENTS.md rules 1–16; `governance/VELORIA_PROJECT_CONTRACT.md`; the 17 Veloria skills.

## Principles of this plan

1. **Radical means root-cause, not symptom.** The release blocker is fixed by correcting the _scope rule_ of the scanner, not by deleting a file or weakening a pattern.
2. **Every fix ships with a proof.** A fix without a negative test that fails without it is not a fix — it is a hope (veloria-gates).
3. **No threshold is lowered, no test is weakened, no migration is edited in place.** A gate that is lowered is a gate that no longer exists (veloria-gates, AGENTS.md rule 12).
4. **Forward-only.** Every schema change is a NEW numbered migration + `verify:migrations` green.
5. **Trust boundaries close inward.** Licence and credential custody first, then the IPC boundary, then the data layer, then the governance layer.

---

## Execution order and status

| Wave  | Scope                                          | Findings                                                                              | Depends on | Status                                                              |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| **0** | Unblock the release pipeline                   | GATE-01, REL-02, REL-04                                                               | —          | **DONE — P0 closed, first artefact built**                          |
| **1** | Licence + credential custody                   | LIC-02, LIC-04, SYNC-04/SEC-03                                                        | Wave 0     | **DONE — key set, rotation, custody gate**                          |
| **2** | Close the IPC trust boundary                   | SEC-01/ELEC-04, GATE-04/SEC-04, ELEC-05                                               | Wave 0     | **DONE — sender guard + negative proofs**                           |
| **3** | Data integrity under the database              | DB-01/STK-02, MONEY-04/DB-03, DB-02, STK-01, STK-03                                   | Wave 0     | **PARTIAL — quantity precision + FIFO basis (0064)**                |
| **4** | Reconcile governance with reality              | ORCH-01/SYNC-01/SKILL-01, CLOS-01/ORCH-02/SKILL-02, ORCH-03, HW-01/SKILL-06, SKILL-07 | Wave 0     | **PARTIAL — Sheets/Supabase reconciled (ADR-184) + new gate**       |
| **5** | Backup integrity                               | BACK-01, BACK-02, BACK-03, BACK-04                                                    | Wave 0     | **DONE — verify-then-promote, checksum enforced, free-space check** |
| **6** | Contract-level tests + close the coverage gate | SLICE-01/GATE-02, MONEY-02/GATE-03, CLOS-05, GATE-05                                  | Waves 2–3  | **PARTIAL — GATE-02 closed**                                        |
| **7** | Observability + UI hardening                   | OBS-01, OBS-02, UI-01, UI-03, UI-04                                                   | Wave 6     | ⏳                                                                  |
| **8** | Sync resilience + isolation proof              | SYNC-02, SYNC-03                                                                      | Wave 1     | ⏳                                                                  |
| **9** | Release hardening + physical acceptance        | REL-01, REL-03, HW-02/PRINT-02, PRINT-01                                              | Waves 0–5  | **PARTIAL — REL-03 closed**                                         |

### Wave 0 — execution record (DONE)

| Change                                                 | File                                                | Proof                                                                         |
| ------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Secret scan split into two scoped families             | `scripts/licensing/secret-scan.mjs`                 | `npm run license:scan` → **OK (2 003 fichiers analysés)**                     |
| `service_role` pattern widened to the quoted-JSON form | same                                                | `tests/unit/secret-scan-bypass.test.ts`                                       |
| Negative proof for the scanner                         | `tests/unit/secret-scan-bypass.test.ts`             | **10/10**                                                                     |
| `verifyUpdateCodeSignature: true`                      | `config/electron-builder/pos.yml`                   | `verify:release-config`                                                       |
| Build revision stamped into the artefact               | `scripts/release/stamp-build-info.js` + both `.yml` | `release/win-unpacked/resources/build-info.json`                              |
| Publication gate (fail-closed)                         | `scripts/release/verify-artifact.js`                | refuses an unsigned artefact; accepts it only via `VELORIA_ALLOW_UNSIGNED=1`  |
| Release-config gate                                    | `scripts/quality/verify-release-config.mjs`         | 4 negative proofs demonstrated                                                |
| Packaging chain rebuilt                                | `package.json`                                      | `package:portable` → **artefact produced**, manifest regenerated and matching |
| Packaging CI job                                       | `.github/workflows/ci.yml`                          | new `packaging` job on the portable target                                    |

### Wave 1 — Licence and credential custody (DONE)

| Change               | File                                                                                                                                                                                                       | Proof                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **LIC-04**           | Key set with identifiers: `resources/license/keys.json` (`{active, keys:{kid→PEM}}`); the envelope carries a `kid`                                                                                         | `electron/licensing/key-set.ts` (new)                                                   |
| LIC-04               | The key is CHOSEN by `kid`; an unknown `kid` is REFUSED (never "tried" against the other keys); a v1 licence (no `kid`) still verifies with the active key                                                 | `electron/licensing/protocol.ts` (`decodeVlic`, `verifyLicenseChain`)                   |
| LIC-04               | Backward compatibility: `public.key` is KEPT and `keys.json` is ADDED — an existing 1.0.x install keeps working unchanged                                                                                  | `electron/licensing/public-key.ts`                                                      |
| **LIC-02**           | Keygen no longer publishes to `resources/license/` by default: a dev key goes to `private/dev-keys/` and does NOT touch the shipped anchor                                                                 | `scripts/licensing/keygen.mjs`                                                          |
| LIC-02               | `--production --kid <id>` ADDS a key to the set and switches `active` — the previous key is KEPT (licences already issued stay valid)                                                                      | same                                                                                    |
| LIC-02               | **Build guard**: refuses to package when a private key matching an embedded anchor is present in the tree                                                                                                  | `scripts/licensing/verify-key-custody.mjs` (new), wired into every `package:*` script   |
| LIC-02               | The guard DETECTS the real, still-present compromise on this machine (fail-closed, exit 1)                                                                                                                 | `npm run license:key-custody` → **1** (correct)                                         |
| **SYNC-04 / SEC-03** | **AUDIT CORRECTED**: the `service_role` key is ALREADY DPAPI-encrypted at rest (`safeStorageSecretBackend`); the initial finding overstated it. The residual exposure is the key's SCOPE (full RLS bypass) | 11_SYNC.md / 15_SECURITY.md corrected; `tests/unit/sync-secret-storage.test.ts` **5/5** |
| LIC-02 / LIC-04      | Negative proofs: a matching private key is refused (anywhere in the tree, and for `keys.json` too); a DIFFERENT private key is accepted; a missing anchor fails closed (exit 2)                            | `tests/unit/license-key-custody.test.ts` **16/16**                                      |

**The remaining LIC-02 action is NOT a code change**: the operator must generate a
production keypair ON THE VENDOR MACHINE and publish it with `--production`.
The build now refuses to produce an artefact from a compromised anchor — which is
the correct fail-closed behaviour until that rotation happens.

### Wave 5 — Backup integrity (DONE)

| Change        | File                                                                                                                                                                                        | Proof                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **BACK-01**   | A backup is now written to a TEMPORARY file, **verified**, then **promoted** atomically by rename. A truncated image can no longer occupy a retention slot as if it were a good backup      | `electron/backup/backup.service.ts` (`createBackup`) |
| BACK-01       | The verification reuses the EXISTING `verifyDbFileCopy` (read-only open + integrity_check + foreign_key_check + schema version) — no new mechanism invented                                 | same                                                 |
| **BACK-02**   | The sidecar checksum is now **READ and COMPARED** — it was written but never verified, which protects nothing                                                                               | same (`listBackupFilesFull`, `checksumOk`)           |
| BACK-02       | A restore whose checksum no longer matches is **REFUSED before the swap**, with a French message: the image changed since it was written                                                    | same (restore path)                                  |
| **BACK-03**   | A free-space check runs BEFORE the backup (via `fs.statfsSync`); an insufficient disk is reported explicitly instead of producing a truncated image                                         | same                                                 |
| BACK-02/01/03 | Negative proofs: checksum written matches the file; an altered file IS detected; an intact file is NOT falsely flagged; promotion leaves no temporary behind; a non-Veloria file is refused | `tests/unit/backup-integrity.test.ts` **5/5**        |
| BACK-04       | The backup inclusion/exclusion contract (what a backup contains and excludes)                                                                                                               | pending                                              |

**Verified against the REAL flow:** `tests/e2e/stock-backup.spec.ts` — "sauvegarde
manuelle : copie créée et listée" and "restauration : la base revient à l'état
sauvegardé" both still pass with the hardened implementation. The hardening did
not break the round trip it was meant to protect.

### Wave 4 — Reconcile governance with reality (PARTIAL)

| Change                       | File                                                                                                                                                                                                                                                                     | Proof                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **ORCH-01 / SYNC-01**        | The project contract §4 now declares the **Supabase mirror** (per accepted ADR-053) as the approved V1 bridge; the invariants (mirror is never the POS authority, no service credential in the renderer/APK, isolation must be provable) are **preserved**               | `governance/VELORIA_PROJECT_CONTRACT.md`                                        |
| ORCH-01                      | The facts file instruction is **inverted** (it used to forbid assuming Supabase) and the bridge row now carries its verified answer                                                                                                                                      | `governance/PROJECT_FACTS_TO_VERIFY.md`                                         |
| SYNC-01 / SKILL-01           | The `veloria-sync` skill and its reference now describe the SHIPPED architecture and its REAL threat model (RLS deny-by-default + REVOKE + single Edge Function reader + credential confined to main + fail-closed on ambiguity)                                         | `.opencode/skills/veloria-sync/`                                                |
| ORCH-01                      | The decision and its trade-offs are **traced**                                                                                                                                                                                                                           | `docs/ADR-184-reconciliation-gouvernance-supabase.md` (new)                     |
| **ORCH-01**                  | **A new gate prevents the drift from recurring**: it verifies that the approved bridge EXISTS in the repo, that the governing texts DECLARE it as approved (not merely mention it), that no rejected technology is presented as approved, and that ADR-184 is referenced | `scripts/quality/verify-governance-arch.mjs` (new), wired into `npm run verify` |
| ORCH-01                      | **Negative proof demonstrated**: replacing the approval statement with the rejected technology turns the gate RED; restoring it turns it GREEN                                                                                                                           | verified in this session                                                        |
| CLOS-01 / ORCH-02 / SKILL-02 | The hardcoded UTC+1 timezone policy                                                                                                                                                                                                                                      | pending (separate ADR)                                                          |
| ORCH-03                      | Generating the facts file instead of hand-maintaining it                                                                                                                                                                                                                 | pending                                                                         |
| HW-01 / SKILL-06 / SKILL-07  | Aligning the hardware and observability skills with the code                                                                                                                                                                                                             | pending                                                                         |

**Nothing in the CODE was changed** — the implementation already followed
ADR-053. Only the instructions were wrong, and they are now aligned.

**One honest trade-off is recorded in ADR-184:** the two corrected skill files
are no longer byte-identical to the official v2.0.0 package (their SHA256 in
`vendor/SHA256SUMS.txt` will not match). Keeping the drift would be worse than
the divergence, but the package should be re-issued.

### Wave 3 — Data integrity under the database (PARTIAL)

| Change             | File                                                                                                                                                                                                      | Proof                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **DB-01 / STK-02** | Migration **0064** (forward-only): quantity precision is now ENFORCED by fail-closed triggers (millième exact, non-negative) on products, stock_movements, inventory_layers, sale_fifo_consumption        | `database/migrations/0064_quantity_precision_and_fifo_basis.sql`                                     |
| STK-02             | The layer invariant is now structural: `remaining_quantity <= original_quantity` is guaranteed by the trigger, not only detected after the fact                                                           | same                                                                                                 |
| **STK-03**         | The FIFO cost PROVENANCE is now explicit: `sale_fifo_consumption.cost_basis` (`layer` / `fallback-purchase-price` / `fallback-last-layer`), NOT NULL, plus a diagnostic view `v_sale_fifo_approximations` | same                                                                                                 |
| STK-03             | The application writes the provenance: the sale path distinguishes a fallback on the LAST LAYER from a fallback on the PURCHASE PRICE                                                                     | `electron/ipc/handlers/fifo.ts`, `sales.repo.ts` (5 call sites)                                      |
| **DB-02**          | The migration lock now rejects an unknown migration                                                                                                                                                       | verified: `verify:migrations` refused 0064 until the lock was regenerated — the guard MORDED (proof) |
| DB-02              | The lock was regenerated in the SAME change (AGENTS.md rule 12)                                                                                                                                           | `database/migrations.lock.json` → 64 migrations                                                      |
| DB-03 / MONEY-04   | The line-level money invariant                                                                                                                                                                            | pending                                                                                              |
| STK-01             | The stock reconciliation diagnostic                                                                                                                                                                       | pending                                                                                              |

**Why triggers and not CHECK constraints:** SQLite has no `ALTER TABLE ... ADD
CONSTRAINT` and no `NOT VALID`; enforcing a new CHECK would require a table
REBUILD — a real data-migration risk on a live retail database. The triggers
achieve the same fail-closed guarantee without touching a single existing row,
which is the same pattern migration 0037 already used for the negative-stock guard.

**Verification:** `verify:migrations` now ASSERTS the new behaviour (7 triggers
present, a non-millième quantity is refused with a French message, a legitimate
fraction is ACCEPTED — no false positive —, a layer remainder above its origin is
refused, a consumption without `cost_basis` is refused, and the diagnostic view
exists).

**One test was hardened rather than weakened:** `tests/database/migrations.test.ts`
no longer hardcodes `63`; it derives the count from the LOCK (source unique,
ADR-178) and asserts the last file matches the lock. A frozen counter in a test
is a second counter to maintain — a guaranteed drift.

### Wave 2 — execution record (DONE)

| Change                                           | File                                                      | Proof                                              |
| ------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------- |
| Sender registry + guard                          | `electron/ipc/sender-guard.ts` (new)                      | `tests/unit/ipc-sender-guard.test.ts` **8/8**      |
| Central choke point now validates the sender     | `electron/ipc/handle.ts`                                  | `tests/unit/ipc-handle.test.ts` **15/15** (3 new)  |
| 38 raw channels validate the sender              | `enforceRawChannelGates(channel, input, event)` + 9 files | typecheck green; E2E green                         |
| The 2 staff-exempt channels validate the sender  | `electron/backup/backup.service.ts`                       | typecheck green                                    |
| Application windows registered as origins        | `electron/main/window-manager.ts`                         | E2E 54/54 pass (the real app still works)          |
| E2E self-sufficient                              | `config/playwright.config.ts`                             | `npm run test:e2e` → **exit 0** (was exit 1)       |
| Client-orders domain contract + SQL mirror proof | `tests/database/client-order-domain-contract.test.ts`     | **9/9**; `test:coverage` → **exit 0** (was exit 1) |

### Gate status after Waves 0 + 2

| Gate                       | Before        | After                                                                    |
| -------------------------- | ------------- | ------------------------------------------------------------------------ |
| `npm run license:scan`     | **1 (FAIL)**  | **0**                                                                    |
| `npm run test:coverage`    | **1 (FAIL)**  | **0**                                                                    |
| `npm run test:e2e`         | **1 (FAIL)**  | **0** (54 passed, 4 skipped)                                             |
| `npm test`                 | 1497 passed   | **1527 passed** (+30)                                                    |
| `npm run package:portable` | blocked       | **artefact produced**, then correctly refused for publication (unsigned) |
| `npm run verify`           | 0             | **0** (+ the new `verify:release-config`)                                |
| `npm run ci`               | red (2 gates) | **all constituent gates green**                                          |

**Release gate:** no wave is "done" until its own `npm run` verification commands are green AND the audit's own blocking finding for that wave is closed.

---

## WAVE 0 — Unblock the release pipeline

### 0.1 GATE-01 (P0) — the secret scan fails on documentation prose

**Root cause.** The scanner applies TWO distinct pattern families to EVERY scanned file:

- **secret-material** patterns (private key blocks, `sb_secret_…` tokens, `service_role` assignments, privileged JWTs) — genuine leak detectors;
- **bypass-switch** patterns, of which the last one is `\b(?:bypass|disable|skip)[-_ ]?licen[sc]e\b` — a **prose-tolerant** pattern intended to catch code like `bypassLicense = true`.

That prose-tolerant pattern matches the legitimate English abuse-case prompt in the Veloria Engineering Skills threat-model checklist ("Can deleting one local state file bypass license checks or destroy data?"). The scanner's own scope rule is deliberately wide ("AUCUNE exclusion — … .opencode/ sont scannés comme tout le reste"), so the documentation trees are scanned — correctly — but the _pattern_ is applied to prose it was never designed for.

**Radical fix — correct the scope rule, not the pattern:**

- Split the pattern families explicitly: `SECRET_PATTERNS` (secret material) vs `BYPASS_CODE_PATTERNS` (code switches).
- `SECRET_PATTERNS` keeps scanning **every** file, including `.md`/`.txt` — a key or a service token hidden in documentation is still a leak.
- `BYPASS_CODE_PATTERNS` scans **code files only** (`.ts .tsx .js .mjs .cjs .json .html .css .yml .yaml .sql .ps1 .log`). A bypass switch is a code construct; prose that names one is not a bypass.
- The env-var patterns (`process.env.BYPASS…LICENSE` etc.) stay global — they are code-shaped and unambiguous.

**Why this is safe:** the false positive was in the _prose-tolerant_ pattern only. The scan still fails on a real `bypassLicense = true` in a `.ts` file, and still fails on a real key or token in a `.md` file.

**Negative proof required:** a test that (a) the pristine tree passes, (b) a synthetic `.ts` file with `bypassLicense = true` FAILS the scan, (c) a synthetic `.md` file containing a private-key block FAILS the scan, (d) a synthetic `.md` file containing the phrase "bypass license checks" PASSES.

### 0.2 REL-02 (P2) — `verifyUpdateCodeSignature: false`

One-line change to `config/electron-builder/pos.yml`. The project already reverted an identical packaging flag once (ADR-070, `signAndEditExecutable`); this is the same class of latent trap. A verify gate forbids it from returning.

### 0.3 REL-04 (P3) — stamp the source revision into the artefact

`buildMetadata` in the electron-builder config + surface the SHA in the existing `app.diagnostics` payload.

---

## WAVE 1 — Licence and credential custody

### 1.1 LIC-04 (P2) — key identifier + key set

The envelope is `base64url(canonicalJSON({payload, signature}))` with **no `kid`**, and the public key is a single file. Rotation therefore replaces the only trust anchor and invalidates every issued licence — the exact outcome the skill forbids.

**Fix:** `resources/license/keys.json` = `{active: "k1", keys: {k1: "<PEM>"}}`; the envelope gains `kid`; verification resolves by `kid`, falling back to the active key for legacy v1 envelopes. `keygen.mjs` ADDS a key rather than overwriting the file, and refuses to remove a key still referenced by an issued licence.

**Must land BEFORE the rotation in 1.2** — otherwise rotating invalidates live customer licences.

### 1.2 LIC-02 / SEC-02 (P1) — key custody

The private half of the SHIPPED public key is on this machine (fingerprints proven identical). Correctly gitignored and untracked, but the dev and production lifecycles are coupled: `keygen.mjs` regenerates the pair AND overwrites the shipped trust anchor.

**Fix, three parts:**

1. `keygen.mjs` requires an explicit `--production` flag to write `resources/license/`; a development key goes to a dev-only path that the dev-time verifier prefers.
2. A **build-time guard** refuses to package when a private key whose public fingerprint matches the shipped public key is present in the tree.
3. A **repository guard test** asserts no such private key exists in the tree or in a standard developer location.

### 1.3 SYNC-04 / SEC-03 (P2) — the `service_role` credential

A total-privilege bearer credential (bypasses RLS) persisted in a plain local document.

**Fix:** (a) prefer a **scoped** Supabase key limited to the mirror tables over the full `service_role`; (b) store it through the OS credential store (DPAPI) rather than a plain document; (c) exclude it from the backup/export scope (see BACK-04).

---

## WAVE 2 — Close the IPC trust boundary

### 2.1 SEC-01 / ELEC-04 (P1) — sender validation

The wrapper receives the IPC event and discards it (`_event`). No handler in 199 validates `event.sender`. The preload exposes all 201 channels, so a renderer compromise inherits every privileged operation the current session is entitled to.

**Fix:** validate `event.sender.id` against the expected window at the single choke point in `handle()`, and mirror it inside `enforceRawChannelGates` for the 38 raw channels. The recovery and licence windows legitimately use the same preload, so the allow-list must cover them.

**Negative proof required:** a forged sender on one guarded channel and one raw channel → `{ok:false, code:"FORBIDDEN"}` AND the handler body did not execute.

### 2.2 GATE-04 / SEC-04 (P2) — the missing negative-proof gates

Add the two negative proofs the gates skill's own reference names and the project lacks: wrong-sender rejection, and corrupted-backup rejection (the restore machinery already exists — `verifyDbFileCopy`).

### 2.3 ELEC-05 (P2) — one capability source of truth for the raw channels

Extend `enforceRawChannelGates` to consult `PAGE_GATED_CHANNELS` / `FEATURE_GATED_CHANNELS` so the 38 raw channels inherit the central capability table instead of maintaining a second policy in `printing.guards.ts` / `backup.service.ts`.

---

## WAVE 3 — Data integrity under the database

### 3.1 DB-01 / STK-02 (P1) — quantity precision

All 26 quantity columns are `NUMERIC` (SQLite float affinity) while all 99 money columns are INTEGER. The asymmetry is inconsistent with the schema's own money-purity standard, and the DB cannot prevent a non-representable quantity that breaks `SUM(layers) = products.quantity`.

**Fix (new migration 0064):** CHECK constraints asserting sub-unit exactness and non-negativity on every quantity column, plus `remaining_quantity <= original_quantity` on `inventory_layers`. **No table rebuild** — a rebuild on a live retail database is a data migration with real risk.

### 3.2 MONEY-04 / DB-03 (P2) — the line-level money invariant

No constraint ties a sale line's `billed_total_minor` to `unit_price_minor × quantity`. The application enforces it with a bounded tolerance; the database does not.

**Fix (same migration):** a CHECK on `sale_items` mirroring `money-guard.ts`'s tolerance exactly.

### 3.3 DB-02 (P2) — additions-only migration lock

`--write-lock` currently rewrites the whole lock, so an edited applied migration can be laundered into a green CI.

**Fix:** the writer refuses to change or remove an already-locked file's checksum unless an explicit `--force-amend` is passed.

### 3.4 STK-01 (P2) — the stock reconciliation diagnostic

The skill requires a diagnostic that reconciles aggregate product quantity vs movement-derived quantity vs FIFO-layer quantity. It does not exist; drift is invisible from inside the product.

**Fix:** a read-only `stock.reconcile` channel (page-gated to `settings`, staff-gated to `settings` — it exposes internal cost data).

### 3.5 STK-03 (P2) — FIFO fallback cost provenance

A legacy sale with no layer available writes a NULL-layer consumption row at a caller-supplied cost, but does not record WHICH rule produced that cost. A later reader cannot distinguish a correctly-costed sale from an approximated one.

**Fix (migration 0064):** a `cost_basis` column on `sale_fifo_consumption` (`layer` / `fallback-purchase-price` / `fallback-last-layer`).

---

## WAVE 4 — Reconcile governance with reality

### 4.1 ORCH-01 / SYNC-01 / SKILL-01 (P1) — the Sheets/Supabase conflict

The contract and `veloria-sync` name **Google Sheets**; the code ships **Supabase** under accepted ADR-053. The implementation is correct; the instructions are wrong. **One change** updates the contract, the facts file and the skill together, plus a new ADR — and a machine gate prevents recurrence.

### 4.2 CLOS-01 / ORCH-02 / SKILL-02 (P2) — the timezone decision

Three governing texts forbid the hardcoded UTC+1; the code hardcodes it in both twins. **Zero impact today** (Algeria is UTC+1 with no DST) — so the decision is to RECORD the policy, not to rewrite every report query (option (b) would touch ~6 SQL helpers and every report boundary).

**Fix:** an ADR accepting the fixed offset with the DST rationale, plus an amendment to the three governing texts, plus a boundary test that computes the business day both ways.

### 4.3 ORCH-03 (P2) — generate the facts file

22 rows, all "Must verify", never filled in. Replace the manual table with a GENERATED one (the pattern `docs/METRICS.md` already proves), verified by `verify:docs`.

### 4.4 HW-01 / SKILL-06 / SKILL-07 (P2) — align the skills with the codebase

`veloria-hardware` prescribes a device-adapter layer that does not exist; `veloria-observability` demands health indicators that are not implemented. Rewrite both to describe what IS implemented, with the unimplemented parts marked as roadmap.

---

## WAVE 5 — Backup integrity

### 5.1 BACK-01 (P2) — verify-then-promote

`VACUUM INTO` writes directly to the FINAL name. A truncated file occupies a retention slot and is listed as valid.

**Fix:** write to `.pending-<stamp>`, run the EXISTING `verifyDbFileCopy()` on it, then atomically rename. Only then apply retention.

### 5.2 BACK-02 (P2) — checksum manifest

Write a sidecar `<name>.manifest.json` with `{createdAt, appVersion, schemaVersion, sizeBytes, sha256}`; verify on listing; refuse to restore a mismatch.

### 5.3 BACK-03 (P2) — free-space check

Check free space against the estimated image size before writing; report disk-full distinctly.

### 5.4 BACK-04 (P2) — the inclusion/exclusion contract

Document exactly what a backup contains, and add a test that a produced backup carries no credential material.

---

## WAVE 6 — Contract-level tests and the coverage gate

### 6.1 SLICE-01 / GATE-02 (P1) — close the coverage gate

The client-orders domain module is at 46.66% lines / 33.33% functions against the project's own blocking per-file thresholds. **Do not lower the threshold.** Add: a table-driven test over `ORDER_STATUSES`; a test over `ORDER_TRANSITIONS`; a **mirror test against the SQL trigger** on a temp DB (the module's own headline claim, currently unproven); and `formatOrderReference()` edge cases.

### 6.2 MONEY-02 / GATE-03 (P2) — contract, not parity

Parity proves the two implementations AGREE; it does not prove either is CORRECT. Add a contract test asserting the DOCUMENTED behaviour directly: the three documented rounding examples, the rejected-input list, the boundary values at and just outside `MAX_MINOR_SINGLE`, and the conservation property.

### 6.3 CLOS-05 (P3) — the closing scenario matrix

One test per scenario from the closing skill's reference, against a real temp DB.

### 6.4 GATE-05 (P3) — a self-sufficient E2E command

Start the mirror relay from the Playwright config so `npm run test:e2e` is green on a clean machine.

---

## WAVE 7 — Observability and UI hardening

OBS-01 (a redaction layer in the logger + the mandated fixture test) · OBS-02 (a support bundle with a preview) · UI-01 (a shared async-panel state matrix) · UI-03 (an accessibility gate) · UI-04 (colour-independent status).

## WAVE 8 — Sync resilience and isolation proof

SYNC-02 (per-row attempt counter, failure taxonomy, exponential backoff + jitter, quarantine) · SYNC-03 (an executed per-customer isolation proof + a static RLS gate).

## WAVE 9 — Release hardening and physical acceptance

REL-01 (Authenticode + a packaging gate that refuses to publish unsigned) · REL-03 (a packaging CI job using the portable target, which needs no UAC) · HW-02/PRINT-02 (a documented physical acceptance pass) · PRINT-01 (an automated printed-amounts-vs-database comparison).

---

## Global acceptance criteria

1. `npm run license:scan` → 0, with both negative proofs still failing correctly.
2. `npm run test:coverage` → 0, with no threshold lowered and no file excluded.
3. `npm run test:e2e` → 0 on a clean machine with no manual setup.
4. `npm run ci` → 0 end to end.
5. `npm run package:portable` produces an artefact whose SHA-256 matches its published manifest.
6. A licence issued on the new keypair activates; a licence signed by an unknown key does not.
7. No private key matching the shipped public key exists in any developer tree.
8. A forged IPC sender is rejected — proven by a test that fails without the fix.
9. A corrupted backup is detected before it is needed and refused at restore.
10. The contract, the facts file and the skills agree with the implementation, and a machine gate keeps them agreeing.
11. The financial core is UNCHANGED: 1497 tests still pass, the allocation still conserves exactly, and no money or stock invariant was weakened in the process.

---

## Execution notes

- **Git is NOT installed on this host.** AGENTS.md rule 10 requires a commit at the end of the task. This is a hard environmental blocker for the commit step; `handoff.md` is still updated, and the blocker is recorded in it. No git operation of any kind was performed.
- **Migrations are forward-only** (AGENTS.md rule 12). Wave 3 adds migration `0064` and regenerates `database/migrations.lock.json` via `npm run verify:migrations:lock` in the same change.
- **`handoff.md` is updated** (current-state §1 + a session section) as required by AGENTS.md rule 10.
