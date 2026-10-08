-- Veloria PoS — Migration 0040 : actions ON DELETE explicites (RESTRICT).
-- #43 (0001:84,91,134,159 + 0018:15-17) et #60 (0001:134 + 0018:28 + 0011:4) :
-- plusieurs REFERENCES historiques n'ont aucune action explicite (NO ACTION
-- implicite). En SQLite, NO ACTION non différé se comporte comme RESTRICT,
-- mais l'intention doit être LISBLE dans le schéma pour tout futur lecteur.
--
-- Deux mécanismes (0001..0039 immuables) :
-- 1) Rebuild avec ON DELETE RESTRICT explicite pour les tables SANS
--    enfants : expenses (0011:4 supplier_id) et sale_fifo_consumption
--    (0018:28-31 : sale_id, sale_item_id, product_id, layer_id). Données +
--    index + CHECKs préservés (précédent 0025/0038).
-- 2) Gardes BEFORE DELETE explicites pour les tables PARENTES peuplées
--    (products, sales, sale_items, inventory_layers, categories, suppliers,
--    customers, stock_intakes, stock_intake_items) : un DROP TABLE sous
--    foreign_keys=ON ÉCHOUE dès que des lignes enfants existent (prouvé :
--    « FOREIGN KEY constraint failed », même avec defer_foreign_keys, et
--    legacy_alter_table est sans effet dans la transaction du runner) — le
--    rebuild casserait les montées de version avec données. Les gardes
--    ci-dessous appliquent la même sémantique RESTRICT, nommée et en FR.
-- Déterministe et rejouable : *_new + IF NOT EXISTS + triggers IF NOT EXISTS.

-- 1a. Rebuild expenses : supplier_id ON DELETE RESTRICT explicite.
CREATE TABLE IF NOT EXISTS expenses_new (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  expense_date TEXT NOT NULL,
  receipt_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE RESTRICT,
  payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('cash','cheque','transfer')),
  status TEXT NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid','pending')),
  reference TEXT,
  notes TEXT,
  operation_id TEXT
);

INSERT INTO expenses_new
  (id, uuid, description, category, amount_minor, expense_date, receipt_path,
   created_at, updated_at, supplier_id, payment_method, status, reference, notes, operation_id)
  SELECT id, uuid, description, category, amount_minor, expense_date, receipt_path,
   created_at, updated_at, supplier_id, payment_method, status, reference, notes, operation_id
  FROM expenses;

DROP TABLE expenses;

ALTER TABLE expenses_new RENAME TO expenses;

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON expenses(supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_operation ON expenses(operation_id);

-- 1b. Rebuild sale_fifo_consumption : ON DELETE RESTRICT explicite partout.
CREATE TABLE IF NOT EXISTS sale_fifo_consumption_new (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  layer_id INTEGER REFERENCES inventory_layers(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  created_at TEXT NOT NULL
);

INSERT INTO sale_fifo_consumption_new
  (id, sale_id, sale_item_id, product_id, layer_id, quantity, unit_cost_minor, created_at)
  SELECT id, sale_id, sale_item_id, product_id, layer_id, quantity, unit_cost_minor, created_at
  FROM sale_fifo_consumption;

DROP TABLE sale_fifo_consumption;

ALTER TABLE sale_fifo_consumption_new RENAME TO sale_fifo_consumption;

CREATE INDEX IF NOT EXISTS idx_consumption_sale ON sale_fifo_consumption(sale_id);
CREATE INDEX IF NOT EXISTS idx_consumption_layer ON sale_fifo_consumption(layer_id);
CREATE INDEX IF NOT EXISTS idx_consumption_item ON sale_fifo_consumption(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_consumption_product ON sale_fifo_consumption(product_id);

-- 2. Gardes RESTRICT explicites sur les parents peuplés (0001:84,91,134,159 +
-- 0018:15-17) : tout DELETE dur avec enfants est refusé en FR, jamais de
-- suppression en cascade silencieuse ni d'erreur technique brute.
CREATE TRIGGER IF NOT EXISTS trg_categories_no_delete_with_products
BEFORE DELETE ON categories
WHEN EXISTS (SELECT 1 FROM products WHERE products.category_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'Suppression impossible : des produits utilisent cette catégorie.');
END;

CREATE TRIGGER IF NOT EXISTS trg_suppliers_no_delete_with_products
BEFORE DELETE ON suppliers
WHEN EXISTS (SELECT 1 FROM products WHERE products.supplier_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'Suppression impossible : des produits sont liés à ce fournisseur.');
END;

CREATE TRIGGER IF NOT EXISTS trg_customers_no_delete_with_sales
BEFORE DELETE ON customers
WHEN EXISTS (SELECT 1 FROM sales WHERE sales.customer_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'Suppression impossible : des ventes sont liées à ce client.');
END;

CREATE TRIGGER IF NOT EXISTS trg_products_no_delete_with_items
BEFORE DELETE ON products
WHEN EXISTS (SELECT 1 FROM sale_items WHERE sale_items.product_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'Suppression impossible : ce produit figure dans des ventes.');
END;

CREATE TRIGGER IF NOT EXISTS trg_products_no_delete_with_layers
BEFORE DELETE ON products
WHEN EXISTS (SELECT 1 FROM inventory_layers WHERE inventory_layers.product_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'Suppression impossible : ce produit a des couches de stock.');
END;

CREATE TRIGGER IF NOT EXISTS trg_stock_intakes_no_delete_with_layers
BEFORE DELETE ON stock_intakes
WHEN EXISTS (SELECT 1 FROM inventory_layers WHERE inventory_layers.stock_intake_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'Suppression impossible : cette réception a des couches de stock.');
END;

CREATE TRIGGER IF NOT EXISTS trg_stock_intake_items_no_delete_with_layers
BEFORE DELETE ON stock_intake_items
WHEN EXISTS (SELECT 1 FROM inventory_layers WHERE inventory_layers.stock_intake_item_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'Suppression impossible : cette ligne de réception a des couches de stock.');
END;
