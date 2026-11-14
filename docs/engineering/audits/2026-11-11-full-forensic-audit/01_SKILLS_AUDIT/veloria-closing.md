# veloria-closing â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

Daily closing is implemented carefully â€” a cash-session model with a database-enforced single-active-session constraint, close/reopen that is authorised and audited, business-day period-lock triggers that fail closed, and a Z report built from movement ledgers rather than from invoice timestamps. The main weaknesses are that the business day uses a fixed UTC+1 offset (forbidden by the governing rules), and that the owner snapshot published to the cloud is a second, independently maintained reporting path whose totals are not proven to equal the in-app Z report.

## 2. Scope covered

SKILL.md (63 L) + references/z-report-and-cash-reconciliation.md; electron/ipc/handlers/cash-session.repo.ts (15 KB), finance.repo.ts (39 KB), expenses.repo.ts, debt-status.ts, dashboard.repo.ts; electron/shared/business-day.ts (191 L); src/domain/{closings,cash,zakat}; src/features/{zakat,reports}; migrations 0048, 0058, 0059; electron/sync/owner-snapshot.ts (56 KB).

## 3. Skill checklist result

| Criterion                                                          | Status       | Evidence                                                                                                                  |
| ------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Verify the approved business timezone                              | **PARTIAL**  | Africa/Algiers named; fixed +1h applied arithmetically â€” see SKILL-02                                                   |
| Build cash reconciliation from actual cash movements               | **VERIFIED** | sale_payments ledger + supplier_payments + return_refund_movements drive the Z figure                                     |
| Distinguish cash sales from collections on old receivables         | **VERIFIED** | payments are dated by their own payment_date, not by the invoice date                                                     |
| Include only paid expenses as cash outflows                        | **VERIFIED** | expenses carry a paid state; unpaid excluded                                                                              |
| Record refunds when money leaves the drawer                        | **VERIFIED** | return_refund_movements (migration 0060) is separate from returns                                                         |
| Avoid double counting between legacy fields and normalized ledgers | **VERIFIED** | explicit absence check guards the fallback                                                                                |
| A report must expose its source movements and formula              | **PARTIAL**  | movement-based, but the owner snapshot is a separate implementation                                                       |
| Enforce uniqueness of active sessions in the database              | **VERIFIED** | migration 0059 partial unique index â€” verify:migrations: '0059 sessions de caisse (poste unique ouvert, forme, bornes)' |
| Derive variance from counted minus expected                        | **VERIFIED** | cash-session.repo.ts stores counted + expected, derives variance                                                          |
| Enforce closed-period write block at the trusted boundary          | **VERIFIED** | migration 0048 = 15 triggers, migration 0058 = business-day lock; verify:migrations confirms both                         |
| Reopening authorized, reasoned, idempotent, auditable              | **VERIFIED** | closings.reopen is staff-gated and traced (ADR/registry comment)                                                          |
| Zakat: configurable, provenance, fail closed on incomplete totals  | **VERIFIED** | zakat.saveParams / zakat.save; verify:migrations '0012 bread/proforma/zakat'                                              |
| Owner snapshot: opt-in, bounded, versioned, no secrets             | **PARTIAL**  | See 09_CLOSING.md for the dual-reporting-path concern                                                                     |

## 4. Findings raised by this skill

No skill-level contradiction was found. The skill's rules are implementable and, where checkable, already implemented in the codebase. Domain-level defects discovered while auditing this skill's subject matter are reported in the corresponding `03_SKILL_AUDITS/` file and are cross-referenced there.

## 5. What is genuinely solid

- The closed-period lock is a database trigger, not a UI button â€” 15 triggers in migration 0048 plus the business-day lock in 0058. This is the single strongest guarantee against post-close contamination.
- Cash sessions enforce a single active session at the database level, so a race cannot open two registers.
- Refunds are modelled as money movements (0060) rather than as a return attribute, which is what makes the drawer reconciliation honest.
- The business-day helper exposes date-only columns and instant columns through DIFFERENT functions (calendarDaySql vs businessDaySql) with an explicit comment that date-only columns must never be shifted â€” that is a subtle bug class handled correctly.

## 6. Not verified / limits of this audit

- A real end-of-day close with a physical cash count was not performed (requires hardware and a seeded database).
- The published owner-snapshot Z figure was not compared numerically against the in-app Z figure for the same dataset in this audit pass â€” see 09_CLOSING.md as NEEDS_VERIFICATION.

## 7. Metrics

- Checklist items evaluated: **13** â€” PARTIAL: 3, VERIFIED: 10
- Skill-level findings owned by this skill: **0**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
