# veloria-db â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

The DB skill is the best-aligned skill in the bundle and the schema is genuinely well-built: forward-only migrations with a sha256 lock, FK enforcement ON, WAL + synchronous=FULL, fail-closed pre-migration snapshots, 217 CHECK constraints and 77 triggers. The one real conflict is the skill's own prohibition on hardcoded UTC+1, which the project hardcodes in three places.

## 2. Scope covered

SKILL.md (92 L) + references/invariants.md (38 L) + references/migrations.md (13 L); all 63 migrations; database/migrations.lock.json; electron/database/_.ts; scripts/database/_.mjs.

## 3. Skill checklist result

| Criterion                                                    | Status       | Evidence                                                                                          |
| ------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------- |
| No already-shipped migration was edited                      | **VERIFIED** | sha256 lock verified by `npm run verify:migrations`                                               |
| Fresh install and upgrade paths pass                         | **VERIFIED** | verify:migrations applies 63 migrations on a temp DB, integrity_check=ok                          |
| Foreign keys and constraints are actually enabled and tested | **VERIFIED** | sqlite.service.ts:38 `foreign_keys = ON`; verify:migrations reports foreign_key_violations=0      |
| Multi-row writes are atomic                                  | **VERIFIED** | verify:domain: 'toute mutation IPC est dans une transaction (ok)' over 70 mutations               |
| Retry cannot duplicate the effect                            | **VERIFIED** | idempotency_keys table (0021) + handlers/idempotency.ts + operationId enforced by handle.ts:88-93 |
| SQL values are parameterized                                 | **VERIFIED** | repositories use db.prepare(...).run(...) throughout                                              |
| No renderer-to-database shortcut                             | **VERIFIED** | grep over src/ for electron                                                                       | node: | fs  | better-sqlite3 => 0 matches |
| Query plans and bounded reads are reasonable                 | **VERIFIED** | paginationSchema + pageSize caps; 166 indexes; verify:perf measures all hot paths                 |
| Backup and recovery implications are addressed               | **VERIFIED** | snapshotBeforeMigration fail-closed (sqlite.service.ts:145-151)                                   |
| Tests prove both success and failure paths                   | **VERIFIED** | 1497 tests pass; tests/database/ exists                                                           |
| Do not hardcode `+1 hour` as a permanent timezone algorithm  | **VIOLATED** | SKILL.md:57 vs business-day.ts:11,17 â€” see SKILL-02                                             |
| Use `Africa/Algiers` via named-zone handling                 | **PARTIAL**  | The zone is named as a label only; the offset is arithmetic                                       |

## 4. Findings raised by this skill

- **SKILL-02** â€” full finding block in `01_SKILLS_AUDIT/SKILLS_SYSTEM_AUDIT.md` Â§3.

## 5. What is genuinely solid

- Immutable migration lock (`database/migrations.lock.json`) with a sha256 per file â€” editing an applied migration now fails CI. This is the strongest single control in the codebase.
- Pre-migration snapshot is FAIL-CLOSED: if the snapshot cannot be written, the migration is refused (sqlite.service.ts:145-151), not merely warned about.
- Money purity is machine-enforced: verify:migrations asserts every `*_minor` column is INTEGER.
- The DB CHECK constraints act as a last-resort wall below the application guards (e.g. 0037 negative-stock, 0048/0058 period locks).

## 6. Not verified / limits of this audit

- Migration behaviour was exercised on a disposable temp DB by the verify script; the live `Veloria POS DB.sqlite` was never opened.
- Query plans were reasoned from the SQL and the verify:perf timings, not captured via EXPLAIN QUERY PLAN for every statement.

## 7. Metrics

- Checklist items evaluated: **12** â€” VERIFIED: 10, VIOLATED: 1, PARTIAL: 1
- Skill-level findings owned by this skill: **1**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
