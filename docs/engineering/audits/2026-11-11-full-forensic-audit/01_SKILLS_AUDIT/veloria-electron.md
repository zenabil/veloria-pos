# veloria-electron â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

The Electron boundary is genuinely well built: contextIsolation on, nodeIntegration off, sandbox on, webviewTag off, deny-by-default navigation with an https-only external allowlist, permission requests denied on every window, and a 201-channel typed surface with no generic SQL or arbitrary-invoke escape hatch. The material gap is that no handler validates the sending frame, and 38 raw channels bypass the central `handle()` wrapper (mitigated by a machine-verified guard list, but not by the same Zod/licence/staff pipeline).

## 2. Scope covered

SKILL.md (63 L) + references/main-process-security.md (34 L); electron/main/_.ts (7); electron/preload/preload.ts (339 L); electron/ipc/channels.ts (251 L); 12 registry._.ts; 13 validators.*.ts; handle.ts, ipc-errors.ts, raw-guards.ts, license-gates.ts, credit-gates.ts, staff-gates.ts, money-guard.ts; electron/security/security.ts.

## 3. Skill checklist result

| Criterion                                                        | Status       | Evidence                                                                                                                                 |
| ---------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Context isolation enabled                                        | **VERIFIED** | window-manager.ts:51                                                                                                                     |
| Node integration disabled in renderer                            | **VERIFIED** | window-manager.ts:52                                                                                                                     |
| Preload is the only intended bridge                              | **VERIFIED** | renderer grep for electron                                                                                                               | node: | fs => 0 matches; preload exposes only named functions |
| CSP is restrictive and verified                                  | **PARTIAL**  | index.html CSP present but not audited against the real asset set in this pass â€” see 05_ELECTRON.md                                    |
| Navigation and popup creation are restricted                     | **VERIFIED** | security.ts:16-28 deny-by-default; window-manager.ts:75-103                                                                              |
| External URL handling is explicit and validated                  | **VERIFIED** | isSafeExternalUrl requires https (security.ts:34-36)                                                                                     |
| Every channel has a schema and bounded payload                   | **PARTIAL**  | 161/199 handlers use the guarded wrapper with a Zod schema; raw channels parse individually â€” see 05_ELECTRON.md                       |
| Sender/frame is validated                                        | **VIOLATED** | No handler inspects event.sender â€” see 05_ELECTRON.md ELEC-04                                                                          |
| Authorization and license checks happen in trusted code          | **VERIFIED** | handle.ts:52-84; 68 licence-protected channels, 117 page-gated, 146 staff-gated                                                          |
| No arbitrary SQL, shell, filesystem, or generic IPC escape hatch | **VERIFIED** | grep found no run-sql/exec/query channel; sql-guard.ts is a deny-list for a non-existent generic path                                    |
| Errors are sanitized for UI                                      | **VERIFIED** | ipc-errors.ts + toUserMessage(); renderer ipc-client.ts:28 maps raw rejects to an FR message                                             |
| Mutations have transactional and idempotent behavior             | **VERIFIED** | verify:domain asserts 70/70 IPC mutations are transactional and carry an operationId                                                     |
| Main and preload artifacts are packaged                          | **VERIFIED** | pos.yml includes dist-electron/**/*; extraResources carries migrations, public key, OCR lang                                             |
| Native modules match Electron ABI                                | **VERIFIED** | better-sqlite3 13 ships prebuilds/win32-x64.node (N-API) â€” ABI-stable across Node and Electron; npmRebuild: false is therefore correct |

## 4. Findings raised by this skill

No skill-level contradiction was found. The skill's rules are implementable and, where checkable, already implemented in the codebase. Domain-level defects discovered while auditing this skill's subject matter are reported in the corresponding `03_SKILL_AUDITS/` file and are cross-referenced there.

## 5. What is genuinely solid

- The raw-channel guard list is a machine-checked contract, not a comment: electron/ipc/raw-guards.ts:51-64 documents a test that requires RAW_GUARDED_CHANNELS to be EXACTLY the set of raw channels calling enforceRawChannelGates.
- security.ts:54-99 resolves symlink parents and denies system roots on every drive letter, not just C:.
- The preload exposes a frozen, named API surface â€” no raw ipcRenderer, no fs, no invoke(channel, ...args).
- handle.ts:86-93 refuses a missing operationId for any schema that requires one, with an FR message, instead of generating one server-side.

## 6. Not verified / limits of this audit

- The packaged artifact was not launched and re-inspected on a clean Windows profile in this audit; packaging config was read statically.
- CSP strictness was not validated against the real production asset graph.

## 7. Metrics

- Checklist items evaluated: **14** â€” VERIFIED: 11, PARTIAL: 2, VIOLATED: 1
- Skill-level findings owned by this skill: **0**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
