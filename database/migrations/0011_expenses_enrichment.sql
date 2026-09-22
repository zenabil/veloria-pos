-- Veloria PoS — Migration 0011: expense file enrichment (page Dépenses).
-- Supplier link, payment method, paid/pending status, reference and notes.
-- Existing rows keep their behavior (paid, no method).
ALTER TABLE expenses ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id);
ALTER TABLE expenses ADD COLUMN payment_method TEXT
  CHECK (payment_method IS NULL OR payment_method IN ('cash','cheque','transfer'));
ALTER TABLE expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'paid'
  CHECK (status IN ('paid','pending'));
ALTER TABLE expenses ADD COLUMN reference TEXT;
ALTER TABLE expenses ADD COLUMN notes TEXT;

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON expenses(supplier_id);
