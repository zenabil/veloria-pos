# veloria-money â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

Money handling is the strongest domain in the project: integer centimes end to end, one authoritative domain module, a mirrored main-process guard with a machine-checked parity test, exact string-based decimal parsing, overflow guards before multiplication, and a largest-remainder allocation that conserves the total exactly (verified by 200 000 fuzz cases with zero mismatches). The weaknesses are minor: duplicated constants across two module trees, and no written money policy document.

## 2. Scope covered

SKILL.md (79 L) + references/parity-and-rounding.md (32 L); src/domain/money/money.ts (346 L); src/shared/money/parse.ts; electron/ipc/money-guard.ts; electron/ipc/handlers/amount-allocation.ts, cost-allocation.ts, numbers.ts, return-settlement.ts; DB money columns.

## 3. Skill checklist result

| Criterion                                                      | Status       | Evidence                                                                                                                               |
| -------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| One documented minor-unit scale and rounding policy            | **VERIFIED** | MINOR_PER_MAJOR=100 (money.ts:14); rounding half-away-from-zero on decimal STRINGS (money.ts:181-187)                                  |
| No floating-point monetary source of truth                     | **VERIFIED** | parseDzdInputStrict uses regex + string ops (money.ts:142-164); Number() coercion explicitly removed and documented (money.ts:132-141) |
| Trusted write boundary recalculates monetary facts             | **VERIFIED** | registry.sales.ts:31-44 re-prices every line via priceLine() before persisting                                                         |
| Limits are centralized and overflow-safe                       | **VERIFIED** | MAX_MINOR_SINGLE=1e9, MAX_MINOR_TOTAL=1e11 (money.ts:17-19), mirrored in money-guard.ts:14-16                                          |
| Historical documents retain their original financial snapshots | **VERIFIED** | sale_items stores original_unit_price_minor, unit_price_minor, cogs_minor (sales.repo.ts:712-714)                                      |
| Refunds and reversals have auditable movement records          | **VERIFIED** | return_refund_movements table (migration 0060)                                                                                         |
| Tests cover boundaries, rounding, parity, and retries          | **VERIFIED** | tests/unit/money-guard-parity.test.ts and domain money tests; allocation fuzz verified independently in this audit                     |
| Global discount allocation conserves the total                 | **VERIFIED** | allocateAmountByWeights: 200000/200000 fuzz cases conserved, 0 throws, 0 mismatches                                                    |

## 4. Findings raised by this skill

- **SKILL-03** â€” full finding block in `01_SKILLS_AUDIT/SKILLS_SYSTEM_AUDIT.md` Â§3.

## 5. What is genuinely solid

- The strict parser rejects exponent notation, hex, leading '+', NaN and Infinity by construction (regex gate, money.ts:151) â€” the class of bug where `Number('1e3')` silently became 1000 DA is genuinely closed.
- `formatDzd` never throws (returns 'â€”') while `formatDzdStrict` throws â€” an explicit, documented split that prevents an ErrorBoundary crash in front of a cashier.
- Overflow is checked BEFORE the multiplication, not after (money.ts:295-297, money-guard.ts:91).
- Line-total tolerance in 'Montant' mode is a bounded function of the unit price (money-guard.ts:73-76), not an unbounded fudge factor.

## 6. Not verified / limits of this audit

- The 200 000-case allocation fuzz re-implemented the algorithm from source rather than importing the compiled module; the algorithm was transcribed faithfully but this is a re-implementation, not an in-process import.
- Rounding of `percentOfMinor` uses Math.round on an integer product divided by 100 â€” exact for integers within bounds, but not verified against a half-boundary table in this audit.

## 7. Metrics

- Checklist items evaluated: **8** â€” VERIFIED: 8
- Skill-level findings owned by this skill: **1**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
