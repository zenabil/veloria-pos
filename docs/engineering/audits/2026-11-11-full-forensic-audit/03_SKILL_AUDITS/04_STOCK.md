# 04 — veloria-stock Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-stock` — SKILL.md read in full; references/inventory-and-fifo.md read in full.
**Method:** `electron/ipc/handlers/fifo.ts` (291 L) read in full; `inventory.repo.ts` (43 KB), `purchases.repo.ts`, `packagings.repo.ts`, `products.repo.ts`, `suppliers.repo.ts`, `returns.repo.ts` (76 KB) inspected; `amount-allocation.ts` and `cost-allocation.ts` read in full; migrations 0018, 0037, 0054, 0056 read; `src/domain/{inventory,packaging,units,product,suppliers}` inspected; stock tests located and reviewed.

## 1. Verdict

Stock and FIFO costing are implemented at a **high standard** and I found no P0 defect and no confirmed negative-stock path. The FIFO engine is the real thing: a genuine layer table, deterministic oldest-first selection, a runtime guard that **refuses any FIFO write outside the caller's transaction**, tripwire triggers that fail hard on a corrupted layer, and an explicit NULL-layer consumption row when history is insufficient — so legacy sales remain auditable instead of being silently mis-costed.

Two things are genuinely notable. First, the **aggregate-demand-before-availability** check — the exact defect the stock skill calls out as "a classic bug" — **is implemented correctly**: demand is accumulated per product in `wantedBaseById` and compared once, so two lines of the same product cannot each pass against the same starting quantity. Second, **there is no standalone reconciliation diagnostic**, which the stock skill explicitly lists as a required output ("At minimum, support a diagnostic that can identify: aggregate product quantity differs from movement-derived quantity; … FIFO-layer quantity").

## 2. Scope covered

```
electron/ipc/handlers/fifo.ts (291 L, read in full)
electron/ipc/handlers/inventory.repo.ts (43 KB)   purchases.repo.ts   packagings.repo.ts
electron/ipc/handlers/products.repo.ts (27 KB)     suppliers.repo.ts   returns.repo.ts (76 KB)
electron/ipc/handlers/amount-allocation.ts         electron/ipc/handlers/cost-allocation.ts
database/migrations/0018_fifo_cost_layers.sql       0037_products_quantity_nonneg.sql
database/migrations/0054_product_packagings.sql    0056_carton_quotes_supplier_returns.sql
src/domain/{inventory,packaging,units,product,suppliers}/**   src/application/stock/**
src/features/stock/** (14 files)
```

## 3. Skill checklist result

| veloria-stock criterion                                                              | Status        | Evidence                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Every stock-changing event has a traceable movement                                  | **VERIFIED**  | `stock_movements` rows written on sale_out / intake / adjust / return (sales.repo.ts:733-745)                                                 |
| Quantities use a documented base unit and fixed precision                            | **PARTIAL**   | thousandths internally (fifo.ts:16 `const TH = 1000`); DB columns are NUMERIC → DB-01                                                         |
| Packaging conversions have one authoritative factor, validated at the write boundary | **VERIFIED**  | `product_packagings` (0054); factor re-read and re-validated in main (registry.sales.ts:519-543)                                              |
| Aggregate demand per product before checking availability                            | **VERIFIED**  | sales.repo.ts:548-560                                                                                                                         |
| Sale/intake/return/adjustment updates all dependent records atomically               | **VERIFIED**  | one `db.transaction` per operation; verify:domain asserts 70/70 mutations transactional                                                       |
| Negative stock is rejected                                                           | **VERIFIED**  | app guard sales.repo.ts:724-728 **and** DB CHECK/trigger from migration 0037                                                                  |
| Reversal restores the exact original consumption basis                               | **VERIFIED**  | `restoreToLayers` (fifo.ts:200-223) uses the original layerId recorded in `sale_fifo_consumption`; refuses to exceed the original quantity    |
| Missing history uses a documented, marked legacy fallback                            | **VERIFIED**  | fifo.ts:168-179 — shortfall writes a NULL-layer consumption row at `fallbackUnitCostMinor`                                                    |
| FIFO consumes the oldest eligible layer deterministically                            | **VERIFIED**  | fifo.ts:48 `ORDER BY id ASC`                                                                                                                  |
| Layer quantity stays within [0, original]                                            | **VERIFIED**  | setRemaining rejects negative (fifo.ts:113-115); restoreToLayers rejects > original (fifo.ts:215-217)                                         |
| Reversal within the caller's transaction                                             | **VERIFIED**  | `assertCallerTransaction()` at fifo.ts:21, 78, 138, 201, 257                                                                                  |
| Freight allocation sums exactly to the freight amount                                | **VERIFIED**  | `allocateAmountByWeights` (largest remainder) at inventory.repo.ts:320; conservation proven by 200 000-case fuzz                              |
| Purchase-cost allocation reproduces the paid total exactly                           | **VERIFIED**  | `allocateUnitCostLayers` (cost-allocation.ts) self-checks `check !== totalMinor` → throw                                                      |
| Receiving commits once; retry adds stock once                                        | **VERIFIED**  | purchases.repo.ts:4-5 "Idempotence par operationId appelant (retry/double-clic rejoue, jamais de doublon)" + claimIdempotency/peekIdempotency |
| Cancelling a receipt reverses its own movements                                      | **VERIFIED**  | `deductIntakeLayers` (fifo.ts:252-280) removes only layers of that intake, newest first, and refuses if already sold                          |
| Distinguish customer/supplier return, damage, expiry, correction, opening balance    | **VERIFIED**  | `LayerReason` enum (fifo.ts:62-71) and distinct movement types                                                                                |
| Inventory count produces an adjustment movement with before/after                    | **VERIFIED**  | `stock.adjust` / `stock.inventory` write movements with `quantity_delta` and `quantity_after`                                                 |
| Reconcile aggregate layer quantity to product quantity — as a diagnostic             | **NOT_FOUND** | see STK-01                                                                                                                                    |

## 4. Findings

```text
ID: STK-01
TITLE: No standalone stock reconciliation diagnostic exists (aggregate product quantity vs movement-derived quantity vs FIFO layer quantity)
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-stock
AFFECTED_MODULE: electron/ipc/handlers, src/features/stock
FILE: electron/ipc/handlers/fifo.ts
LINE_RANGE: 282-291
PROBLEM:
  The veloria-stock skill's reference file lists reconciliation outputs as a
  MINIMUM requirement:
    "At minimum, support a diagnostic that can identify:
     - Aggregate product quantity differs from movement-derived quantity.
     - Aggregate product quantity differs from FIFO-layer quantity.
     - Negative or over-consumed layer.
     - Consumption without source document.
     - Reversal without original movement.
     - Duplicate source operation.
     - Missing unit factor or invalid packaging reference."
  The project detects these conditions AT WRITE TIME (triggers + tripwires), which
  is the more important control. But there is no read-only diagnostic that reports
  them for an EXISTING database. An auditor or support technician cannot ask the
  system "is my stock ledger coherent?" and get an answer.
EVIDENCE:
  electron/ipc/handlers/fifo.ts:282-291 — the only reconciliation-shaped function is
    export function fifoValuation(): number {
      const db = getDb();
      const row = db.prepare(
        `SELECT COALESCE(SUM(l.remaining_quantity * l.unit_cost_minor), 0) AS v
         FROM inventory_layers l JOIN products p ON p.id = l.product_id
         WHERE p.is_active = 1`).get() as { v: number };
      return Math.round(Number(row.v));
    }
  — a valuation, not a reconciliation.
  Mechanical grep for reconcile/reconciliation/coupe/ecart across electron/ and src/:
    0 functional matches (only unrelated comments).
  `electron/ipc/channels.ts` exposes no diagnostic channel for stock coherence;
  the closest are database.integrity (SQLite-level) and stock.overview.
ROOT_CAUSE:
  The reconciliation is enforced as an invariant at write time (triggers 0023/0037,
  assertCallerTransaction, tripwires) but was never exposed as a read-only
  operational query. The stock skill explicitly distinguishes the two roles.
IMPACT:
  Low for correctness (the invariant is enforced), moderate for operations. When a
  customer reports "the stock screen shows 12 but the shelf has 13", the support
  path cannot distinguish a physical discrepancy from a ledger corruption. Note
  that `verify:perf` seeds 10k products/10k sales and the suite passes, so the
  invariants hold under the tested paths — but a database that was corrupted by an
  external tool (or by a legacy version predating the triggers) could not be
  triaged from inside the product.
RECOMMENDED_FIX:
  Add a read-only diagnostic — a new repository function plus an IPC channel
  (e.g. `stock.reconcile`) that returns, per product with a discrepancy:
    product quantity,
    SUM(stock_movements.quantity_delta) since the opening balance,
    SUM(inventory_layers.remaining_quantity),
  plus global counters for negative/over-consumed layers, consumptions without a
  source document, and reversals without an original movement. Gate it behind the
  `settings` page licence and the staff `settings` permission (it exposes internal
  cost data). Surface it in the Stock screen as a read-only diagnostic panel.
REGRESSION_TEST:
  A database test that corrupts a layer remainder out of band (in a temp DB) and
  asserts the diagnostic reports the divergence for exactly that product.
DEPENDENCIES:
  DB-01, XSKILL-05 (closing/stock cross-check).
```

```text
ID: STK-02
TITLE: Quantity precision is enforced only in application code; the database permits REAL storage
SEVERITY: P1
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-stock (cross-ref veloria-db)
AFFECTED_MODULE: database, electron/ipc/handlers
FILE: database/migrations/0018_fifo_cost_layers.sql
LINE_RANGE: 18-19, 32
PROBLEM:
  All 26 quantity columns across the schema are NUMERIC, which in SQLite has
  float affinity. The stock skill requires: "Quantities use a documented base unit
  and fixed precision; do not accumulate binary floating-point quantities" and
  "Keep each remaining layer quantity between zero and its original quantity."
  The application honours this (fifo.ts works internally in thousandths, TH=1000,
  and every write goes through round3), but the FIFO layer table — the very table
  whose conservation the whole costing model depends on — has no column-level
  guard against a non-representable value.
EVIDENCE:
  database/migrations/0018_fifo_cost_layers.sql:18-19
    original_quantity NUMERIC NOT NULL,
    remaining_quantity NUMERIC NOT NULL,
  database/migrations/0018_fifo_cost_layers.sql:32
    quantity NUMERIC NOT NULL,          -- sale_fifo_consumption
  database/migrations/0037_products_quantity_nonneg.sql — adds the >= 0 guard
  electron/ipc/handlers/fifo.ts:16  const TH = 1000;
  electron/ipc/handlers/fifo.ts:113-115 — negative remainder rejected in code
  electron/ipc/handlers/fifo.ts:215-217 — restore beyond original rejected in code
  Contrast: money IS protected at the column level (99 columns, all INTEGER,
  machine-verified by verify:migrations "pureté de l'argent").
ROOT_CAUSE:
  SQLite has no DECIMAL type; NUMERIC was chosen as the nearest affinity, and the
  precision contract was left to the application.
IMPACT:
  Same analysis as DB-01, with FIFO-specific consequences: the identity
  SUM(inventory_layers.remaining_quantity) = products.quantity is a REAL-valued
  comparison, so a single float write can break it by ~1e-12 and make a physical
  count look wrong. The FIFO consumption arithmetic (fifo.ts:148,153,157) uses
  Math.round(qty * 1000), which absorbs small errors but does not eliminate them
  from the STORED value.
RECOMMENDED_FIX:
  Same as DB-01 — forward-only CHECK constraints asserting sub-unit exactness and
  non-negativity on the quantity columns, without a table rebuild. Additionally
  consider a CHECK on inventory_layers asserting
    remaining_quantity <= original_quantity
  so the layer invariant is enforced by the database and not only by
  restoreToLayers.
REGRESSION_TEST:
  A database test that (a) attempts to write a quantity of 0.0001 and expects
  rejection, and (b) attempts to set remaining_quantity > original_quantity and
  expects rejection.
DEPENDENCIES:
  DB-01, STK-01.
```

```text
ID: STK-03
TITLE: The FIFO fallback cost for a legacy sale (no layer available) is taken from a caller-supplied value with no provenance record
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-stock
AFFECTED_MODULE: electron/ipc/handlers
FILE: electron/ipc/handlers/fifo.ts
LINE_RANGE: 168-179
PROBLEM:
  The stock skill requires: "If historic data lacks sufficient traceability, use a
  documented legacy fallback, mark the provenance, and test it. Do not hide missing
  history."
  The fallback IS used and IS marked (a NULL layer_id is written, which is
  traceable), and the caller supplies `fallbackUnitCostMinor`. However, the
  fallback's PROVENANCE is not recorded: the consumption row records the layer id
  and the unit cost, but not which rule produced that unit cost. A reader of
  `sale_fifo_consumption` cannot distinguish "costed from a real layer" from
  "costed from the last known layer" from "costed from the product's purchase
  price".
EVIDENCE:
  electron/ipc/handlers/fifo.ts:168-179
    if (needTh > 0) {
      if (!args.oversell) throw new Error("Stock FIFO insuffisant.");
      const qty = needTh / TH;
      const cost = Math.round((args.fallbackUnitCostMinor * needTh) / TH);
      consumptions.push({ layerId: null, quantity: qty,
                         unitCostMinor: args.fallbackUnitCostMinor, costMinor: cost });
      cogs += cost;
    }
  electron/ipc/handlers/fifo.ts:180-195 — the INSERT writes layer_id, unit_cost_minor;
  there is NO reason/fallback column.
  electron/ipc/handlers/fifo.ts:60-71 — the LayerReason enum ("legacy", "oversell")
  exists for CREATING layers, but is not recorded on consumption rows.
  Call site: electron/ipc/handlers/sales.repo.ts:688-698 — the fallback is
  `Math.max(0, Math.round(line.purchasePriceMinor / factor))`, i.e. the product's
  stored purchase price.
ROOT_CAUSE:
  The consumption table predates the fallback concept; adding a provenance column
  would require a table rebuild, which the project avoids for a live retail DB.
IMPACT:
  Low-moderate. The NULL layer_id DOES signal "no layer", so the situation is
  detectable by a query. But the specific rule used is not recoverable, so
  historical margin analysis cannot distinguish a correctly-costed sale from an
  approximated one. For a product whose purchase price changed since the sale,
  the approximated COGS may be materially wrong.
RECOMMENDED_FIX:
  Forward-only migration adding a nullable `cost_basis` column to
  `sale_fifo_consumption` with values 'layer' | 'fallback-purchase-price' |
  'fallback-last-layer', plus a CHECK. Write the value on every consumption.
  Existing rows default to 'layer' except those with layer_id IS NULL, which get
  'fallback-purchase-price'. Cheap, forward-only, no rebuild needed for an added
  nullable column with a default.
REGRESSION_TEST:
  A test asserting a sale with no available layer produces a consumption row with
  layer_id NULL AND cost_basis = 'fallback-purchase-price'.
DEPENDENCIES:
  STK-01, CLOS-05 (profit reporting).
```

```text
ID: STK-04
TITLE: Intake cancellation zeroes the remaining layers of that intake, which silently discards any partial consumption already reflected in the layers
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-stock
AFFECTED_MODULE: electron/ipc/handlers/inventory.repo.ts
FILE: electron/ipc/handlers/inventory.repo.ts
LINE_RANGE: 766-813
PROBLEM:
  This finding is the RESIDUE of an initial hypothesis that was tested and REFUTED.
  The hypothesis was that the intake-cancel path reduces the product aggregate
  without touching the FIFO layers, which would break the conservation
  invariant. Reading the path proved the opposite: the cancel path IS
  layer-aware. It neutralises the intake's layers and recalibrates the last
  purchase cost.
  The residual observation is narrower and much milder: the cancel path sets
  remaining_quantity = 0 for ALL layers of the intake, in one statement, without
  distinguishing "never consumed" from "partially consumed". The product
  aggregate is reduced by the FULL net quantity of the intake, and the
  conservation invariant is restored by zeroing the layers wholesale.
EVIDENCE:
  electron/ipc/handlers/inventory.repo.ts:795-799
    // Couches vérifiées intactes : les neutraliser (jamais les supprimer, la
    // trace de réception reste lisible) puis recaler le dernier coût d'achat.
    db.prepare(`UPDATE inventory_layers SET remaining_quantity = 0 WHERE stock_intake_id = ?`).run(
      args.id,
    );
  electron/ipc/handlers/inventory.repo.ts:766-778 — the product aggregate is
  reduced by the net quantity, with an explicit negative-stock refusal:
    if (after < -1e-9) {
      throw new Error(`Stock incohérent pour « ${agg.name} » : annulation refusée, utilisez un ajustement.`);
    }
  electron/ipc/handlers/inventory.repo.ts:800-813 — the last remaining purchase cost
  is recomputed from the surviving layers.
  electron/ipc/handlers/inventory.repo.ts:754-755 — intakeCancelContext() refuses
  the cancellation up-front when the intake is not 'committed', when supplier
  returns reference it, or when layers have already been consumed.
ROOT_CAUSE:
  The bulk UPDATE is a deliberate simplification: the cancel is only permitted when
  the intake's stock has not been consumed (guarded by intakeCancelContext), so
  wholesale zeroing is equivalent to a per-layer deduction in the permitted case.
IMPACT:
  Very low. In the permitted case the bulk zero is exactly equivalent to a
  per-layer deduction, and the guard prevents the unsafe case. The only residual
  risk is that the safety depends on intakeCancelContext()'s checks remaining
  complete — which is precisely why the missing reconciliation diagnostic
  (STK-01) matters as a safety net.
RECOMMENDED_FIX:
  No functional change required. As a hardening measure, replace the bulk UPDATE
  with a per-layer loop that mirrors deductIntakeLayers(), so the invariant is
  maintained by construction rather than by a precondition; and add the STK-01
  diagnostic so the invariant is observable.
REGRESSION_TEST:
  An integration test: intake 10 units, cancel, assert
  SUM(inventory_layers.remaining_quantity) for that product equals
  products.quantity and that the intake's layer rows still exist with
  remaining_quantity = 0 (trace preserved, not deleted).
DEPENDENCIES:
  STK-01, STK-05.
```

```text
ID: STK-05
TITLE: No test asserts the FIFO layer conservation invariant end-to-end (SUM of layers equals product quantity)
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-stock (cross-ref veloria-gates)
AFFECTED_MODULE: tests
FILE: tests/ (integration + database)
LINE_RANGE: n/a
PROBLEM:
  The FIFO engine's central invariant — the sum of layer remainders equals the
  product's aggregate quantity — is the thing the whole costing model rests on.
  The audit located strong unit-level tests (layer creation, consumption order,
  restoration bounds, transaction enforcement) but did NOT locate an integration
  test that performs a mixed sequence (intake -> sale across layers -> partial
  return -> adjustment -> cancellation) and asserts the conservation invariant and
  the resulting COGS.
EVIDENCE:
  electron/ipc/handlers/fifo.ts:110-112 documents the invariant and states that it
  "est vérifié par les repos + CHECK 0018 + trigger 0037, pas ici" — i.e. the
  verification is delegated to constraints and repository logic rather than to a
  single explicit invariant test.
  The stock skill's required tests include "Reconciliation of product quantity to
  movement/layer totals" — that exact test was not located.
ROOT_CAUSE:
  The invariant is enforced structurally by triggers (a good design), which made a
  dedicated end-to-end assertion feel redundant. Structural enforcement and an
  explicit test are complementary, not substitutes.
IMPACT:
  Low-moderate. Structural enforcement is real, but a defect that made the two
  representations diverge in a way the triggers do not cover (e.g. an import
  path, or the adjustment path of STK-04) would not be caught by any test.
RECOMMENDED_FIX:
  Add an integration test that seeds a product with two cost layers, performs a
  sale spanning both layers, a partial customer return, an inventory adjustment
  and a sale cancellation, then asserts:
    SUM(inventory_layers.remaining_quantity) == products.quantity
    SUM(sale_fifo_consumption.cost_minor) == the expected COGS
    every consumption row references an existing layer or is explicitly marked as a fallback
REGRESSION_TEST:
  The test above IS the regression test.
DEPENDENCIES:
  STK-01, STK-02, STK-04.
```

## 5. What is genuinely solid

- **The transaction guard is real.** `assertCallerTransaction()` (fifo.ts:21-26) throws "Opération FIFO impossible : transaction appelante requise." — a forgotten transaction on a COGS path is a hard failure with a French message, exactly as the skill demands.
- **The aggregate-demand check is correct.** `sales.repo.ts:548-560` accumulates `wantedBaseById` per product and compares once. Two lines of the same product therefore cannot each pass against the same starting quantity — the specific bug the skill flags as classic is genuinely closed.
- **Negative stock is blocked twice.** Application guard (sales.repo.ts:724-728) _and_ database CHECK/trigger (migration 0037). The application guard is explicitly positioned as "fail-closed BEFORE the UPDATE (le trigger reste le dernier rempart, y compris contre le SQL direct)".
- **Tripwire semantics, not silent clamping.** fifo.ts:106-108: "une couche cassée échoue FORT — jamais de correction silencieuse (clamp à 0). La transaction appelante rollback."
- **Reversal restores the exact original layer.** `restoreToLayers` uses the recorded `layerId` from `sale_fifo_consumption`, and refuses a restoration that would exceed the layer's original quantity (fifo.ts:215-217) — the skill's "Never fabricate an original layer reference" is honoured.
- **Freight and purchase-cost allocation are exact.** `allocateAmountByWeights` (largest remainder, conservation proven by 200 000-case fuzz) and `allocateUnitCostLayers`, which self-verifies `check !== totalMinor` and throws.
- **Receiving is idempotent by caller-supplied operationId.** purchases.repo.ts:4-5 states it explicitly and implements claim/peek/store.
- **Supplier returns only deduct from their own intake.** `deductIntakeLayers` filters on `stock_intake_id`, goes newest-first, and refuses if the quantity was already sold — "returning goods that left the stock is refused instead of corrupting another layer."
- **Packaging drift is detected at checkout.** registry.sales.ts:519-543 re-reads the packaging and rejects a stale factor, tariff or expected price with an actionable French message.

## 6. Not verified / limits of this audit

- **STK-04 was initially hypothesised as a defect and then REFUTED by reading the code.** It is reported as the verified residue (P3) rather than as the original hypothesis (which would have been P2). The record is kept deliberately: the audit's own reasoning is part of the evidence.
- No physical inventory count was performed (requires a seeded database and a physical stock).
- The `mobile` and `owner` apps' stock/costing logic were not audited.
- The 26 NUMERIC quantity columns were classified mechanically by name; a hand-written quantity column with an unconventional name could have been missed.
- Concurrency behaviour (two simultaneous sales on the last unit) was not exercised with real parallel writers; the design uses a single main-process connection with `busy_timeout=10000`, which serialises writers at the SQLite level, but this was reasoned rather than measured.

## 7. Metrics

| Metric                            | Value                                    |
| --------------------------------- | ---------------------------------------- |
| Stock/FIFO source files inspected | 15                                       |
| Skill checklist items evaluated   | 18 (16 VERIFIED, 1 PARTIAL, 1 NOT_FOUND) |
| Aggregate-demand check            | **CORRECT** (verified in source)         |
| Negative-stock paths found        | **0**                                    |
| Hypotheses tested and refuted     | 1 (STK-04)                               |
| Findings                          | 5 (P0×0, P1×1, P2×3, P3×1)               |
