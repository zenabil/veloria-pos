-- Veloria PoS — Migration 0052 : snapshots de catégorie + coût des retours.
--
-- Objectif racine : un rapport par catégorie ne doit pas changer rétroactivement
-- quand un produit est recatégorisé, et le Dashboard doit pouvoir calculer un
-- résultat NET des retours (CA − coût des articles vendus + coût des articles
-- remis en stock).
--
-- - sale_items.category_id / return_items.category_id : catégorie figée au
--   moment de l'opération (pas la catégorie actuelle du produit).
-- - return_items.cogs_minor : coût FIFO des unités effectivement remises en
--   stock (0 si l'article n'est pas restocké : la perte reste dans le COGS).
-- - supplier_returns.staff_user_id : attribution manquante depuis 0046,
--   nécessaire au filtrage par auteur des retours fournisseur.
--
-- Backfill : meilleure information disponible (catégorie actuelle du produit,
-- coût d'achat snapshot × quantité). Aucune écriture rétroactive n'est
-- inventée pour les retours non restockés.
--
-- 0001..0051 restent IMMUABLES (AGENTS.md §12).

ALTER TABLE sale_items ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE return_items ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE return_items ADD COLUMN cogs_minor INTEGER NOT NULL DEFAULT 0 CHECK (cogs_minor >= 0);
ALTER TABLE supplier_returns ADD COLUMN staff_user_id INTEGER REFERENCES staff_users(id) ON DELETE SET NULL;

UPDATE sale_items
SET category_id = (
  SELECT p.category_id FROM products p WHERE p.id = sale_items.product_id
)
WHERE product_id IS NOT NULL AND category_id IS NULL;

UPDATE return_items
SET category_id = (
  SELECT p.category_id FROM products p WHERE p.id = return_items.product_id
)
WHERE product_id IS NOT NULL AND category_id IS NULL;

UPDATE return_items
SET cogs_minor = CAST(ROUND(purchase_price_minor * quantity) AS INTEGER)
WHERE restocked = 1 AND cogs_minor = 0;

-- Dashboard : filtres par plage + auteur sans fonction sur la colonne.
CREATE INDEX IF NOT EXISTS idx_sale_items_category ON sale_items(category_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_category ON return_items(category_id, return_id);
CREATE INDEX IF NOT EXISTS idx_sales_staff_created ON sales(staff_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sale_payments_date_staff ON sale_payments(payment_date, staff_user_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_date_staff ON supplier_payments(payment_date, staff_user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date_staff ON expenses(expense_date, staff_user_id);
CREATE INDEX IF NOT EXISTS idx_returns_created_status ON returns(created_at, status);
CREATE INDEX IF NOT EXISTS idx_returns_staff_created ON returns(staff_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_created_status ON supplier_returns(created_at, status);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_staff_created ON supplier_returns(staff_user_id, created_at);
