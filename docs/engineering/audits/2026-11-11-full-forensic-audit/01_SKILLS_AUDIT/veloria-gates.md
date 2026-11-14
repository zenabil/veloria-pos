# veloria-gates â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

The gate suite is real and mostly trustworthy: 1497 tests pass, 53 E2E pass against the actual Electron app, coverage is measured at 93.29% statements / 88.65% branches / 97.29% functions / 95.77% lines, per-file thresholds block regressions, and several gates carry genuine negative proof. Two gates are currently RED and both are release-relevant: the secret scan (which blocks packaging) and the per-file coverage threshold. The suite's weakest area is the absence of an automated wrong-sender / malformed-payload negative test over the IPC boundary.

## 2. Scope covered

SKILL.md (59 L) + references/gate-design.md (20 L); tests/{unit 140, integration 53, database 10, e2e 27}; vitest.config.ts, vitest.features.config.ts, vitest.coverage-all.config.ts; config/playwright.config.ts; scripts/quality/* (6); scripts/database/verify-migrations.mjs; scripts/licensing/secret-scan.mjs; eslint.config.mjs; tsconfig*.json; .github/workflows/*.

## 3. Skill checklist result

| Criterion                                                                      | Status       | Evidence                                                                                                                                                             |
| ------------------------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every gate has invariant, scope, command, expected result, failure mode, owner | **PARTIAL**  | Invariants and commands are real; formal ownership fields are absent                                                                                                 |
| A test must fail when the protected behavior is broken                         | **PARTIAL**  | Proven for migrations (sha256 lock), raw-channel coverage, FR non-vacuity, domain transaction/operationId; absent for sender validation and backup corruption        |
| Avoid vacuous success                                                          | **VERIFIED** | verify:fr has a 300-file floor; verify:domain asserts 70 mutations; allowOnly:false in all vitest configs                                                            |
| Report test count, skipped tests, coverage scope                               | **PARTIAL**  | Counts are reported by the runner; skipped tests are not surfaced in CI output as a budget                                                                           |
| Separate static/unit/integration/db/E2E/build/manual layers                    | **VERIFIED** | Distinct npm scripts per layer                                                                                                                                       |
| Do not inflate coverage with implementation-detail tests                       | **VERIFIED** | vitest.coverage-all.config.ts explicitly declines to fake-DOM-cover .tsx and defers UI proof to Playwright                                                           |
| A failed test may not be deleted or weakened                                   | **VIOLATED** | Not violated by this audit; but the client-order coverage failure is currently being 'handled' by an in-flight feature rather than fixed â€” see 08_QUALITY_GATES.md |
| Capture actual command, exit status, output summary                            | **VERIFIED** | This audit executed and captured all of them â€” see 05_TEST_EXECUTION_REPORT.md                                                                                     |

## 4. Findings raised by this skill

- **SKILL-04** â€” full finding block in `01_SKILLS_AUDIT/SKILLS_SYSTEM_AUDIT.md` Â§3.

## 5. What is genuinely solid

- allowOnly: false in every vitest config and forbidOnly: true in Playwright â€” a committed `.only` cannot silently shrink the suite.
- verify-domain.ts performs STATIC analysis over all 70 IPC mutations and asserts each is inside a transaction and carries an operationId. That is a negative-proof gate of exactly the kind references/gate-design.md asks for.
- The E2E suite launches the real Electron app with a temporary PROGRAMDATA and userData, so it never touches production data.
- verify-docs checks the skill registry, the AGENTS.md routing table and the orchestrator matrix against the filesystem â€” a real self-check on the toolchain itself.

## 6. Not verified / limits of this audit

- Coverage numbers were obtained from the project's own v8 provider â€” real, but the provider measures line/branch execution, not assertion strength.
- Mutation testing was not run; negative proofs are the hand-written ones listed above.

## 7. Metrics

- Checklist items evaluated: **8** â€” PARTIAL: 3, VERIFIED: 4, VIOLATED: 1
- Skill-level findings owned by this skill: **1**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
