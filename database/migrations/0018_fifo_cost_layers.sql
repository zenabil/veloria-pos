-- Veloria PoS — Migration 0018: couches de coût FIFO + coût historique des ventes.
-- Règle : FIFO pilote le COÛT du stock, jamais le prix de vente (indépendant).
-- - inventory_layers : une couche par apport (entrée, création, import, ajustement
--   positif, inventaire positif, restauration). Jamais de fusion destructrice.
-- - sale_fifo_consumption : traçabilité (vente, ligne, couche, quantité, coût).
-- - sale_items.cogs_minor : coût FIFO total de la ligne, figé à la vente
--   (les achats futurs ne réécrivent jamais l'historique).
-- Reprise : une couche d'ouverture par produit en stock (au dernier coût connu)
-- et cogs_minor = snapshot existant (approximation documentée, jamais recalculé
-- ensuite). Migrations précédentes immuables.

CREATE TABLE IF NOT EXISTS inventory_layers (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  stock_intake_id INTEGER REFERENCES stock_intakes(id),
  stock_intake_item_id INTEGER REFERENCES stock_intake_items(id),
  original_quantity NUMERIC NOT NULL CHECK (original_quantity > 0),
  remaining_quantity NUMERIC NOT NULL CHECK (remaining_quantity >= 0),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  purchase_date TEXT,
  reason TEXT NOT NULL DEFAULT 'intake' CHECK (reason IN ('opening','intake','product_create','import','adjust','inventory','return_restore','legacy','oversell')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_fifo_consumption (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  layer_id INTEGER REFERENCES inventory_layers(id),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  created_at TEXT NOT NULL
);

ALTER TABLE sale_items ADD COLUMN cogs_minor INTEGER NOT NULL DEFAULT 0 CHECK (cogs_minor >= 0);

CREATE INDEX IF NOT EXISTS idx_layers_product ON inventory_layers(product_id, id);
CREATE INDEX IF NOT EXISTS idx_layers_intake ON inventory_layers(stock_intake_id, product_id);
CREATE INDEX IF NOT EXISTS idx_consumption_sale ON sale_fifo_consumption(sale_id);
CREATE INDEX IF NOT EXISTS idx_consumption_layer ON sale_fifo_consumption(layer_id);
CREATE INDEX IF NOT EXISTS idx_consumption_item ON sale_fifo_consumption(sale_item_id);

-- Reprise : le stock en main devient une couche d'ouverture au dernier coût connu.
INSERT INTO inventory_layers (uuid, product_id, stock_intake_id, stock_intake_item_id, original_quantity, remaining_quantity, unit_cost_minor, purchase_date, reason, created_at)
SELECT lower(hex(randomblob(16))), id, NULL, NULL, quantity, quantity, purchase_price_minor, substr(created_at, 1, 10), 'opening', created_at
FROM products WHERE quantity > 0;

-- Reprise : le coût historique existant (snapshot au dernier coût) est figé tel quel.
UPDATE sale_items SET cogs_minor = CAST(ROUND(purchase_price_minor * quantity) AS INTEGER);
