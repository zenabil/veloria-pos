# veloria-stock â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

Stock and FIFO costing are implemented at a high standard: a real layer model, oldest-first deterministic selection, runtime enforcement that FIFO writes must run inside the caller's transaction, tripwire CHECK constraints, proactive anti-overflow on layer restore, and â€” importantly â€” the aggregate-demand-before-availability check that the skill explicitly calls out as a classic bug. Negative stock is genuinely prevented at both the application and database layers.

## 2. Scope covered

SKILL.md + references/inventory-and-fifo.md; electron/ipc/handlers/fifo.ts (291 L); inventory.repo.ts (43 KB); purchases.repo.ts; packagings.repo.ts; products.repo.ts; returns.repo.ts (76 KB); migrations 0018, 0037, 0054, 0056; src/domain/inventory|packaging|units|product.

## 3. Skill checklist result

| Criterion                                                             | Status       | Evidence                                                                                                                            |
| --------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Every stock-changing event has a traceable movement                   | **VERIFIED** | stock_movements rows written on sale_out / intake / adjust / return (sales.repo.ts:733-745)                                         |
| Quantities use a documented base unit and fixed precision             | **VERIFIED** | thousandths internally (fifo.ts:16 `const TH = 1000`); DB columns NUMERIC                                                           |
| Packaging conversions have one authoritative factor                   | **VERIFIED** | product_packagings table (0054); factor re-read and re-validated in main (registry.sales.ts:519-543)                                |
| Aggregate demand per product before checking availability             | **VERIFIED** | sales.repo.ts:548-560 â€” wantedBaseById accumulates per product, then a single loop compares against available                     |
| Updates all dependent stock/cost records atomically                   | **VERIFIED** | whole sale is one db.transaction; verify:domain asserts every IPC mutation is transactional                                         |
| Negative stock is rejected                                            | **VERIFIED** | app guard sales.repo.ts:724-728 AND DB CHECK from migration 0037                                                                    |
| Reversal restores the exact original consumption basis                | **VERIFIED** | restoreToLayers uses the original layerId from sale_fifo_consumption (fifo.ts:200-223) with an anti-overflow guard                  |
| If historic data lacks traceability, use a documented legacy fallback | **VERIFIED** | fifo.ts:168-179 â€” shortfall with oversell writes a NULL-layer consumption row at fallbackUnitCostMinor                            |
| FIFO consumes the oldest eligible layer deterministically             | **VERIFIED** | fifo.ts:48 `ORDER BY id ASC`                                                                                                        |
| Layer quantity stays within original bounds                           | **VERIFIED** | setRemaining rejects negative (fifo.ts:113-115); restoreToLayers rejects > original (fifo.ts:215-217)                               |
| Reconcile aggregate layer quantity to product quantity                | **PARTIAL**  | Checked by repos + CHECK 0018 + trigger 0037, but no standalone diagnostic command was found that prints a three-way reconciliation |
| Freight allocation sums exactly to the freight amount                 | **VERIFIED** | allocateAmountByWeights (largest remainder) used for freight capitalisation; conservation proven by fuzz                            |

## 4. Findings raised by this skill

No skill-level contradiction was found. The skill's rules are implementable and, where checkable, already implemented in the codebase. Domain-level defects discovered while auditing this skill's subject matter are reported in the corresponding `03_SKILL_AUDITS/` file and are cross-referenced there.

## 5. What is genuinely solid

- assertCallerTransaction() (fifo.ts:20-26) makes a forgotten transaction a hard runtime failure with a FR message â€” this is the exact failure the skill warns about, and it is closed.
- The oversell fallback writes an explicit NULL-layer consumption row, so legacy sales remain auditable rather than silently mis-costed.
- Packaging factor/tariff drift is detected at checkout ('Taille du carton modifiÃ©eâ€¦ rafraÃ®chissez le panier') instead of corrupting the sale.
- FIFO consumption records the layer id per sale item, which is what makes exact reversal possible.

## 6. Not verified / limits of this audit

- No physical inventory reconciliation drill was performed (requires a real stock count and a printer/scanner).
- The `products.quantity` column is NUMERIC in SQLite; the thousandths discipline is enforced in application code and by triggers rather than by a numeric column type. This was not stressed with a fractional-quantity fuzz against a live DB in this audit.

## 7. Metrics

- Checklist items evaluated: **12** â€” VERIFIED: 11, PARTIAL: 1
- Skill-level findings owned by this skill: **0**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
