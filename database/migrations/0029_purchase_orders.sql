-- Veloria PoS — Migration 0029: bons de commande fournisseurs (P3).
-- Cycle : draft → ordered → partially_received → received (+ cancelled).
-- La réception crée des entrées de stock via receiveStockAtomic (même tx).
-- Non-destructive : tables + index + séquence, 0001..0028 immuables.
-- Déterministe : IF NOT EXISTS + ON CONFLICT DO NOTHING (rejouable).

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  order_number TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  subtotal_minor INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  total_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  expected_date TEXT,
  notes TEXT,
  operation_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  unit_code TEXT NOT NULL DEFAULT 'PIECE',
  quantity_ordered NUMERIC NOT NULL CHECK (quantity_ordered > 0),
  quantity_received NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(po_id);

INSERT INTO number_sequences (sequence_key, prefix, next_value, updated_at)
VALUES ('purchase_order', 'CMD', 1, '2026-01-01T00:00:00.000Z')
ON CONFLICT(sequence_key) DO NOTHING;
