-- Veloria PoS — Migration 0010: supplier returns + return numbers/statuses.
-- Customer returns gain a stable number, a lifecycle status and a refund
-- method (existing rows keep their behavior: validated, no method).
-- Supplier returns mirror them in dedicated tables (own numbering).
ALTER TABLE returns ADD COLUMN return_number TEXT;
ALTER TABLE returns ADD COLUMN status TEXT NOT NULL DEFAULT 'validated'
  CHECK (status IN ('validated','partially_refunded','refunded','cancelled'));
ALTER TABLE returns ADD COLUMN refund_method TEXT
  CHECK (refund_method IS NULL OR refund_method IN ('cash','cheque','transfer'));

UPDATE returns SET return_number = 'RET-C-' || printf('%05d', id) WHERE return_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_number ON returns(return_number);

ALTER TABLE return_items ADD COLUMN condition TEXT NOT NULL DEFAULT 'good'
  CHECK (condition IN ('good','defective'));
ALTER TABLE return_items ADD COLUMN stock_before NUMERIC;
ALTER TABLE return_items ADD COLUMN stock_after NUMERIC;

CREATE TABLE IF NOT EXISTS supplier_returns (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  return_number TEXT UNIQUE,
  stock_intake_id INTEGER NOT NULL REFERENCES stock_intakes(id),
  intake_invoice_number TEXT,
  supplier_id INTEGER REFERENCES suppliers(id),
  total_return_value_minor INTEGER NOT NULL CHECK (total_return_value_minor >= 0),
  amount_recovered_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_recovered_minor >= 0),
  recovery_method TEXT CHECK (recovery_method IS NULL OR recovery_method IN ('cash','cheque','transfer')),
  reason TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'validated'
    CHECK (status IN ('validated','partially_refunded','refunded','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (amount_recovered_minor <= total_return_value_minor)
);

CREATE TABLE IF NOT EXISTS supplier_return_items (
  id INTEGER PRIMARY KEY,
  supplier_return_id INTEGER NOT NULL REFERENCES supplier_returns(id) ON DELETE RESTRICT,
  product_id INTEGER REFERENCES products(id),
  product_name_snapshot TEXT NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  purchase_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good','defective')),
  stock_before NUMERIC,
  stock_after NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier ON supplier_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_intake ON supplier_returns(stock_intake_id);
