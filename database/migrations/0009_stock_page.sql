-- Veloria PoS — Migration 0009: stock page (plafond, référence mouvement, index).
-- `max_stock_level` (0 = aucun plafond) affiché et éditable (fiche produit) ;
-- `stock_movements.reference` pour tracer les ajustements/inventaires ;
-- index pour l'historique des mouvements par produit.
ALTER TABLE products ADD COLUMN max_stock_level NUMERIC NOT NULL DEFAULT 0 CHECK (max_stock_level >= 0);
ALTER TABLE stock_movements ADD COLUMN reference TEXT;

CREATE INDEX IF NOT EXISTS idx_movements_product_created ON stock_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements(movement_type);
