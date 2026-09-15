-- Veloria PoS — Migration 0001: initial schema
-- Logical DB: veloria POS DB | File: Veloria POS DB.sqlite
-- Rules: immutable after release. Money = INTEGER minor units (centimes DZD).

PRAGMA foreign_keys = OFF;

-- System
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  checksum TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS number_sequences (
  sequence_key TEXT PRIMARY KEY,
  prefix TEXT NOT NULL,
  next_value INTEGER NOT NULL CHECK (next_value > 0),
  updated_at TEXT NOT NULL
);

-- Company
CREATE TABLE IF NOT EXISTS company_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  uuid TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Algérie',
  phone TEXT,
  email TEXT,
  website TEXT,
  rc_number TEXT,
  nif TEXT,
  nis_number TEXT,
  ai_number TEXT,
  legal_form TEXT,
  invoice_prefix TEXT DEFAULT 'FAC',
  logo_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Catalog
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  initial_balance_minor INTEGER NOT NULL DEFAULT 0,
  outstanding_balance_minor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  unit_code TEXT NOT NULL DEFAULT 'PIECE',
  purchase_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price_minor >= 0),
  selling_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (selling_price_minor >= 0),
  quantity NUMERIC NOT NULL DEFAULT 0,
  min_stock_level NUMERIC NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  expiration_date TEXT,
  supplier_id INTEGER REFERENCES suppliers(id),
  stock_status TEXT NOT NULL DEFAULT 'in_stock' CHECK (stock_status IN ('in_stock','low_stock','out_of_stock')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at TEXT NOT NULL
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  search_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  settlement_day INTEGER CHECK (settlement_day IS NULL OR (settlement_day >= 1 AND settlement_day <= 31)),
  credit_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_minor >= 0),
  initial_balance_minor INTEGER NOT NULL DEFAULT 0,
  outstanding_balance_minor INTEGER NOT NULL DEFAULT 0,
  debt_status TEXT NOT NULL DEFAULT 'none' CHECK (debt_status IN ('none','due','overdue','over_limit')),
  is_over_limit INTEGER NOT NULL DEFAULT 0 CHECK (is_over_limit IN (0,1)),
  is_bread_client INTEGER NOT NULL DEFAULT 0 CHECK (is_bread_client IN (0,1)),
  bread_profile_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  discount_type TEXT CHECK (discount_type IS NULL OR discount_type IN ('none','percent','amount')),
  discount_value_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_value_minor >= 0),
  discount_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount_minor >= 0),
  delivery_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  amount_paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  remaining_balance_minor INTEGER NOT NULL DEFAULT 0 CHECK (remaining_balance_minor >= 0),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid','partial','unpaid')),
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash','cheque','transfer')),
  due_date TEXT,
  operation_id TEXT UNIQUE,
  is_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (is_cancelled IN (0,1)),
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (amount_paid_minor <= total_minor),
  CHECK (remaining_balance_minor = total_minor - amount_paid_minor),
  CHECK (total_minor = subtotal_minor - discount_amount_minor + delivery_fee_minor)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  product_id INTEGER REFERENCES products(id),
  product_name_snapshot TEXT NOT NULL,
  unit_code TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  purchase_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price_minor >= 0),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0)
);

CREATE TABLE IF NOT EXISTS sale_payments (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  customer_id INTEGER REFERENCES customers(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','cheque','transfer')),
  reference TEXT,
  payment_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

-- Inventory
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('sale_out','sale_cancel_in','intake_in','adjust_in','adjust_out','return_in','damage_out')),
  quantity_delta NUMERIC NOT NULL,
  quantity_after NUMERIC NOT NULL,
  unit_cost_minor INTEGER CHECK (unit_cost_minor IS NULL OR unit_cost_minor >= 0),
  related_entity_type TEXT,
  related_entity_id TEXT,
  reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_intakes (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  invoice_number TEXT,
  invoice_date TEXT,
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  shipping_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cost_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  status TEXT NOT NULL DEFAULT 'committed' CHECK (status IN ('draft','committed','cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_intake_items (
  id INTEGER PRIMARY KEY,
  stock_intake_id INTEGER NOT NULL REFERENCES stock_intakes(id) ON DELETE RESTRICT,
  product_id INTEGER REFERENCES products(id),
  product_name_snapshot TEXT NOT NULL,
  quantity_received NUMERIC NOT NULL CHECK (quantity_received > 0),
  quantity_damaged NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
  purchase_price_minor INTEGER NOT NULL CHECK (purchase_price_minor >= 0),
  landing_cost_minor INTEGER NOT NULL CHECK (landing_cost_minor >= 0)
);

-- Returns
CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  original_sale_id INTEGER NOT NULL REFERENCES sales(id),
  original_invoice_number TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  total_return_value_minor INTEGER NOT NULL CHECK (total_return_value_minor >= 0),
  amount_refunded_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_refunded_minor >= 0),
  credit_to_customer_minor INTEGER NOT NULL DEFAULT 0 CHECK (credit_to_customer_minor >= 0),
  reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS return_items (
  id INTEGER PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE RESTRICT,
  product_id INTEGER REFERENCES products(id),
  product_name_snapshot TEXT NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  purchase_price_minor INTEGER NOT NULL DEFAULT 0,
  restocked INTEGER NOT NULL DEFAULT 1 CHECK (restocked IN (0,1)),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0)
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  expense_date TEXT NOT NULL,
  receipt_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Supplier payments
CREATE TABLE IF NOT EXISTS supplier_payments (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','cheque','transfer')),
  reference TEXT,
  payment_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

-- Proformas
CREATE TABLE IF NOT EXISTS proforma_invoices (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  proforma_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  discount_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount_minor >= 0),
  delivery_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','converted','cancelled')),
  due_date TEXT,
  notes TEXT,
  converted_sale_id INTEGER REFERENCES sales(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proforma_items (
  id INTEGER PRIMARY KEY,
  proforma_id INTEGER NOT NULL REFERENCES proforma_invoices(id) ON DELETE RESTRICT,
  product_id INTEGER REFERENCES products(id),
  product_name_snapshot TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0)
);

-- Bread
CREATE TABLE IF NOT EXISTS bread_orders (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  order_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  custom_name TEXT,
  order_date TEXT NOT NULL,
  pickup_date TEXT NOT NULL,
  pickup_time TEXT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor >= 0),
  amount_paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  remaining_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (remaining_amount_minor >= 0),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid','partial','unpaid')),
  pickup_status TEXT NOT NULL DEFAULT 'pending' CHECK (pickup_status IN ('pending','ready','delivered','cancelled')),
  is_delivered INTEGER NOT NULL DEFAULT 0 CHECK (is_delivered IN (0,1)),
  is_paid INTEGER NOT NULL DEFAULT 0 CHECK (is_paid IN (0,1)),
  notes TEXT,
  transferred_to_customer_account INTEGER NOT NULL DEFAULT 0 CHECK (transferred_to_customer_account IN (0,1)),
  transferred_at TEXT,
  sale_id INTEGER REFERENCES sales(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (amount_paid_minor <= total_amount_minor)
);

-- Audit + closings
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  operation_id TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_closings (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  business_date TEXT UNIQUE NOT NULL,
  opening_balance_minor INTEGER,
  cash_sales_minor INTEGER NOT NULL,
  cash_payments_minor INTEGER NOT NULL,
  customer_collections_minor INTEGER NOT NULL,
  expenses_minor INTEGER NOT NULL,
  refunds_minor INTEGER NOT NULL,
  closing_balance_minor INTEGER NOT NULL,
  z_report_path TEXT,
  closed_at TEXT NOT NULL
);

-- Seed sequences (prefixes FR)
INSERT INTO number_sequences (sequence_key, prefix, next_value, updated_at)
VALUES
  ('sale_invoice', 'FAC', 1, '2026-01-01T00:00:00.000Z'),
  ('proforma', 'PRO', 1, '2026-01-01T00:00:00.000Z'),
  ('bread_order', 'PAIN', 1, '2026-01-01T00:00:00.000Z')
ON CONFLICT(sequence_key) DO NOTHING;
