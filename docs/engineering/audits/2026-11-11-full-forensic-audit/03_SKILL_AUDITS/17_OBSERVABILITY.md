# 17 — veloria-observability Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-observability` — SKILL.md read in full; references/diagnostic-policy.md read in full.
**Method:** `electron/services/logger.ts` read in full; `electron/main/crash-recovery.ts`, `app-lifecycle.ts`, `startup-flow.ts` read; the logging call sites swept mechanically for sensitive payloads; `electron/ipc/handle.ts` (the correlation-id site) read; `electron/sync/sync.service.ts` (the health-indicator sites) inspected; `src/app/shell/use-notifications.ts` read.

## 1. Verdict

Observability is **deliberately minimal**, and for an offline-first POS that is largely the right call. The logger is a structured JSON-lines writer with a **business-day-named file**, 14-day retention, rotation performed only at startup (so the write path costs nothing), and — critically — **a hard rule that a logging failure can never crash a sale**. Crash handling is a first-class flow: an uncaught exception is logged with the stack (capped at 2000 chars), the database is checkpointed and closed, a French message is shown, and the app exits cleanly rather than becoming a zombie.

The gap is **enforcement of the privacy rule**. The skill says: "Never log passwords, PINs, signing keys, API tokens, license private material, full payment credentials, or unnecessary customer financial data" and the reference asks for redaction _tests_ with "fake email addresses, phone numbers, tokens, PIN-like strings, license payloads, customer names, invoice totals, and file paths". The project has **no redaction layer and no such test**. Correctness today depends on every call site being careful — and there are hundreds of call sites.

## 2. Scope covered

```
electron/services/logger.ts (80 L, read in full)
electron/main/crash-recovery.ts (read in full)   electron/main/app-lifecycle.ts
electron/main/startup-flow.ts                    electron/ipc/handle.ts (correlation id)
electron/ipc/ipc-errors.ts                       electron/sync/sync.service.ts (health indicators)
src/app/shell/use-notifications.ts               src/features/license/LicenseBadge.tsx
A mechanical sweep of every log(...) call site for sensitive payload shapes
```

## 3. Skill checklist result

| veloria-observability criterion                                                                     | Status        | Evidence                                                                                                                        |
| --------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Local diagnostics work without internet                                                             | **VERIFIED**  | the logger writes to `userData/logs`; no network call anywhere in the logging path                                              |
| Remote telemetry disabled unless approved                                                           | **VERIFIED**  | no telemetry/analytics dependency in package.json; no such code path exists                                                     |
| Core operations must not wait for analytics/crash upload                                            | **VERIFIED**  | there is no analytics code path at all                                                                                          |
| Support bundle exportable with a preview of its contents                                            | **NOT_FOUND** | `app.diagnostics` exists; no bundle export with a preview step (OBS-02)                                                         |
| Structured logs with timestamp, severity, component, event code, duration, sanitized context        | **VERIFIED**  | logger.ts:62-69 emits `{timestamp, level, component, event, ...extra}`; handle.ts:106-111 adds `operation_id` and `duration_ms` |
| Never log passwords, PINs, signing keys, API tokens, private material, payment credentials          | **PARTIAL**   | no redaction layer; correctness depends on call sites — see OBS-01                                                              |
| Redact or hash identifiers when raw values are not needed                                           | **PARTIAL**   | no automatic hashing; call sites must pre-hash (e.g. `phone_hash` is done correctly in the sync path)                           |
| Bound log size and retention; rotate safely; avoid unbounded growth                                 | **VERIFIED**  | `LOG_RETENTION_DAYS = 14`; one file per business day; purge only at startup                                                     |
| Do not let logging failure crash sales or database writes                                           | **VERIFIED**  | logger.ts:74-78 swallows the append error entirely                                                                              |
| Keep user-facing French messages separate from technical diagnostics                                | **VERIFIED**  | the logger writes JSON to disk; `ipc-errors.ts` maps to FR for the UI                                                           |
| Use operation IDs to correlate a workflow across UI, main, DB, sync, printer                        | **PARTIAL**   | a per-request correlation id is generated in main (handle.ts:49); the renderer side is not correlated to it — see OBS-03        |
| Distinguish expected validation errors from unexpected faults                                       | **VERIFIED**  | `toUserMessage()` separates them; log levels differ (WARN vs ERROR)                                                             |
| Avoid retry storms and log floods                                                                   | **PARTIAL**   | no rate limiting on repeated failures (OBS-04)                                                                                  |
| Capture sanitized crash context and last safe operation markers                                     | **VERIFIED**  | crash-recovery.ts logs the message and a capped stack                                                                           |
| Provide recovery instructions and safe restart behaviour                                            | **VERIFIED**  | the crash path checkpoints the DB, shows a French message ("votre base est conservée"), and exits after 6 s                     |
| Operational health indicators (DB state, last backup, sync queue depth, print success, crash count) | **PARTIAL**   | several are tracked but not surfaced as an indicator panel — see OBS-02                                                         |
| Redaction tests with fake sensitive fixtures                                                        | **NOT_FOUND** | OBS-01                                                                                                                          |

## 4. Findings

```text
ID: OBS-01
TITLE: The logger has no redaction layer and the skill's mandated redaction test does not exist
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-observability (cross-ref veloria-security)
AFFECTED_MODULE: electron/services/logger.ts, tests
FILE: electron/services/logger.ts
LINE_RANGE: 56-79
PROBLEM:
  The skill requires: "Never log passwords, PINs, signing keys, API tokens,
  license private material, full payment credentials, or unnecessary customer
  financial data" and "Redact or hash identifiers when raw values are not
  needed for diagnosis."
  The reference adds a concrete, testable requirement: "Create test fixtures
  containing fake email addresses, phone numbers, tokens, PIN-like strings,
  license payloads, customer names, invoice totals, and file paths. Confirm the
  sanitizer removes or masks them before they reach exported logs."
  The implementation is a pass-through: `log()` serialises whatever `extra`
  contains, with no allow-list, no deny-list and no sanitiser. The only
  protection is that each call site happens to pass safe data.
  The audit's mechanical sweep found NO log call site passing an obviously
  sensitive field (pin, secret, key, password, token, phone, email, name)
  directly — so today the rule is respected by convention. But there are
  hundreds of call sites, and the convention is not enforced or tested.
EVIDENCE:
  electron/services/logger.ts:56-79
    export function log(level, component, event, extra?): void {
      const entry = { timestamp: new Date().toISOString(), level, component, event, ...extra };
      const line = JSON.stringify(entry);
      … console.error(line) / console.warn(line) / console.log(line);
      if (logFile) { try { fs.appendFileSync(logFile, line + "\n"); } catch { /* never crash on logging */ } }
  — no sanitisation step anywhere between `extra` and the written line.
  Contrast with the codebase's own discipline elsewhere: the money constants
  have an explicit "no literal outside this module" rule
  (electron/ipc/money-guard.ts:5-11) and the secret-scan has an explicit
  pattern catalogue. The logger has neither.
  The crash handler logs the raw stack (capped):
  electron/main/crash-recovery.ts:11-14
    log("FATAL", "app", "uncaughtException", { error: err.message, stack: err.stack?.slice(0, 2000) });
  — a stack trace can contain a file path and, in principle, a value.
  No redaction test file exists in tests/.
ROOT_CAUSE:
  The privacy rule was treated as a call-site convention rather than as a
  boundary control.
IMPACT:
  Moderate over time. The blast radius of a single careless call site is the
  log file, which is then available to anyone with filesystem access, is
  retained for 14 days, and can be attached to a support bundle (if one is ever
  exported). Customer names, phone numbers and amounts appearing in a log is a
  data-minimisation failure even if no credential leaks. The specific risk
  case is a future call site that logs a whole record for convenience — e.g.
  `log("INFO", "sync", "row", { row })` — which would put customer financial
  data on disk without anyone noticing.
RECOMMENDED_FIX:
  (1) Add a sanitiser in the logger: a deny-list of key names (pin, password,
      secret, token, key, authorization, serviceKey, fingerprint, phone,
      email, address, customerName, notes, body) whose values are replaced with
      "[redacted]", plus a value-level scrubber for anything matching an email
      or a phone pattern.
  (2) Apply the sanitiser to the `extra` object BEFORE serialisation, and to
      the crash stack (strip absolute paths to basenames).
  (3) Keep the current behaviour of never throwing from the logger — the
      sanitiser must be total and must not throw.
  (4) Add the test the skill mandates: a fixture with fake emails, phones,
      tokens, PIN-like strings, licence payloads, customer names, totals and
      paths, asserting each is masked in the produced log line.
REGRESSION_TEST:
  The fixture test above — it is exactly the test the skill reference asks for.
DEPENDENCIES:
  SEC-03, OBS-02.
```

```text
ID: OBS-02
TITLE: No support-bundle export with a content preview, and the operational health indicators exist only as scattered fields
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-observability
AFFECTED_MODULE: electron/services, src/app/shell, src/features/settings
FILE: electron/services/logger.ts
LINE_RANGE: 52-54 (getLogFile) and the diagnostics channel
PROBLEM:
  The skill requires: "A sanitized support bundle should be exportable by an
  authorized user and explain exactly what it contains" and "Support bundle is
  user-initiated and previews its contents before export."
  The project has an `app.diagnostics` channel (licence/page-gated to
  "settings"), a log file on disk, and a "system.openLogsFolder" channel that
  opens the folder in Explorer — but there is no bundle export and no preview
  step. The support workflow today is "open the logs folder and send the files
  manually", which means whoever sends them controls what is included.
  The health indicators the reference lists are PARTIALLY available as data but
  are not assembled into a single indicator surface:
    - DB integrity state: available via the database.integrity channel;
    - last backup: available via backup.status;
    - pending sync queue size: available via sync.getConfig;
    - last successful print / device connectivity: NOT tracked;
    - last successful update verification: NOT tracked (no update channel);
    - crash/restart count: NOT tracked (crashes are logged but not counted).
EVIDENCE:
  electron/services/logger.ts:52-54
    export function getLogFile(): string { return logFile; }
  electron/ipc/channels.ts — "app.diagnostics" exists; "system.openLogsFolder"
  exists (system.openLogsFolder); there is NO "support.bundle" / "exportBundle"
  channel.
  electron/sync/sync.service.ts:101-129 — the sync document tracks
    lastAttemptAt / lastOwnerAttemptAt / lastError / lastOwnerError, and
    sync.service.ts:407 counts pending outbox rows
    (`SELECT COUNT(*) AS c FROM sync_outbox WHERE status = 'pending'`).
    The data EXISTS; it is simply not assembled.
  The reference's indicator list:
    .opencode/skills/veloria-observability/references/diagnostic-policy.md:21-28
  The "last successful print" indicator has no source: printing.service.ts and
  printing.watchdog.ts do not persist a success counter.
ROOT_CAUSE:
  Diagnostics were built as an operator-facing channel and a log folder, not as
  a structured support artefact.
IMPACT:
  Low-moderate. The operational cost is real but small: a support request
  requires the customer to send whatever is in the logs folder, with no
  redaction review — which is exactly the scenario OBS-01's sanitiser is
  designed to protect. The missing "last successful print" indicator is a
  genuine diagnostic gap: "printing does not work" is a common field issue and
  there is no counter to consult.
RECOMMENDED_FIX:
  (1) Add a `support.bundle` channel (staff-gated to the settings permission,
      and licence-gated) that assembles a ZIP containing: app/build version, OS
      and runtime versions, the sanitized log files, the DB schema version, the
      last backup status, the pending-sync-queue depth, the device/print
      capability state and the crash count — and NOTHING else. The channel
      should FIRST return a manifest of what WOULD be included, so the UI can
      show a preview; the export happens only after confirmation.
  (2) Add a small persisted counter for successful prints (per printer name and
      date) and for crashes/restarts, so the health indicators the reference
      lists become real.
  (3) Exclude the database contents and the sync configuration from the bundle
      by construction.
REGRESSION_TEST:
  A test that generates a bundle in a temp dir, asserts it contains no
      credential-shaped string, no customer name, and no database file, and that
      the preview manifest matches the archive's contents.
DEPENDENCIES:
  OBS-01, SEC-03.
```

```text
ID: OBS-03
TITLE: The per-request correlation id is generated in the main process and never reaches the renderer or the database, so a workflow cannot be traced end to end
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-observability
AFFECTED_MODULE: electron/ipc, src/shared/types
FILE: electron/ipc/handle.ts
LINE_RANGE: 44-49, 105-114
PROBLEM:
  The skill requires: "Use operation IDs to correlate a workflow across UI, main,
  database, sync, and printer without copying sensitive payloads into every log
  line."
  The implementation generates a requestId in the main process and logs it with
  the handler's duration and error. It is a good correlation id WITHIN the main
  process — but it is never returned to the renderer, never attached to the
  database write, and never visible in the log entry of the business operation.
  Consequently, a user-reported action ("the sale of 12 500 DA at 14h02 did not
  print") cannot be traced from the UI event to the database row and the print
  attempt: the renderer has no id, the DB row has a different id (the business
  operationId), and the print attempt has a third.
  The code is explicit that the requestId is NOT the business operationId, which
  is correct — but the business operationId is a caller-supplied value only for
  mutations that declare it, and the PRINT path (which is not a mutation) has
  no id at all.
EVIDENCE:
  electron/ipc/handle.ts:45-49
    // M-2 CLARITY: this is a LOG-CORRELATION id per IPC request, never a
    // business operationId — business idempotency always uses the
    // caller-owned `input.operationId` (see handlers). Named distinctly so no
    // future handler mistakes it for retry identity.
    const requestId = randomUUID();
  electron/ipc/handle.ts:106-111 — requestId is logged as `operation_id`:
    log("ERROR", "ipc", "handler.failed", { channel, operation_id: requestId, duration_ms, error });
  — note the field name is `operation_id`, which is the SAME name the business
  operationId uses elsewhere; the comment says the two are distinct, but the
  log key does not distinguish them. A reader correlating logs by
  `operation_id` could conflate the two.
  The requestId is not returned to the renderer, so the renderer cannot log it.
  src/shared/types/ipc-client.ts — the `call()` wrapper has no id parameter and
  discards nothing, but it also has no correlation handle to pass.
ROOT_CAUSE:
  The correlation id was scoped to the main process when it was introduced, and
  was never extended to the renderer or the persistence layer.
IMPACT:
  Low. Diagnosis is possible but requires joining on timestamps and channels
  rather than on an id. The `operation_id` key collision is a genuine
  readability hazard for anyone correlating logs.
RECOMMENDED_FIX:
  (1) Rename the log key from `operation_id` to `request_id` so the two concepts
      are unambiguous in the logs (a one-line change with real diagnostic
      value).
  (2) Optionally return the requestId to the renderer as part of the error
      outcome so the UI can display a short reference ("Réf. 3f2a…") that the
      customer can quote, and so a support request can be traced.
REGRESSION_TEST:
  A test asserting that a log entry for a failed handler contains `request_id`
  and NOT `operation_id`, and that the two namespaces cannot collide in a log
  query.
DEPENDENCIES:
  None.
```

```text
ID: OBS-04
TITLE: No rate limiting on repeated log events, so a failing retry loop can flood the log file
SEVERITY: P3
CONFIDENCE: NEEDS_VERIFICATION
AFFECTED_SKILL: veloria-observability
AFFECTED_MODULE: electron/services/logger.ts, electron/sync
FILE: electron/services/logger.ts
LINE_RANGE: 62-79
PROBLEM:
  The skill requires: "Avoid retry storms and log floods" and "Bound log size and
  retention; rotate safely and avoid unbounded disk growth."
  Retention is bounded (14 days), but the VOLUME within a day is not: `log()`
  appends unconditionally. A repeating failure — a mirror that is down and
  retried every cycle, or a printer that errors on every attempt — will append
  the same line thousands of times, and the daily file grows without limit.
  The 14-day retention does not bound a single day's file.
EVIDENCE:
  electron/services/logger.ts:73-78 — unconditional appendFileSync per call.
  No counter, no sampling, no per-event throttling in the logger.
  electron/sync/sync.service.ts:465-466 — the sync failure path writes
    lastError/lastAttemptAt on every attempt.
  The outbox push is bounded to 200 rows per cycle (sync.service.ts:690), so the
  per-cycle volume is bounded, but the CYCLE FREQUENCY and the number of
  cycles are not bounded by the logger.
ROOT_CAUSE:
  The logger was designed for correctness-first diagnostics without a volume
  governor.
IMPACT:
  Low. The daily file grows with the failure rate; on a POS with a modest disk
  this is not a practical problem in a single day, and the 14-day purge bounds
  the total. The genuine risk is that a repeated identical error fills the file
  and pushes the interesting entries out of view for an operator tailing it.
RECOMMENDED_FIX:
  Add a simple per-event throttle in the logger: keep an in-memory map of
  (component, event) -> count, and after N identical events within a window,
  emit one "suppressed N occurrences" line and stop writing repeats. Also cap
  the daily file size with a rotation.
REGRESSION_TEST:
  A test that emits the same event 1000 times and asserts the file contains the
  first few plus a suppression line, and that the file size stays bounded.
DEPENDENCIES:
  None.
```

## 5. What is genuinely solid

- **A logging failure can never break a sale.** logger.ts:74-78 swallows the append error entirely. This is the exact requirement "Do not let logging failure crash sales or database writes", and it is honoured.
- **The log file is named by BUSINESS DAY, not wall-clock day** (logger.ts:44-45, using `businessDayOf`). A nightly close therefore spans one file — a thoughtful detail for a POS that operates across midnight.
- **Rotation costs nothing on the write path.** The purge runs only at startup (logger.ts:13-16 explains why).
- **Structured JSON lines with a stable envelope** — timestamp, level, component, event — so the logs are queryable without a parsing library.
- **Crash handling is a first-class flow, not an afterthought.** `handleUncaughtException` logs the message and a CAPPED stack (2000 chars — a deliberate bound), checkpoints and closes the database, shows a FRENCH message to the user ("l'application va se fermer pour protéger vos données… votre base est conservée"), and exits after 6 s so the app never becomes a zombie with an open DB.
- **Renderer crashes are handled too** — `handleRendererGone` reloads the live window and never reloads a destroyed one.
- **The renderer never sees a technical error.** `ipc-client.ts:16-29` explicitly handles the Electron raw-reject case (the English "Error invoking remote method 'sales.create'" text) and replaces it with a French message — the comment explains that this exact case previously reached the operator.
- **No telemetry at all.** For an offline-first product with a privacy commitment, having zero remote collection is the correct default and is verifiably the case.
- **The sync health data is tracked even if not surfaced** — lastAttemptAt, lastError, pending outbox count.

## 6. Not verified / limits of this audit

- **The 14-day retention and the startup purge were not exercised** against a directory with aged files.
- OBS-04's practical severity depends on the retry cadence, which the audit did not establish precisely.
- The `app.diagnostics` output content was not read in full.
- No log file from a real installation was analysed (none is present in the repository, and reading a customer's log was out of scope).
- The `mobile/` and `owner/` apps' logging were not audited.

## 7. Metrics

| Metric                                      | Value                                     |
| ------------------------------------------- | ----------------------------------------- |
| Observability source files inspected        | 9                                         |
| Log call sites swept for sensitive payloads | all (mechanical) — 0 unsafe matches found |
| Skill checklist items evaluated             | 16 (10 VERIFIED, 4 PARTIAL, 2 NOT_FOUND)  |
| Redaction layers                            | **0**                                     |
| Support bundle exports                      | **0**                                     |
| Findings                                    | 4 (P0×0, P1×0, P2×2, P3×2)                |
