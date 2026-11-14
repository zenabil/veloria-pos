# veloria-observability â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

Observability is deliberately minimal and, for an offline-first POS, largely appropriate: a structured JSON-lines logger with a per-business-day file, 14-day retention, rotation on startup only, and a hard rule that a logging failure can never crash a sale. The skill's fuller target â€” health indicators, correlation IDs across layers, support bundles, metrics â€” is only partially realised, and the privacy/redaction requirement is not machine-enforced.

## 2. Scope covered

SKILL.md + references/diagnostic-policy.md; electron/services/logger.ts (80 L); electron/main/crash-recovery.ts, app-lifecycle.ts, startup-flow.ts; electron/ipc/handle.ts:106-111 (correlation id); electron/ipc/ipc-errors.ts; src/app/shell/use-notifications.ts; src/features/license/LicenseBadge.tsx; scripts/licensing/secret-scan.mjs.

## 3. Skill checklist result

| Criterion                                                                                          | Status        | Evidence                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Local diagnostics work without internet                                                            | **VERIFIED**  | logger writes to userData/logs; no network call anywhere in the logging path                                            |
| Remote telemetry disabled unless approved                                                          | **VERIFIED**  | no telemetry/analytics dependency in package.json                                                                       |
| Core operations must not wait for analytics                                                        | **VERIFIED**  | no analytics code path exists                                                                                           |
| Structured logs with timestamp, severity, component, event code, duration, sanitized context       | **VERIFIED**  | logger.ts:62-69 emits {timestamp, level, component, event, ...extra}; handle.ts:106-111 adds operation_id + duration_ms |
| Never log passwords, PINs, signing keys, API tokens, license private material, payment credentials | **PARTIAL**   | the logger has no redaction layer â€” correctness depends on call sites. See OBS-01.                                    |
| Redact or hash identifiers when raw values are not needed                                          | **PARTIAL**   | no automatic hashing; call sites must pre-hash                                                                          |
| Bound log size and retention; rotate safely                                                        | **VERIFIED**  | LOG_RETENTION_DAYS=14, per-day files, prune at startup only                                                             |
| Do not let logging failure crash sales or DB writes                                                | **VERIFIED**  | logger.ts:74-78 swallows append errors                                                                                  |
| Keep user-facing French messages separate from technical diagnostics                               | **VERIFIED**  | logger writes JSON to disk; ipc-errors.ts maps to FR for the UI                                                         |
| Use operation IDs to correlate a workflow across UI, main, DB, sync, printer                       | **PARTIAL**   | handle.ts generates a requestId per IPC call, explicitly distinguished from the business operationId (handle.ts:45-48)  |
| Distinguish validation errors from unexpected faults                                               | **VERIFIED**  | toUserMessage() separates them; log levels differ                                                                       |
| Support bundle: user-initiated, previews contents                                                  | **NOT_FOUND** | app.diagnostics exists but no bundle export with a preview step                                                         |
| Redaction tests with fake emails/phones/tokens/PIN-like strings                                    | **NOT_FOUND** | No such test fixture was found â€” see OBS-01                                                                           |

## 4. Findings raised by this skill

No skill-level contradiction was found. The skill's rules are implementable and, where checkable, already implemented in the codebase. Domain-level defects discovered while auditing this skill's subject matter are reported in the corresponding `03_SKILL_AUDITS/` file and are cross-referenced there.

## 5. What is genuinely solid

- The log file is named by BUSINESS DAY, not by wall-clock day â€” logger.ts:44-45 â€” so a nightly close spans one file. That is a thoughtful detail for a POS.
- Retention purge happens only at startup, so the write path has zero purge cost (logger.ts:13-16 comment).
- The requestId/business-operationId distinction in handle.ts:45-48 is explicitly documented to stop a future handler from conflating log correlation with retry identity.
- Crash recovery is a first-class flow with a dedicated window rather than an unhandled exception dialog.

## 6. Not verified / limits of this audit

- No automated redaction test exists â€” the 'never log secrets' rule is convention, not enforcement (OBS-01).
- No support-bundle export with content preview was found.

## 7. Metrics

- Checklist items evaluated: **13** â€” VERIFIED: 8, PARTIAL: 3, NOT_FOUND: 2
- Skill-level findings owned by this skill: **0**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
