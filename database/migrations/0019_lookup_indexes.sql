-- Veloria PoS — Migration 0019: index complémentaires de recherche (non-destructifs).
-- Contexte : certaines clés étrangères n'avaient pas d'index dédié
-- (parcours complets sur détail/suppression). Ajouts seuls, IF NOT EXISTS,
-- aucune donnée modifiée, migrations précédentes immuables.

CREATE INDEX IF NOT EXISTS idx_consumption_product ON sale_fifo_consumption(product_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer ON returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_return_items_product ON return_items(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_return_items_product ON supplier_return_items(product_id);
CREATE INDEX IF NOT EXISTS idx_bread_sale ON bread_orders(sale_id);
CREATE INDEX IF NOT EXISTS idx_proformas_converted_sale ON proforma_invoices(converted_sale_id);
