# Inventory model and FIFO execution checklist

## Required facts to capture

- Base unit and quantity scale per product.
- Sellable packagings and conversion factors.
- Whether packaging can be split during sale/return.
- Approved valuation method and deterministic tie-break order.
- How opening balances and legacy stock enter the ledger.
- Cost treatment for freight, tax, discounts, and supplier credits.
- Whether stock may be negative and under which explicit authorization.

## FIFO operation pseudocode (conceptual)

1. Begin transaction.
2. Lock/serialize the relevant product stock mutation using the database's supported concurrency strategy.
3. Re-read current product and packaging facts.
4. Convert all order quantities to base units using trusted factors.
5. Aggregate demand per product and validate availability.
6. Select eligible cost layers in deterministic oldest-first order.
7. Record one consumption row per source layer.
8. Update layer remainder and product aggregate in the same transaction.
9. Write the stock movement and source-document link.
10. Commit; on any failure, roll back every part.

This is a conceptual checklist, not a substitute for the project's actual locking and repository design.

## Reconciliation outputs

At minimum, support a diagnostic that can identify:

- Aggregate product quantity differs from movement-derived quantity.
- Aggregate product quantity differs from FIFO-layer quantity.
- Negative or over-consumed layer.
- Consumption without source document.
- Reversal without original movement.
- Duplicate source operation.
- Missing unit factor or invalid packaging reference.
