-- Veloria PoS — Migration 0025: return_number MUST NEVER BE NULL (H-2).
-- Root cause: 0024 dropped the impossible BEFORE INSERT triggers (number
-- derived from id AFTER insert) and relied on UNIQUE as guarantee — but
-- SQLite UNIQUE allows repeated NULLs, so return_number = NULL stayed legal.
-- Fix (new migration only, 0001..0024 immutable):
--   1. Deterministic backfill of any legacy NULL (RET-C/S-%05d by id, never
--      reusing a historical number; id-derived so concurrent-safe via UNIQUE).
--   2. Table rebuilds with return_number TEXT NOT NULL (SQLite has no
--      ADD CONSTRAINT) for BOTH returns and supplier_returns, preserving:
--      data, FKs, CHECKs, defaults, UNIQUE, sequences, compatibility.
--   3. Belt-and-suspenders triggers rejecting NULL on INSERT/UPDATE even if
--      a future tool bypasses the schema (defense in depth, explicit FR).
-- Non-destructive: no row deleted, child tables untouched, indexes recreated.
-- Deterministic: same input rows => same output numbers. Fresh/empty/v13..v24
-- compatible (backfill is a no-op when no NULLs; rebuild preserves all rows).

-- 1. Backfill legacy NULLs deterministically (id-derived, no reuse).
UPDATE returns SET return_number = 'RET-C-' || printf('%05d', id) WHERE return_number IS NULL;
UPDATE supplier_returns SET return_number = 'RET-S-' || printf('%05d', id) WHERE return_number IS NULL;

-- 2a. Rebuild returns with NOT NULL (full column set 0001+0010).
CREATE TABLE IF NOT EXISTS returns_new (
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
  updated_at TEXT NOT NULL,
  return_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'validated' CHECK (status IN ('validated','partially_refunded','refunded','cancelled')),
  refund_method TEXT CHECK (refund_method IS NULL OR refund_method IN ('cash','cheque','transfer'))
);

INSERT INTO returns_new
  (id, uuid, original_sale_id, original_invoice_number, customer_id,
   total_return_value_minor, amount_refunded_minor, credit_to_customer_minor,
   reason, notes, created_at, updated_at, return_number, status, refund_method)
  SELECT id, uuid, original_sale_id, original_invoice_number, customer_id,
   total_return_value_minor, amount_refunded_minor, credit_to_customer_minor,
   reason, notes, created_at, updated_at, return_number, status, refund_method
  FROM returns;

DROP TABLE returns;

ALTER TABLE returns_new RENAME TO returns;

CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_number ON returns(return_number);
CREATE INDEX IF NOT EXISTS idx_returns_customer ON returns(customer_id);

-- 2b. Rebuild supplier_returns with NOT NULL (full column set 0010+0023).
CREATE TABLE IF NOT EXISTS supplier_returns_new (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  return_number TEXT NOT NULL UNIQUE,
  stock_intake_id INTEGER NOT NULL REFERENCES stock_intakes(id),
  intake_invoice_number TEXT,
  supplier_id INTEGER REFERENCES suppliers(id),
  total_return_value_minor INTEGER NOT NULL CHECK (total_return_value_minor >= 0),
  amount_recovered_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_recovered_minor >= 0),
  recovery_method TEXT CHECK (recovery_method IS NULL OR recovery_method IN ('cash','cheque','transfer')),
  reason TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'validated' CHECK (status IN ('validated','partially_refunded','refunded','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  layers_json TEXT,
  CHECK (amount_recovered_minor <= total_return_value_minor)
);

INSERT INTO supplier_returns_new
  (id, uuid, return_number, stock_intake_id, intake_invoice_number, supplier_id,
   total_return_value_minor, amount_recovered_minor, recovery_method, reason,
   notes, status, created_at, updated_at, layers_json)
  SELECT id, uuid, return_number, stock_intake_id, intake_invoice_number, supplier_id,
   total_return_value_minor, amount_recovered_minor, recovery_method, reason,
   notes, status, created_at, updated_at, layers_json
  FROM supplier_returns;

DROP TABLE supplier_returns;

ALTER TABLE supplier_returns_new RENAME TO supplier_returns;

CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier ON supplier_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_intake ON supplier_returns(stock_intake_id);

-- 3. Defense in depth: explicit NULL rejection with FR messages even if a
-- future tool attempts to bypass the schema (triggers survive ORM/raw SQL).
CREATE TRIGGER IF NOT EXISTS trg_returns_number_notnull_ins
BEFORE INSERT ON returns
WHEN NEW.return_number IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Numéro de retour requis.');
END;

CREATE TRIGGER IF NOT EXISTS trg_returns_number_notnull_upd
BEFORE UPDATE OF return_number ON returns
WHEN NEW.return_number IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Numéro de retour requis.');
END;

CREATE TRIGGER IF NOT EXISTS trg_supplier_returns_number_notnull_ins
BEFORE INSERT ON supplier_returns
WHEN NEW.return_number IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Numéro de retour fournisseur requis.');
END;

CREATE TRIGGER IF NOT EXISTS trg_supplier_returns_number_notnull_upd
BEFORE UPDATE OF return_number ON supplier_returns
WHEN NEW.return_number IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Numéro de retour fournisseur requis.');
END;
