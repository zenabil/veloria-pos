# 20 — Feature Matrix

| Module | Core capabilities | Primary data | Criticality |
|---|---|---|---|
| Dashboard | KPIs, trends, alerts | sales, stock, customers, expenses | High |
| Sales | cart, barcode, payment, credit, print | sales, sale_items, sale_payments | Critical |
| Products | CRUD, search, barcode, import | products, product_barcodes | Critical |
| Customers | CRUD, statements, debt, payments | customers, sale_payments | Critical |
| Inventory | intake, adjustments, ledger | stock_movements, stock_intakes | Critical |
| Suppliers | balances, payments, intake | suppliers, supplier_payments, stock_intakes | High |
| Returns | refund/credit/restock | returns, return_items | Critical |
| Proformas | draft/convert | proformas, proforma_items | Medium |
| Expenses | create/list/report | expenses | High |
| Bread | orders, pickup, payment | bread_orders | Medium |
| Reports | period/financial/inventory | all aggregates | High |
| Zakat | calculation/report | inventory + balances + configuration | Medium |
| Company profile | store identity | company_profile | Medium |
| Settings | app/db/printer settings | app_settings | High |
| Backup | create/list/restore | database/files | Critical |
| Printing | thermal/A4 | sales/company | High |
| Hardware | scanner/drawer/scale adapters | none directly | Medium |
| Diagnostics | logs/integrity/runtime checks | app_meta/audit/logs | High |

## Feature completion rule

A module is complete only when:

```text
UI
+ Application use cases
+ Domain rules
+ Database persistence
+ Error handling
+ Tests
+ Performance review
+ Backup/restart verification
```

all exist.
