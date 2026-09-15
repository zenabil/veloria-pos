-- Veloria PoS — Migration 0004: standalone customer payments (sale_id nullable).
-- Context: the 0003 diagnostic view v_customer_balance_check already reads
-- `sale_payments` rows with `sale_id IS NULL` (account-level collections with no
-- linked sale), but 0001 declared `sale_id NOT NULL`, forcing callers to fake a
-- sale id. This migration aligns the schema with the domain:
--   - sale_id SET  -> payment allocated to that sale (validated by FK);
--   - sale_id NULL -> standalone collection on the customer account;
--   - (sale_id NULL AND customer_id NULL) is meaningless and rejected app-side.
-- SQLite refuses DROP TABLE while a view depends on it, so drop the 0003
-- diagnostic view first and recreate it identically after the rebuild
-- (0003 itself stays immutable).
DROP VIEW IF EXISTS v_customer_balance_check;

CREATE TABLE IF NOT EXISTS sale_payments_new (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  sale_id INTEGER REFERENCES sales(id) ON DELETE RESTRICT,
  customer_id INTEGER REFERENCES customers(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','cheque','transfer')),
  reference TEXT,
  payment_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO sale_payments_new
  (id, uuid, sale_id, customer_id, amount_minor, method, reference, payment_date, notes, created_at)
  SELECT id, uuid, sale_id, customer_id, amount_minor, method, reference, payment_date, notes, created_at
  FROM sale_payments;

DROP TABLE sale_payments;

ALTER TABLE sale_payments_new RENAME TO sale_payments;

-- Recreate the 0002 indexes dropped with the old table.
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_customer_date ON sale_payments(customer_id, payment_date);

-- Recreate the 0003 diagnostic view identically (now valid: sale_id IS NULL
-- rows are legal standalone collections).
CREATE VIEW IF NOT EXISTS v_customer_balance_check AS
SELECT
  c.id AS customer_id,
  c.outstanding_balance_minor AS stored_balance_minor,
  c.initial_balance_minor
    + COALESCE((SELECT SUM(s.remaining_balance_minor) FROM sales s WHERE s.customer_id = c.id AND s.is_cancelled = 0), 0)
    - COALESCE((SELECT SUM(sp.amount_minor) FROM sale_payments sp WHERE sp.customer_id = c.id AND sp.sale_id IS NULL), 0)
    AS note_ledger_hint_minor
FROM customers c;
