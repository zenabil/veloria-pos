# 07 — Target SQLite Schema

This schema is a normalized starting point for the from-scratch build. Exact column names may be refined during implementation, but the relationships and invariants are authoritative.

## Schema groups

### System

#### `schema_migrations`

- `version INTEGER PRIMARY KEY`
- `applied_at TEXT NOT NULL`
- `checksum TEXT NOT NULL`

#### `app_meta`

- `key TEXT PRIMARY KEY`
- `value TEXT NOT NULL`

#### `app_settings`

- `key TEXT PRIMARY KEY`
- `value_json TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `number_sequences`

- `sequence_key TEXT PRIMARY KEY`
- `prefix TEXT NOT NULL`
- `next_value INTEGER NOT NULL`
- `updated_at TEXT NOT NULL`

### Company

#### `company_profile`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `company_name TEXT NOT NULL`
- `address TEXT`
- `city TEXT`
- `postal_code TEXT`
- `country TEXT DEFAULT 'Algérie'`
- `phone TEXT`
- `email TEXT`
- `website TEXT`
- `rc_number TEXT`
- `nif TEXT`
- `nis_number TEXT`
- `ai_number TEXT`
- `legal_form TEXT`
- `invoice_prefix TEXT`
- `logo_path TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### Catalog

#### `categories`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `name TEXT NOT NULL UNIQUE`
- `is_active INTEGER NOT NULL DEFAULT 1`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `products`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `name TEXT NOT NULL`
- `category_id INTEGER REFERENCES categories(id)`
- `unit_code TEXT NOT NULL`
- `purchase_price_minor INTEGER NOT NULL DEFAULT 0`
- `selling_price_minor INTEGER NOT NULL DEFAULT 0`
- `quantity NUMERIC NOT NULL DEFAULT 0`
- `min_stock_level NUMERIC NOT NULL DEFAULT 0`
- `expiration_date TEXT`
- `supplier_id INTEGER REFERENCES suppliers(id)`
- `stock_status TEXT NOT NULL`
- `is_active INTEGER NOT NULL DEFAULT 1`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `deleted_at TEXT`

#### `product_barcodes`

- `id INTEGER PRIMARY KEY`
- `product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE`
- `barcode TEXT NOT NULL UNIQUE`
- `is_primary INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL`

### Customers

#### `customers`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `first_name TEXT NOT NULL`
- `last_name TEXT NOT NULL`
- `search_name TEXT NOT NULL`
- `phone TEXT`
- `address TEXT`
- `settlement_day INTEGER`
- `credit_limit_minor INTEGER NOT NULL DEFAULT 0`
- `initial_balance_minor INTEGER NOT NULL DEFAULT 0`
- `outstanding_balance_minor INTEGER NOT NULL DEFAULT 0`
- `debt_status TEXT NOT NULL DEFAULT 'none'`
- `is_over_limit INTEGER NOT NULL DEFAULT 0`
- `is_bread_client INTEGER NOT NULL DEFAULT 0`
- `bread_profile_json TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `deleted_at TEXT`

Outstanding balance is a materialized value that must be maintained atomically and can be recomputed from the ledger for diagnostic verification.

### Suppliers

#### `suppliers`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `name TEXT NOT NULL`
- `contact_person TEXT`
- `phone TEXT`
- `email TEXT`
- `address TEXT`
- `initial_balance_minor INTEGER NOT NULL DEFAULT 0`
- `outstanding_balance_minor INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `deleted_at TEXT`

### Sales

#### `sales`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `invoice_number TEXT UNIQUE NOT NULL`
- `customer_id INTEGER REFERENCES customers(id)`
- `subtotal_minor INTEGER NOT NULL`
- `discount_type TEXT`
- `discount_value_minor INTEGER NOT NULL DEFAULT 0`
- `discount_amount_minor INTEGER NOT NULL DEFAULT 0`
- `delivery_fee_minor INTEGER NOT NULL DEFAULT 0`
- `total_minor INTEGER NOT NULL`
- `amount_paid_minor INTEGER NOT NULL DEFAULT 0`
- `remaining_balance_minor INTEGER NOT NULL DEFAULT 0`
- `payment_status TEXT NOT NULL`
- `payment_method TEXT`
- `due_date TEXT`
- `is_cancelled INTEGER NOT NULL DEFAULT 0`
- `cancelled_at TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `sale_items`

- `id INTEGER PRIMARY KEY`
- `sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT`
- `product_id INTEGER REFERENCES products(id)`
- `product_name_snapshot TEXT NOT NULL`
- `unit_code TEXT NOT NULL`
- `unit_price_minor INTEGER NOT NULL`
- `purchase_price_minor INTEGER NOT NULL`
- `quantity NUMERIC NOT NULL`
- `line_total_minor INTEGER NOT NULL`

The snapshot fields preserve historical invoice truth even when product data changes later.

#### `sale_payments`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT`
- `customer_id INTEGER REFERENCES customers(id)`
- `amount_minor INTEGER NOT NULL CHECK(amount_minor > 0)`
- `method TEXT NOT NULL`
- `reference TEXT`
- `payment_date TEXT NOT NULL`
- `notes TEXT`
- `created_at TEXT NOT NULL`

### Inventory

#### `stock_movements`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `product_id INTEGER NOT NULL REFERENCES products(id)`
- `movement_type TEXT NOT NULL`
- `quantity_delta NUMERIC NOT NULL`
- `quantity_after NUMERIC NOT NULL`
- `unit_cost_minor INTEGER`
- `related_entity_type TEXT`
- `related_entity_id TEXT`
- `reason TEXT`
- `notes TEXT`
- `created_at TEXT NOT NULL`

This is the canonical stock ledger.

#### `stock_intakes`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `supplier_id INTEGER REFERENCES suppliers(id)`
- `invoice_number TEXT`
- `invoice_date TEXT`
- `subtotal_minor INTEGER NOT NULL`
- `shipping_cost_minor INTEGER NOT NULL DEFAULT 0`
- `total_minor INTEGER NOT NULL`
- `status TEXT NOT NULL`
- `notes TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `stock_intake_items`

- `id INTEGER PRIMARY KEY`
- `stock_intake_id INTEGER NOT NULL REFERENCES stock_intakes(id) ON DELETE RESTRICT`
- `product_id INTEGER REFERENCES products(id)`
- `product_name_snapshot TEXT NOT NULL`
- `quantity_received NUMERIC NOT NULL`
- `quantity_damaged NUMERIC NOT NULL DEFAULT 0`
- `purchase_price_minor INTEGER NOT NULL`
- `landing_cost_minor INTEGER NOT NULL`

### Customer returns

#### `returns`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `original_sale_id INTEGER NOT NULL REFERENCES sales(id)`
- `original_invoice_number TEXT NOT NULL`
- `customer_id INTEGER REFERENCES customers(id)`
- `total_return_value_minor INTEGER NOT NULL`
- `amount_refunded_minor INTEGER NOT NULL DEFAULT 0`
- `credit_to_customer_minor INTEGER NOT NULL DEFAULT 0`
- `reason TEXT`
- `notes TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `return_items`

- `id INTEGER PRIMARY KEY`
- `return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE RESTRICT`
- `product_id INTEGER REFERENCES products(id)`
- `product_name_snapshot TEXT NOT NULL`
- `quantity NUMERIC NOT NULL`
- `unit_price_minor INTEGER NOT NULL`
- `purchase_price_minor INTEGER NOT NULL`
- `restocked INTEGER NOT NULL DEFAULT 1`
- `line_total_minor INTEGER NOT NULL`

### Expenses

#### `expenses`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `description TEXT NOT NULL`
- `category TEXT NOT NULL`
- `amount_minor INTEGER NOT NULL CHECK(amount_minor > 0)`
- `expense_date TEXT NOT NULL`
- `receipt_path TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### Supplier payments

#### `supplier_payments`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `supplier_id INTEGER NOT NULL REFERENCES suppliers(id)`
- `amount_minor INTEGER NOT NULL CHECK(amount_minor > 0)`
- `method TEXT NOT NULL`
- `reference TEXT`
- `payment_date TEXT NOT NULL`
- `notes TEXT`
- `created_at TEXT NOT NULL`

### Proformas

#### `proforma_invoices`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `proforma_number TEXT UNIQUE NOT NULL`
- `customer_id INTEGER REFERENCES customers(id)`
- `subtotal_minor INTEGER NOT NULL`
- `discount_amount_minor INTEGER NOT NULL DEFAULT 0`
- `delivery_fee_minor INTEGER NOT NULL DEFAULT 0`
- `total_minor INTEGER NOT NULL`
- `status TEXT NOT NULL`
- `due_date TEXT`
- `notes TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `proforma_items`

- `id INTEGER PRIMARY KEY`
- `proforma_id INTEGER NOT NULL REFERENCES proforma_invoices(id) ON DELETE RESTRICT`
- `product_id INTEGER REFERENCES products(id)`
- `product_name_snapshot TEXT NOT NULL`
- `unit_price_minor INTEGER NOT NULL`
- `quantity NUMERIC NOT NULL`
- `line_total_minor INTEGER NOT NULL
`
### Bread

#### `bread_orders`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `order_number TEXT UNIQUE NOT NULL`
- `customer_id INTEGER REFERENCES customers(id)`
- `custom_name TEXT`
- `order_date TEXT NOT NULL`
- `pickup_date TEXT NOT NULL`
- `pickup_time TEXT`
- `quantity NUMERIC NOT NULL`
- `unit_price_minor INTEGER NOT NULL`
- `total_amount_minor INTEGER NOT NULL`
- `amount_paid_minor INTEGER NOT NULL DEFAULT 0`
- `remaining_amount_minor INTEGER NOT NULL DEFAULT 0`
- `payment_status TEXT NOT NULL`
- `pickup_status TEXT NOT NULL`
- `is_delivered INTEGER NOT NULL DEFAULT 0`
- `is_paid INTEGER NOT NULL DEFAULT 0`
- `notes TEXT`
- `transferred_to_customer_account INTEGER NOT NULL DEFAULT 0`
- `transferred_at TEXT`
- `sale_id INTEGER REFERENCES sales(id)`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

The current V108 code stores bread item arrays, but the base business case is a single bread quantity. Additional child lines may be introduced only when a genuine multi-item bread order is required.

### Audit and diagnostics

#### `audit_log`

- `id INTEGER PRIMARY KEY`
- `event_id TEXT UNIQUE NOT NULL`
- `event_type TEXT NOT NULL`
- `entity_type TEXT`
- `entity_id TEXT`
- `operation_id TEXT NOT NULL`
- `details_json TEXT`
- `created_at TEXT NOT NULL`

#### `daily_closings`

- `id INTEGER PRIMARY KEY`
- `uuid TEXT UNIQUE NOT NULL`
- `business_date TEXT UNIQUE NOT NULL`
- `opening_balance_minor INTEGER`
- `cash_sales_minor INTEGER NOT NULL`
- `cash_payments_minor INTEGER NOT NULL`
- `customer_collections_minor INTEGER NOT NULL`
- `expenses_minor INTEGER NOT NULL`
- `refunds_minor INTEGER NOT NULL`
- `closing_balance_minor INTEGER NOT NULL`
- `z_report_path TEXT`
- `closed_at TEXT NOT NULL`

## Mandatory indexes

At minimum:

- products(name)
- product_barcodes(barcode)
- products(category_id)
- products(selling_price_minor)
- products(is_active)
- customers(search_name)
- customers(phone)
- customers(outstanding_balance_minor)
- sales(invoice_number)
- sales(customer_id, created_at)
- sales(created_at)
- sales(payment_status)
- sale_items(sale_id)
- sale_items(product_id)
- sale_payments(sale_id)
- sale_payments(customer_id, payment_date)
- stock_movements(product_id, created_at)
- stock_intakes(supplier_id, invoice_date)
- returns(original_sale_id)
- expenses(expense_date)
- supplier_payments(supplier_id, payment_date)
- bread_orders(customer_id, pickup_date)
- audit_log(entity_type, entity_id, created_at)

## Integrity rules

Examples:

- sale total must equal item totals minus discount plus delivery fee
- paid amount must not exceed sale total
- remaining balance = total - paid
- cancelled sales cannot receive ordinary future payments
- return quantity cannot exceed eligible sold quantity without an explicit override workflow
- stock movement quantity_after must match the ledger calculation
- negative product quantity is prohibited unless a business setting explicitly enables it
- customer balance changes must be atomic with the corresponding financial event
- supplier balance changes must be atomic with intake/payment events
