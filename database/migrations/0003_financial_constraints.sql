-- Veloria PoS — Migration 0003: financial hardening views + triggers.
-- Keeps CHECK constraints from 0001; adds helper views for diagnostics.

-- Recomputable customer balance verification view (ledger-based, diagnostic only).
CREATE VIEW IF NOT EXISTS v_customer_balance_check AS
SELECT
  c.id AS customer_id,
  c.outstanding_balance_minor AS stored_balance_minor,
  c.initial_balance_minor
    + COALESCE((SELECT SUM(s.remaining_balance_minor) FROM sales s WHERE s.customer_id = c.id AND s.is_cancelled = 0), 0)
    - COALESCE((SELECT SUM(sp.amount_minor) FROM sale_payments sp WHERE sp.customer_id = c.id AND sp.sale_id IS NULL), 0)
    AS note_ledger_hint_minor
FROM customers c;

-- Daily sales aggregate (used by dashboard / Z report, SQL-side aggregation).
CREATE VIEW IF NOT EXISTS v_daily_sales AS
SELECT
  substr(s.created_at, 1, 10) AS day,
  COUNT(*) AS sales_count,
  SUM(s.total_minor) AS total_minor,
  SUM(s.amount_paid_minor) AS paid_minor,
  SUM(s.remaining_balance_minor) AS credit_minor
FROM sales s
WHERE s.is_cancelled = 0
GROUP BY substr(s.created_at, 1, 10);

-- Prevent direct UPDATE that would break sale arithmetic outside a transaction:
-- (defense in depth; application layer remains the transaction owner).
CREATE TRIGGER IF NOT EXISTS trg_sales_no_negative_total
BEFORE UPDATE ON sales
WHEN NEW.total_minor < 0 OR NEW.amount_paid_minor > NEW.total_minor
BEGIN
  SELECT RAISE(ABORT, 'SALE_ARITHMETIC_VIOLATION');
END;
