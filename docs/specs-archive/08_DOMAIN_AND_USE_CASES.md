# 08 — Domain & Application Use Cases

## Domain model principles

The domain layer must contain deterministic business rules only.

Important value objects:

- Money
- Quantity
- Barcode
- InvoiceNumber
- DateRange
- Percentage
- ProductId
- CustomerId
- SupplierId

## Product use cases

- CreateProduct
- UpdateProduct
- ArchiveProduct
- RestoreProduct
- SearchProducts
- GetProduct
- GetProductHistory
- ImportProducts
- BulkUpdateProducts
- BulkArchiveProducts
- GetInventorySummary

Rules:

- name required
- selling price >= 0
- purchase price >= 0
- quantity >= 0 by default
- min stock >= 0
- barcode unique globally

## Sales use cases

- StartSale
- AddItemToCart
- ChangeItemQuantity
- RemoveItemFromCart
- ApplyDiscount
- SetCustomer
- SetDeliveryFee
- CreateSale
- CancelSale
- GetSale
- SearchSales
- ReprintReceipt
- CreateProformaFromCart
- ConvertProformaToSale

### CreateSale invariants

1. Cart is not empty.
2. Every item has a valid quantity.
3. Every price is non-negative.
4. Discount is valid for the configured type.
5. Paid amount is between 0 and total.
6. Invoice number is unique.
7. Sale, items, payment, inventory movements, and customer balance update form one transaction.
8. A failed step rolls back the entire write.

## Customer use cases

- CreateCustomer
- UpdateCustomer
- ArchiveCustomer
- GetCustomer
- SearchCustomers
- GetCustomerStatement
- GetCustomerActivity
- GetCustomerBalance
- RecordCustomerPayment
- ImportCustomers
- RecalculateCustomerBalance

Credit policy should be explicit in configuration and application rules, even without a roles system.

## Supplier use cases

- CreateSupplier
- UpdateSupplier
- ArchiveSupplier
- GetSupplier
- SearchSuppliers
- ReceiveStock
- RecordSupplierPayment
- RecalculateSupplierBalance
- GetSupplierActivity

## Inventory use cases

- ReceiveStock
- AdjustStock
- ReturnToStock
- RemoveStockForSale
- RestoreStockAfterSaleCancellation
- GetStockLedger
- GetInventoryValuation
- GetLowStockProducts
- GetExpiringProducts

## Returns

A return must:

- reference an original sale
- validate returnable quantities
- create return record and items
- optionally restock inventory
- refund or credit customer
- preserve audit history
- execute atomically

## Expenses

- CreateExpense
- EditExpense
- CancelExpense or archive according to accounting rules
- ListExpenses
- GetExpenseTotals

## Proformas

Statuses:

```text
draft -> sent -> converted

```

Cancellation/expiration may be added if business requirements require it.

## Bread

- CreateBreadOrder
- UpdateBreadOrderQuantity
- RecordBreadPayment
- MarkPickupStatus
- ConvertBreadOrderToSale
- TransferBreadBalanceToCustomer
- Delete/ArchiveBreadOrder according to retention rules
- GetDailyBreadOrders

## Reports

- GetDailySales
- GetPeriodPerformance
- GetTopProducts
- GetCustomerDebtReport
- GetSupplierBalanceReport
- GetInventoryValuation
- GetExpenseReport
- GetDailyClosingReport
- CalculateZakat

## Zakat

Zakat is a reporting/calculation feature, not a source ledger. All source values come from SQLite data. Rate, nisab inputs, and calculation assumptions must be explicit and configurable rather than hidden in UI code.

## Application transaction policy

Every use case that mutates more than one aggregate/ledger table must use an explicit transaction.
