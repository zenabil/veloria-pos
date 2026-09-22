# 21 — Screen Specification

## `/dashboard`

Purpose: fast operational overview.

Must show only useful aggregates, not raw historical datasets.

Widgets:

- today's sales
- payments collected
- outstanding customer debt
- inventory value
- low-stock count
- expense total
- top products
- recent activity

## `/sell`

Primary operator workspace.

Requirements:

- barcode input autofocus capability
- product search
- cart
- customer selector
- discount
- delivery fee
- totals
- payment dialog
- credit state
- print/reprint controls
- keyboard shortcuts

## `/products`

Requirements:

- search
- category filter
- stock status
- add/edit/archive
- barcode management
- import
- label print
- product history

## `/customers`

Requirements:

- search
- debt summary
- quick payment
- add/edit/archive
- import
- detail navigation

## `/customers/detail`

Requirements:

- identity
- credit limit
- outstanding balance
- statement
- payments
- sales
- activity
- print statement

## `/stock`

Requirements:

- stock KPIs
- low stock
- stock ledger
- adjustments
- suppliers

## `/stock/intake`

Requirements:

- supplier
- supplier invoice
- date
- items
- damaged quantity
- purchase cost
- shipping cost
- total
- commit/cancel

## `/stock/suppliers/detail`

Requirements:

- supplier profile
- balance
- intake history
- payments
- activity

## `/sales-history`

Requirements:

- invoice search
- customer filter
- date range
- payment status
- details dialog
- cancellation workflow
- receipt reprint

## `/returns`

Requirements:

- history
- search
- status
- details
- create return

## `/returns/new`

Requirements:

- original sale lookup
- eligible quantities
- return value
- refund/credit selection
- restock choice
- confirmation

## `/expenses`

Requirements:

- list
- filters
- add/edit
- category
- date
- amount

## `/debt-alerts`

Requirements:

- due soon
- overdue
- over limit
- customer drill-down

## `/reports`

Requirements:

- date ranges
- sales
- payments
- debts
- expenses
- inventory
- supplier balances
- export

## `/bread`

Requirements:

- date/pickup board
- create/update order
- payment state
- pickup state
- customer transfer/conversion
- print list

## `/zakat`

Requirements:

- source values
- inputs
- assumptions
- threshold
- result breakdown

## `/profile`

Requirements:

- company identity
- invoice data
- contact
- logo path

## `/settings`

Sections:

- General
- Database location
- Backup
- Printing
- Hardware
- Diagnostics
- About

## Desktop shell rules

There must be one canonical header/navigation system and one global notification system.
