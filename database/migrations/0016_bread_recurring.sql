-- Veloria PoS — Migration 0016: pain simplifié + commande récurrente quotidienne.
-- Ajoute le nom libre de commande (order_name) et le flag de récurrence journalière
-- (is_recurring). Aucune modification des migrations précédentes (immuables).
ALTER TABLE bread_orders ADD COLUMN order_name TEXT;
ALTER TABLE bread_orders ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0,1));

-- Reprise : le nom affiché devient l'ancien type de pain.
UPDATE bread_orders SET order_name = bread_type WHERE order_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_bread_recurring ON bread_orders(is_recurring);
