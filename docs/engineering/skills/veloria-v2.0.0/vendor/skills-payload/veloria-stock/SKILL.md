---
name: veloria-stock
description: "Safely implement Veloria inventory, receiving, packaging, stock movements, returns, adjustments, costing, FIFO layers when approved, and reconciliation between physical and recorded stock."
---

# Veloria Stock — inventory, costing, and traceable movements

## Mission

Keep physical quantity, recorded quantity, costing, supplier receipts, sales consumption, returns, and adjustments coherent and auditable.

## Inspect before changing

Verify the repository's actual quantity scale, product units, packaging model, costing method, stock-ledger tables, return semantics, and transaction boundaries. The original source materials describe a FIFO layer model; treat FIFO as the intended method only if the current approved contract and implementation confirm it. Do not replace or silently reinterpret an existing costing method.

## Core invariants

- Every stock-changing event is represented by a traceable movement or immutable source record.
- Quantities use a documented base unit and fixed precision; do not accumulate binary floating-point quantities.
- Packaging conversions have one authoritative factor and are validated at the trusted write boundary.
- Aggregate demand by product before checking availability. Multiple lines for the same product must not each pass against the same starting quantity.
- A sale, intake, return, or adjustment must update all dependent stock/cost records atomically.
- Negative stock is rejected unless a deliberately approved business policy defines otherwise, including how valuation and reporting behave.
- Reversal restores the exact original consumption/cost basis when that information is available. Never fabricate an original layer reference.
- If historic data lacks sufficient traceability, use a documented legacy fallback, mark the provenance, and test it. Do not hide missing history.

## FIFO-specific rules (only when FIFO is confirmed)

1. Consume the oldest eligible layer according to a documented deterministic order.
2. Track exact quantity and cost consumed per source layer.
3. Keep each remaining layer quantity between zero and its original quantity.
4. Use the caller's transaction; do not partially consume layers outside an atomic business operation.
5. On cancellation, restore to original layers or apply a documented legacy fallback with an audit record.
6. Calculate COGS from the approved valuation method, not from current purchase price or selling price.
7. Reconcile aggregate layer quantity to product quantity and report any unexplained difference.

## Receiving and landed cost

- Validate supplier, document state, product, unit conversion, quantity, purchase cost, and allocated freight/fees.
- Choose and document the freight allocation basis (quantity, value, weight, or another business rule) and rounding behavior.
- Ensure allocated costs sum exactly to the source freight amount; distribute residual minor units deterministically.
- Commit a receipt once. Retrying the same operation must not add stock twice.
- Cancelling a receipt must reverse its own movements, not overwrite later stock history.

## Returns, damage, and inventory counts

- Distinguish customer returns, supplier returns, damage, expiry, manual corrections, and opening balances.
- Validate returnable quantity against the original sale/receipt and prior returns.
- Preserve the original cost basis where known; otherwise apply an explicit fallback.
- Inventory counts produce an adjustment movement with count time, actor, reason, and before/after values.
- Never mutate history to make a count appear to match.

## Required tests

- Two or more order lines for one product.
- Mixed pieces/cartons and fractional base units.
- Insufficient stock and rollback.
- Concurrent sales/receipts where supported.
- Partial return, repeated return, cancelled sale, and legacy sale.
- FIFO layer exhaustion, exact restoration, and missing-layer fallback (if FIFO).
- Freight distribution conservation and rounding.
- Reconciliation of product quantity to movement/layer totals.

## Reference

- `references/inventory-and-fifo.md`
