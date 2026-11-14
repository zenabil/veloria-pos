# veloria-security â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

The security posture is strong for a local desktop POS: no renderer-to-native path, no generic IPC escape hatch, secrets out of source and out of the mobile bundle, RLS deny-by-default on the mirror, path traversal defended with symlink resolution, and an integrity manifest over the build. The two material gaps are the absence of sender-frame validation on IPC handlers, and the presence on this machine of the Ed25519 private key matching the shipped public key.

## 2. Scope covered

SKILL.md + references/threat-model-checklist.md; electron/security/security.ts (144 L); electron/ipc/{handle,ipc-errors,raw-guards,license-gates,staff-gates,credit-gates}.ts; electron/licensing/*; electron/sync/sync-secrets.ts; electron/backup/backup.service.ts; electron/ocr/ocr-files.ts; cloud/supabase/rls.sql; scripts/licensing/secret-scan.mjs; config/electron-builder/pos.yml.

## 3. Skill checklist result

| Criterion                                                                     | Status       | Evidence                                                                                                                                   |
| ----------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Renderer/preload/main trust boundary enforced                                 | **VERIFIED** | contextIsolation+sandbox+no nodeIntegration; 0 native imports in src/                                                                      |
| IPC authorization, schema, and error contracts per channel                    | **VERIFIED** | handle.ts enforces licence/page/feature/staff/credit gates + Zod                                                                           |
| Sender validation                                                             | **VIOLATED** | No handler validates event.sender â€” see 05_ELECTRON.md ELEC-04                                                                           |
| Path traversal / unsafe file access                                           | **VERIFIED** | security.ts:108-143 assertSafeUserFolder normalises, resolves symlink parents, denies system roots on any drive; ocr-files.ts bounds input |
| SQL injection                                                                 | **VERIFIED** | prepared statements throughout; dynamic SQL limited to a fixed allow-list of sort/column names                                             |
| Secrets in source, config, DB, logs, renderer, mobile bundle, build artifacts | **VERIFIED** | secret-scan fails closed over 20+ trees; no literal key found                                                                              |
| License signing keys never in customer software                               | **PARTIAL**  | public key only is shipped â€” but the matching private key is on this dev disk (LIC-02)                                                   |
| Customer authentication and per-customer isolation                            | **VERIFIED** | Edge Function + RLS deny-by-default + REVOKE                                                                                               |
| Update / installer / artifact integrity                                       | **PARTIAL**  | SHA256 manifests OK; no Authenticode signature; verifyUpdateCodeSignature:false                                                            |
| Data minimization and retention                                               | **VERIFIED** | log retention 14 days; backup retention 30; outbox restricted (0038)                                                                       |
| Fail closed without destroying customer data                                  | **VERIFIED** | license failure blocks features, never deletes data                                                                                        |
| Negative tests proving rejection                                              | **PARTIAL**  | validation/gate negative proofs exist; sender-rejection negative proof absent                                                              |

## 4. Findings raised by this skill

No skill-level contradiction was found. The skill's rules are implementable and, where checkable, already implemented in the codebase. Domain-level defects discovered while auditing this skill's subject matter are reported in the corresponding `03_SKILL_AUDITS/` file and are cross-referenced there.

## 5. What is genuinely solid

- The secret scan is deliberately fail-closed and scans an unusually wide set of trees (including .opencode/, config/, cloud/, .github/) â€” and it currently FAILS, which proves it is not vacuous.
- Path validation resolves symlink parents up to 32 levels and refuses UNC paths and bare drive roots.
- sql-guard.ts exists as an explicit deny-list even though no generic SQL channel exists â€” defence in depth that stays cheap.
- The renderer never sees a secret: the Supabase service_role key is confined to the main process (sync-secrets.ts M3 fix).

## 6. Not verified / limits of this audit

- No live penetration test was performed; all security conclusions are static analysis plus the executed gate suite.
- The production Supabase project's RLS policies could not be verified against the running instance.

## 7. Metrics

- Checklist items evaluated: **12** â€” VERIFIED: 8, VIOLATED: 1, PARTIAL: 3
- Skill-level findings owned by this skill: **0**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
