-- Veloria PoS — Migration 0012: pain (statut riche, type, téléphone, moyen),
-- proforma (conditions), historique des calculs zakat.
ALTER TABLE bread_orders ADD COLUMN bread_type TEXT NOT NULL DEFAULT 'Pain';
ALTER TABLE bread_orders ADD COLUMN custom_phone TEXT;
ALTER TABLE bread_orders ADD COLUMN payment_method TEXT
  CHECK (payment_method IS NULL OR payment_method IN ('cash','cheque','transfer'));
ALTER TABLE bread_orders ADD COLUMN order_status TEXT NOT NULL DEFAULT 'new'
  CHECK (order_status IN ('new','confirmed','preparing','ready','delivered','cancelled'));

-- Reprise : l'ancien cycle (pending/ready/delivered/cancelled) se projette
-- sur le nouveau (le reste devient 'new').
UPDATE bread_orders SET order_status = CASE pickup_status
  WHEN 'ready' THEN 'ready'
  WHEN 'delivered' THEN 'delivered'
  WHEN 'cancelled' THEN 'cancelled'
  ELSE 'new'
END WHERE order_status = 'new';

ALTER TABLE proforma_invoices ADD COLUMN terms TEXT;

CREATE TABLE IF NOT EXISTS zakat_calculations (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  hijri_year TEXT NOT NULL,
  calc_date TEXT NOT NULL,
  cash_minor INTEGER NOT NULL DEFAULT 0 CHECK (cash_minor >= 0),
  bank_minor INTEGER NOT NULL DEFAULT 0 CHECK (bank_minor >= 0),
  stock_minor INTEGER NOT NULL DEFAULT 0 CHECK (stock_minor >= 0),
  receivables_minor INTEGER NOT NULL DEFAULT 0 CHECK (receivables_minor >= 0),
  other_minor INTEGER NOT NULL DEFAULT 0 CHECK (other_minor >= 0),
  liabilities_minor INTEGER NOT NULL DEFAULT 0 CHECK (liabilities_minor >= 0),
  net_minor INTEGER NOT NULL,
  nisab_minor INTEGER NOT NULL DEFAULT 0 CHECK (nisab_minor >= 0),
  rate_percent NUMERIC NOT NULL CHECK (rate_percent > 0),
  zakat_minor INTEGER NOT NULL DEFAULT 0 CHECK (zakat_minor >= 0),
  status TEXT NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated','paid')),
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bread_status ON bread_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_bread_pickup ON bread_orders(pickup_date);
