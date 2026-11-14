---
name: veloria-money
description: "Implement exact and auditable money handling for Veloria, including DZD parsing, rounding, totals, discounts, payments, refunds, reports, and parity across UI, main process, and SQLite."
---

# Veloria Money — exact monetary arithmetic and reconciliation

## Mission

Prevent loss, creation, or misstatement of money through parsing, rounding, floating-point drift, inconsistent totals, retries, concurrency, or reporting double counts.

## Core representation

- Use integer minor units for persisted and computed money. For DZD, confirm and document the project's chosen minor-unit scale before changing any representation.
- Never use binary floating-point as the source of truth for a monetary calculation.
- Do not scatter numeric ceilings, rounding constants, or tax rules across the codebase. Centralize them in a documented domain policy.
- Parse user-entered decimal text with a strict decimal parser. Reject exponent notation, hexadecimal, malformed separators, NaN, Infinity, and unsupported negative values according to the field's business rule.
- Format only at display boundaries. Formatting must not change the stored amount.

## Single policy for rounding

For every conversion, multiplication, percentage, tax, allocation, discount, and division, identify the approved rounding mode and the stage at which rounding occurs. Document examples that distinguish competing interpretations. Never silently substitute `Math.round`, `toFixed`, `parseFloat`, or an implicit language conversion for the approved rule.

## Trust boundaries

- Renderer values are proposals, not authority.
- The main/domain write boundary re-reads trusted product, price, discount, customer-credit, tax, and delivery facts and recalculates totals.
- The database provides final constraints where practical.
- If the main process recalculates a value, test that its result matches the domain implementation. Prefer shared pure modules where architecture permits; if duplication is unavoidable, prove parity with tests.

## Required calculation contracts

Define and test, as applicable:

- Unit price × quantity.
- Line subtotal and invoice subtotal.
- Fixed and percentage discounts, including signed adjustments only if approved.
- Delivery, fees, taxes, and exemptions.
- Global discount allocation across lines, with exact conservation of the allocated total.
- Partial payments, credit applied, outstanding balance, overpayment, and refunds.
- Returns, cancellations, reversals, and corrections.
- COGS, gross margin, below-cost sales, and valuation reports.

Each contract must specify valid range, unit, rounding, overflow behavior, and error message.

## Defensive rules

- Check bounds before multiplication or aggregation to avoid overflow.
- Reject unsafe integers and invalid JSON values at input boundaries.
- Do not swallow a monetary validation error in a write path.
- Display formatting should be resilient to corrupted values; show a safe placeholder and log a sanitized diagnostic rather than crashing a whole screen.
- Never recalculate historical documents using today's product prices or tax settings unless the operation is explicitly a correction with an audit trail.

## Testing requirements

Use example-based tests and property tests where suitable:

- Parse/format round trips for supported values.
- Boundary values at zero, maximum allowed value, and just outside bounds.
- Decimal inputs with comma, point, supported grouping characters, and malformed variants.
- Rounding boundary tests such as half-unit cases.
- Conservation: allocated amounts sum exactly to the intended total.
- Reconciliation: document total equals its defined components.
- Retry: repeated operation ID does not create extra payments or refunds.
- Parity: renderer/domain, main process, and database enforcement converge.

## Acceptance checklist

- [ ] One documented minor-unit scale and rounding policy.
- [ ] No floating-point monetary source of truth.
- [ ] Trusted write boundary recalculates monetary facts.
- [ ] Limits are centralized and overflow-safe.
- [ ] Historical documents retain their original financial snapshots.
- [ ] Refunds and reversals have auditable movement records.
- [ ] Tests cover boundaries, rounding, parity, and retries.

## Reference

- `references/parity-and-rounding.md`
