# 15 — veloria-security Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-security` — SKILL.md read in full; references/threat-model-checklist.md read in full.
**Method:** threat model constructed from the actual code (not from the reference's generic list); the Electron boundary, the IPC pipeline, the licence and sync credential paths, the filesystem validators, the SQL layer, the build/sign pipeline and the mirror's isolation model were all inspected; the secret-scan gate was executed; the release artefacts' Authenticode status was queried. No exploitation was performed against any system outside the authorised project.

## 1. Threat model as constructed from the code

### Assets

| Asset                                     | Where it lives                                                         | Exposure                                       |
| ----------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| Customer identity, contact, balances      | SQLite `customers`; projected to Supabase                              | local disk, mirror, backups                    |
| Supplier identity, purchases, debts       | SQLite `suppliers`, `supplier_payments`                                | local disk, backups                            |
| Invoices, payments, returns, COGS         | SQLite `sales`, `sale_items`, `sale_payments`, `sale_fifo_consumption` | local disk, mirror, backups, printed documents |
| Inventory valuation                       | SQLite `inventory_layers`                                              | local disk, backups, owner snapshot            |
| Staff identities, PIN hashes, permissions | SQLite `staff_users`, `staff_recovery`                                 | local disk, backups                            |
| Licence state + capability catalogue      | `secure-state` + SQLite `app_settings.license_anchor`                  | local disk                                     |
| **Ed25519 signing key**                   | `private/vendor-keys/private.key`                                      | local disk — **present in this tree** (LIC-02) |
| **Supabase service_role key**             | local sync config document                                             | local disk (SYNC-04)                           |
| Update/integrity verification keys        | `resources/license/public.key` + the signed integrity manifest         | shipped with the app                           |
| Backups and exports                       | userData/backups, user-chosen folders                                  | user-controlled storage                        |
| Logs                                      | userData/logs (14-day retention)                                       | local disk                                     |

### Trust boundaries (as implemented)

```
[Renderer SPA]  --contextBridge-->  [Preload]  --ipcRenderer.invoke-->  [Main]
                                                                            |
     CSP 'self' only, no native imports          license/staff/credit gates |
     zero native imports in src/                Zod validation + operationId|
                                                                            |
                          +---------------------+------------------------+
                          |                     |                        |
                    [SQLite + WAL]        [Filesystem]            [Network: Supabase]
                  FK ON, 217 CHECKs,     path validation,           service_role key
                  77 triggers            symlink resolution        (main process only)
```

### Actors and capabilities considered

| Actor                                        | Capability                                         | Realistic goal                                  |
| -------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| Local user (shop owner)                      | Full OS access to the machine and the userData dir | read the DB, copy the vendor key, mint licences |
| Malicious or compromised dependency          | Runs in the renderer bundle                        | XSS → invoke bridge channels                    |
| Malicious imported file (CSV/XLSX/PDF/image) | Parsed by the app                                  | inject content, exhaust memory                  |
| Local attacker with the service_role key     | Total read/write on the mirror                     | read/forge every customer's invoice             |
| Attacker with the vendor private key         | Mint any licence                                   | bypass all capability gates                     |

## 2. Findings

```text
ID: SEC-01
TITLE: IPC handlers do not validate the sending frame, so a renderer compromise inherits the full privileged channel surface
SEVERITY: P1
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-security (cross-ref veloria-electron)
AFFECTED_MODULE: electron/ipc
FILE: electron/ipc/handle.ts
LINE_RANGE: 44-49, and all 199 handler registrations
PROBLEM:
  The central wrapper receives the IPC event and DISCARDS it (`_event`). No
  handler in the entire codebase inspects `event.sender`, `senderFrame` or
  `webContents.id` as an authorisation input. The security skill requires:
  "Validate at every trust boundary" and "Verify the sender frame belongs to the
  expected application origin/window before processing privileged requests."
  Combined with a preload that exposes all 201 channels to any renderer, a
  renderer-level compromise (XSS in a rendered customer name, or a compromised
  npm dependency in the renderer bundle) inherits every privileged operation
  the product supports.
EVIDENCE:
  electron/ipc/handle.ts:44
    ipcMain.handle(channel, async (_event, raw: unknown) => {
  A mechanical sweep of all 199 `ipcMain.handle` sites found ZERO uses of
  event.sender as an authorisation input. The only use of the event anywhere is
  `event.sender.getPrintersAsync()` in printing.receipt.ts:37 — a functional
  use, not a check.
  electron/preload/preload.ts exposes the whole channel set (201/201 exposed).
  Mitigating controls that DO hold:
    - the CSP is restrictive (index.html:7-10): default-src 'self', script-src
      'self', no unsafe-eval, no wildcard;
    - there is no generic SQL/shell/filesystem escape hatch;
    - licence and staff gates still apply (they are session-based, not
      sender-based), so a compromised renderer cannot bypass the staff or
      licence checks — but it CAN perform any operation the CURRENT session is
      entitled to.
ROOT_CAUSE:
  The threat model assumes a trusted local SPA. That assumption weakens when
  user-controlled strings are rendered (the app renders customer names, notes,
  addresses and imported data) or when the renderer dependency tree is
  compromised.
IMPACT:
  Moderate-high. The privilege boundary between "the app" and "a script running
  in the app" does not exist. A single successful XSS would allow, for
  example, changing staff permissions, deleting products, restoring a backup,
  importing a licence, or reading every customer's financial data — all under
  the legitimate session, so the licence/staff gates would not object.
RECOMMENDED_FIX:
  Add sender validation at the single choke point:
    const expected = getMainWindow()?.webContents;
    if (!event.sender || event.sender.id !== expected?.id) {
      log("WARN", "ipc", "handler.bad_sender", { channel });
      return { ok: false, code: "FORBIDDEN", message: "Action non autorisée." };
    }
  and mirror it inside `enforceRawChannelGates` (raw-guards.ts:33-49), which is
  already the mandatory passage point for the 38 raw channels. Also validate that
  the sender frame's URL is a file:// URL under the app directory (or
  http://localhost:5173 in development only).
REGRESSION_TEST:
  Invoke one handle()-wrapped channel and one raw channel with a forged sender;
  assert the outcome is {ok:false, code:"FORBIDDEN"} AND that the handler body
  did not execute (e.g. no row was written).
DEPENDENCIES:
  ELEC-04, GATE-04, SEC-04.
```

```text
ID: SEC-02
TITLE: The vendor Ed25519 signing key matching the shipped public key is present on this machine
SEVERITY: P1
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-security (cross-ref veloria-license)
AFFECTED_MODULE: private/, resources/license
FILE: private/vendor-keys/private.key
LINE_RANGE: n/a (PEM file; only the header was read)
PROBLEM:
  The public key shipped in every installer (resources/license/public.key) is the
  public half of the Ed25519 keypair whose private half sits at
  private/vendor-keys/private.key on this machine. Anyone with a copy of this
  working tree can therefore mint a licence — any edition, any feature set, any
  hardware binding — that every POS build shipped from this tree will accept as
  ACTIVE.
  The surrounding controls are correct: `private/` is gitignored, confirmed
  untracked in the git index, excluded from the electron-builder `files:` list,
  and covered by the secret scan.
EVIDENCE:
  The audit computed the SHA-256 of the SPKI DER of both public keys:
    private/vendor-keys/public.key -> 67e2fce18130ac5c1b2b9e69b62cbb1ff36199e7c11202dde33265fdf0183fe4
    resources/license/public.key   -> 67e2fce18130ac5c1b2b9e69b62cbb1ff36199e7c11202dde33265fdf0183fe4
  — IDENTICAL.
  private/vendor-keys/private.key -> "-----BEGIN PRIVATE <KEY>-----", 118 bytes (en-tête seul lu).
  scripts/licensing/keygen.mjs:26-33 — generates the pair and OVERWRITES
    resources/license/public.key, coupling the dev and production lifecycles.
  .github/workflows/ci.yml:87-96 — CI restores the vendor key from
    VELORIA_VENDOR_PRIVATE_KEY_B64 into the same path.
  No private key material was read into this report.
ROOT_CAUSE:
  No separation between a DEVELOPMENT keypair (regenerable, and regenerating it
  silently changes the shipped trust anchor) and a PRODUCTION keypair (must
  exist only on the vendor's issuing machine).
IMPACT:
  High for licence integrity, moderate for the business. It converts the
  licence control from "cryptographic" to "whoever holds the vendor key". It
  does NOT affect a POS already deployed, unless the same keypair signed it.
RECOMMENDED_FIX:
  (1) Determine and RECORD whether this keypair is the production pair. If it
      is, treat it as compromised and rotate (see LIC-04 for the rotation
      mechanism).
  (2) Separate the lifecycles in keygen.mjs: require an explicit --production
      flag to write resources/license/public.key; a dev key should go elsewhere.
  (3) Add a build-time guard that REFUSES to package when a private key whose
      public fingerprint matches resources/license/public.key is present in the
      tree.
REGRESSION_TEST:
  (a) A test asserting no private key matching the shipped public key exists in
      the repository tree or in a standard developer location;
  (b) a packaging gate that fails when it does;
  (c) a verification test that a licence signed by a different key is rejected.
DEPENDENCIES:
  LIC-02, LIC-04.
```

```text
ID: SEC-03
TITLE: The Supabase service_role credential is DPAPI-encrypted at rest; the residual exposure is its SCOPE (full RLS bypass), not its storage
SEVERITY: P2
CONFIDENCE: VERIFIED — CORRECTED 2026-11-12 (the initial finding overstated the at-rest exposure)
AFFECTED_SKILL: veloria-security (cross-ref veloria-sync)
AFFECTED_MODULE: electron/sync
FILE: electron/sync/sync-secrets.ts
LINE_RANGE: 1-99; electron/sync/sync.service.ts:160-190
PROBLEM:
  CORRECTION OF THE INITIAL AUDIT FINDING. The audit first recorded that the
  `service_role` key (which bypasses RLS entirely) "persists in a plain local
  document readable by any same-user process". THE STORAGE HALF OF THAT WAS
  WRONG: the key is ALREADY encrypted at rest with the OS keystore
  (`safeStorage` → DPAPI under Windows), using the same mechanism as the
  licensing state.

  What remains true, and is the real exposure:
    1. `service_role` bypasses RLS (cloud/supabase/rls.sql:12). The credential
       grants FULL read AND write on the customer mirror — every invoice, and
       the ability to alter them. DPAPI protects the FILE; it does not reduce
       what the credential can DO once decrypted.
    2. The privilege is FULL where a SCOPED key (mirror tables, INSERT/SELECT)
       would suffice. The POS never writes anything else.
    3. DPAPI's contract is that ANY process running as the SAME OS USER can
       decrypt. On a shared counter PC, that is a realistic local attacker.
EVIDENCE:
  electron/sync/sync-secrets.ts:33-48 — `safeStorageSecretBackend()` (DPAPI),
    `encodeSecret`/`decodeSecretWith`.
  electron/sync/sync.service.ts:189-190 — `serviceKey` and `anonKey` are
    ENCODED on every write; line 173 decodes them on read.
  electron/sync/sync-secrets.ts:88-91 — an undecryptable value (e.g. a DPAPI
    blob restored on another machine) throws "Secret de synchronisation
    illisible" — fail-closed, no silent clear-text fallback.
  cloud/supabase/rls.sql:12 — "La fonction Edge contourne RLS via service_role
    (bypass intégré)."
ROOT_CAUSE:
  Not a storage defect — the storage is correct. The exposure is the SCOPE of
  the privilege requested from Supabase, combined with running a desktop app on
  a shared machine.
IMPACT:
  Moderate (LOWER than initially stated). A stolen database or .vposdb backup
  does NOT yield the key — that is the most likely exfiltration path and it is
  closed. What remains is a same-user local attacker, who would obtain a
  total-privilege cloud credential usable against every customer of that shop.
RECOMMENDED_FIX:
  (1) Replace the full `service_role` key with a SCOPED Supabase API key
      (mirror tables, INSERT/SELECT only). This is the change that actually
      reduces the blast radius — the storage is already correct.
  (2) Record the residual risk in docs/licensing/THREAT_MODEL.md: DPAPI
      protects the file, the privilege remains total.
  (3) Rotate on a documented schedule and on staff change.
  (4) Keep the DPAPI storage as-is.
REGRESSION_TEST:
  tests/unit/sync-secret-storage.test.ts (5 tests) — the persisted document
  never contains the clear-text secret, the round-trip works, and an
  undecryptable value fails closed.
DEPENDENCIES:
  SYNC-04 (same finding, sync view).
```

```text
ID: SEC-04
TITLE: No automated negative-proof gate protects the IPC trust boundary
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-security (cross-ref veloria-gates)
AFFECTED_MODULE: tests, scripts/quality
FILE: .opencode/skills/veloria-gates/references/gate-design.md
LINE_RANGE: 21-24 (the skill's own example gates)
PROBLEM:
  The gates skill's own worked examples include "IPC gate: send an invalid
  payload or wrong sender and prove the handler rejects it" and "Backup gate:
  corrupt a disposable backup and prove restore validation refuses it."
  The project implements the invalid-payload half well (Zod schemas) and
  implements several other genuine negative proofs (the sha256 migration lock,
  the raw-channel coverage test, the FR non-vacuity floor, the domain
  transaction/operationId static analysis, and the DB-level CHECK/trigger
  invariants). But the wrong-sender half and the corrupted-backup half are
  absent — and the wrong-sender absence is precisely why SEC-01 survived.
EVIDENCE:
  .opencode/skills/veloria-gates/references/gate-design.md:21-24 (the examples)
  Implemented negative proofs actually observed:
    - scripts/quality/verify-fr-only.mjs:90-93 (300-file non-vacuity floor)
    - electron/ipc/raw-guards.ts:51-64 (RAW_GUARDED_CHANNELS exactness)
    - scripts/quality/verify-domain.ts ("70 mutations IPC analysées")
    - scripts/database/verify-migrations.mjs:56-90 (sha256 lock)
    - migrations 0023/0037/0048/0059 (DB invariants)
  Missing: any test asserting a forged sender is rejected; any test corrupting
  a disposable backup and asserting the restore refuses it.
ROOT_CAUSE:
  Negative proofs were added opportunistically per audit wave rather than
  systematically against the skill's example list.
IMPACT:
  Moderate. The gap is the reason a P1 (SEC-01) survived in a project whose
  gate suite is otherwise genuinely rigorous. It is also the mechanism by which
  the security posture silently regresses.
RECOMMENDED_FIX:
  (1) Implement sender validation (SEC-01's fix), then add the
      wrong-sender negative-proof test.
  (2) Add the corrupted-backup negative-proof test (the restore validation
      machinery already exists — verifyDbFileCopy).
  (3) Add a checklist to the gate design so each skill's example negative proof
      maps to an implemented gate, and verify the mapping mechanically.
REGRESSION_TEST:
  The two tests above.
DEPENDENCIES:
  SEC-01, BACK-01, BACK-02.
```

```text
ID: SEC-05
TITLE: The Windows installers and executables are not code-signed, so SmartScreen and enterprise policy will treat them as untrusted
SEVERITY: P1
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-security (cross-ref veloria-release)
AFFECTED_MODULE: release artefacts, electron-builder config
FILE: config/electron-builder/pos.yml
LINE_RANGE: the `win:` block
PROBLEM:
  Both POS binaries carry NO Authenticode signature. The security skill's threat
  model includes the build/sign/release chain, and the release checklist
  requires production signatures where policy requires them. For a Windows
  desktop product sold to businesses, an unsigned binary is blocked by default
  Mark-of-the-Web policy on managed endpoints and triggers a SmartScreen
  "unrecognised publisher" warning for end users.
EVIDENCE:
  $ Get-AuthenticodeSignature "release\Veloria-PoS-Setup-1.0.4.exe"
    Status: NotSigned   Signer: (empty)   TimeStamper: (empty)
  Same for Veloria-PoS-Portable-1.0.4.exe.
  config/electron-builder/pos.yml: `verifyUpdateCodeSignature: false`.
  No signtool invocation, no CSC_LINK handling, no signing step in
  scripts/release/.
  The Ed25519 integrity manifest (sign-integrity.mjs, 254 files) protects the
  APPLICATION PAYLOAD against tampering but does NOT satisfy the Windows trust
  model — it is invisible to SmartScreen and to enterprise code-signing policy.
ROOT_CAUSE:
  No Authenticode certificate is present on the build machine and no signing
  step exists in the pipeline.
IMPACT:
  High for distribution; moderate for security. The integrity of the payload is
  separately covered, so the gap is about TRUST and enterprise policy, not
  about tamper-resistance per se.
RECOMMENDED_FIX:
  Obtain an Authenticode certificate for the publisher entity, sign the
  installer/uninstaller/executable via electron-builder's CSC_LINK support, add
  an RFC-3161 timestamp, and add a packaging gate that REFUSES to publish an
  unsigned release artefact. Also set `verifyUpdateCodeSignature: true` before
  any update channel is introduced.
REGRESSION_TEST:
  A release-script assertion that the produced installer's Authenticode status
  is `Valid` and its signer subject matches the expected publisher.
DEPENDENCIES:
  REL-01, REL-02, GATE-01.
```

```text
ID: SEC-06
TITLE: Path validation rejects system roots but does not bound file size or type for the OCR and import paths
SEVERITY: P2
CONFIDENCE: NEEDS_VERIFICATION
AFFECTED_SKILL: veloria-security
AFFECTED_MODULE: electron/ocr, electron/ipc/handlers/import.repo.ts
FILE: electron/ocr/ocr-files.ts
LINE_RANGE: whole file (8007 B)
PROBLEM:
  The security reference lists as an abuse case: "Can an imported file escape its
  allowed directory or exhaust memory/disk?" The path-escape half is addressed
  (assertSafeUserFolder resolves symlinks and denies system roots). The
  resource-exhaustion half — a bound on file size and on the number of pages
  processed — was not established by the audit for the OCR and CSV/XLSX import
  paths.
EVIDENCE:
  electron/ocr/ocr-files.ts (8007 B) — selected-file handling for OCR.
  electron/ipc/handlers/import.repo.ts — the CSV/XLSX import path.
  electron/ocr/ocr.service.ts (10989 B) — the OCR pipeline.
  The audit did not establish the size/page bounds.
  Note: electron/backup/backup.service.ts DOES bound the licence import
  (`if (stat.size <= 0 || stat.size > 20000) throw …` in
  registry.recovery.ts:120), so bounding is applied elsewhere in the codebase.
ROOT_CAUSE:
  Not established.
IMPACT:
  Low-moderate. An oversized file selected by the user (or crafted in an import)
  could consume memory or CPU. The blast radius is the operator's own machine
  and the operation is user-initiated, so it is a robustness issue more than a
  security one.
RECOMMENDED_FIX:
  Establish and enforce explicit bounds on the OCR and import paths: maximum file
  size, maximum page count, maximum row count, and a timeout on parsing. Reject
  over-limit inputs with a clear French message rather than attempting them.
REGRESSION_TEST:
  A test that submits an over-limit file to the OCR/import path and asserts a
  French rejection and that memory stayed bounded.
DEPENDENCIES:
  None.
```

## 3. Security skill checklist result

| Criterion                                                                     | Status       | Evidence                                                                                                         |
| ----------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Renderer/preload/main boundary enforced                                       | **VERIFIED** | 0 native imports in `src/`; contextIsolation + sandbox + no nodeIntegration on every window                      |
| IPC authorization, schema and error contracts                                 | **VERIFIED** | 161 guarded handlers; 68 LIC + 117 PAGE + 146 STAFF + 2 DEBT gated channels                                      |
| Sender validation                                                             | **VIOLATED** | SEC-01                                                                                                           |
| Path traversal / unsafe file access                                           | **VERIFIED** | symlink-parent resolution to depth 32; system roots denied on every drive; UNC refused; bare drive roots refused |
| SQL injection                                                                 | **VERIFIED** | prepared statements throughout; dynamic SQL limited to fixed allow-lists                                         |
| Secrets in source / config / DB / logs / renderer / mobile bundle / artefacts | **VERIFIED** | secret-scan fails closed over 20+ trees; no literal credential in source                                         |
| Vendor private keys never in customer software                                | **PARTIAL**  | the public key only ships; but the matching private key is in this tree (SEC-02)                                 |
| Service credentials never in the renderer or the APK                          | **VERIFIED** | `sync-secrets.ts`; the APK uses anon + RLS, which is denied everything                                           |
| Customer authentication and per-customer isolation                            | **VERIFIED** | Edge Function + PBKDF2 + RLS deny-by-default + REVOKE; ambiguity fails closed                                    |
| Update / installer / artefact integrity                                       | **PARTIAL**  | SHA-256 manifests verified; no Authenticode (SEC-05); `verifyUpdateCodeSignature: false`                         |
| Data minimization and retention                                               | **VERIFIED** | log retention 14 days; backup retention 30; the outbox projection is minimal                                     |
| Fail closed without destroying customer data                                  | **VERIFIED** | licence failure blocks features only; the pre-migration and pre-reset snapshots are fail-closed                  |
| Negative tests proving rejection                                              | **PARTIAL**  | SEC-04                                                                                                           |
| Realistic threat limits stated                                                | **VERIFIED** | docs/licensing/THREAT_MODEL.md and the skill reference both state them                                           |

## 4. What is genuinely solid

- **No renderer-to-native path, provably.** 0 occurrences of `electron`, `node:`, `fs` or `better-sqlite3` in `src/`. The renderer is a pure consumer of a typed bridge.
- **No escape hatch in 201 channels.** No generic SQL, shell, filesystem or arbitrary-invoke channel exists. `sql-guard.ts` remains as an explicit deny-list.
- **A restrictive CSP is actually applied** — `default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, no `unsafe-eval`, no wildcard.
- **The print surface is isolated.** A separate hardened window with NO preload, no Node, sandboxed, navigation and popups denied — so even a malicious template cannot reach the bridge (PRINT-04).
- **Path validation is genuinely strong.** `assertSafeUserFolder` normalises, resolves symlink parents to depth 32, refuses UNC paths, refuses bare drive roots, and denies system roots on EVERY drive letter — not just `C:`.
- **RLS deny-by-default with an explicit REVOKE** — there is no policy to get subtly wrong, and the APK's anon key is worth nothing.
- **Secrets are out of the renderer, out of the APK, and out of version control** — the private key is confirmed untracked by parsing the git index, not merely by reading .gitignore.
- **The gate suite has real negative proofs**, which is why the audit could distinguish a genuine negative finding (SEC-01) from a stylistic one.
- **The build payload is tamper-evident** — a signed integrity manifest over 254 files.
- **Historical documents, financial movements and licence state are all auditable**, and the closed-period lock is a database trigger.

## 5. Not verified / limits of this audit

- **No exploitation was performed.** No renderer was compromised, no forged licence was produced, no malicious file was imported, and no live Supabase project was contacted. Every conclusion is static analysis plus the executed gate suite.
- The installer was not installed and executed on a clean Windows profile.
- The Android (APK) signing configuration and the mobile app's local security were not audited.
- SEC-06's size/type bounds were not established.
- The `owner/` supervision app's security posture was not audited.

## 6. Metrics

| Metric                      | Value                |
| --------------------------- | -------------------- |
| Assets enumerated           | 12                   |
| Trust boundaries mapped     | 4                    |
| Actors considered           | 5                    |
| IPC channels reviewed       | 201                  |
| Renderer native imports     | 0                    |
| Escape-hatch channels       | 0                    |
| Negative proofs implemented | 5 classes            |
| Findings                    | 6 (P0×0, P1×3, P2×3) |
