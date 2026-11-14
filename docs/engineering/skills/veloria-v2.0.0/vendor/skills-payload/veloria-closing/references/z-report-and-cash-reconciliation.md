# Z report and cash reconciliation design

## Formula template

`Closing cash = Opening float + Cash inflows − Cash outflows`

The categories must be defined from movement ledgers. A useful breakdown is:

- Cash sales paid during the business day.
- Cash collections against older receivables.
- Other approved cash inflows.
- Paid cash expenses.
- Cash refunds actually disbursed.
- Cash withdrawals/transfers if they physically leave the drawer.

Do not include bank/card/credit movements as drawer cash. Do not count the same movement once as a sale payment and again as a collection.

## Reconciliation method

1. Freeze the business-date boundary and timezone rule.
2. Query each source ledger by its effective movement timestamp/date.
3. Classify cash vs non-cash.
4. Reconcile against invoice/return source documents.
5. Detect missing/duplicate movement references.
6. Compare expected drawer cash with physical count.
7. Store a close snapshot and actor metadata.
8. Keep a traceable path to every included amount.

## Required scenarios

- Sale paid fully in cash.
- Sale paid partly cash and partly credit.
- Old receivable collected today.
- Expense created today but paid tomorrow.
- Return created today but refunded tomorrow.
- Non-cash payment.
- Repeated sync/retry of one movement.
- Day-boundary event near midnight in the business timezone.
- Reopened and reclosed business date.
